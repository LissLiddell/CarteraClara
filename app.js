import { AGENTS } from "./domain.js";
const actors = {
  supervisor: { id: "elena", name: "Elena Ríos", role: "supervisor" },
  lia: { id: "lia", name: "Lía Torres", role: "agent" },
  marco: { id: "marco", name: "Marco Gil", role: "agent" },
  finance: { id: "vera", name: "Vera Solís", role: "finance" }
};

let state = { accounts: [], selectedAccountId: null };
let roleKey = "supervisor";
let simulatedAsOf = null;
const app = document.getElementById("app");
const roleSelect = document.getElementById("role-select");
const message = document.getElementById("message");
const caseList = document.getElementById("case-list");
const previewDate = document.getElementById("preview-date");
const useToday = document.getElementById("use-today");
const resetDemo = document.getElementById("reset-demo");
const prepareOverdue = document.getElementById("prepare-overdue");

function money(cents) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
}

function safe(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function cents(input) {
  const value = String(input).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Escribe un importe válido, por ejemplo 2500.00.");
  const [units, decimal = ""] = value.split(".");
  const result = Number(units) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error("El importe debe ser mayor a cero.");
  return result;
}

function todayPlusOne() {
  const day = new Date(`${state.todayDate ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

function followUpAlert(account) {
  const open = account.promises.find((promise) =>
    (promise.status === "PENDING" || promise.status === "PARTIAL") && promise.nextFollowUpDate);
  if (!open) return null;
  const viewedDate = state.asOfDate ?? state.todayDate;
  if (open.nextFollowUpDate < viewedDate) return { label: "Gestión atrasada", tone: "late", date: open.nextFollowUpDate };
  if (open.nextFollowUpDate === viewedDate) return { label: "Gestión para hoy", tone: "today", date: open.nextFollowUpDate };
  return { label: "Próxima gestión", tone: "future", date: open.nextFollowUpDate };
}

function status(account) {
  if (account.balanceCents === 0) return ["Liquidada", "paid"];
  const followUp = followUpAlert(account);
  if (followUp && followUp.tone !== "future") return [followUp.label, `followup-${followUp.tone}`];
  if (account.promises.some((promise) => promise.isOverdue)) return ["Promesa vencida", "overdue"];
  if (account.payments.length) return ["Con abono parcial", "partial"];
  if (account.promises.length) return [account.promises.at(-1).dueDate ? "Promesa registrada" : "Compromiso sin fecha", "promised"];
  if (account.contacts.length) return ["En seguimiento", "contacted"];
  if (account.assignedTo) return ["Asignada", "assigned"];
  return ["Sin asignar", "unassigned"];
}

function eventLabel(event) {
  if (event.type === "SCHEDULE_FOLLOW_UP") return "SEGUIMIENTO AGENDADO";
  if (event.kind === "OVERDUE_FOLLOWUP") return "SEGUIMIENTO VENCIDO";
  if (event.kind === "DATED_PROMISE") return "PROMESA CON FECHA";
  if (event.kind === "UNDATED_PROMISE") return "COMPROMISO SIN FECHA";
  if (event.kind === "DATE_CONFIRMED") return "FECHA ACORDADA";
  if (event.kind === "FOLLOW_UP") return "REQUIERE SEGUIMIENTO";
  if (event.kind === "NO_AGREEMENT") return "SIN ACUERDO";
  if (event.kind === "INDEPENDENT_PAYMENT") return "ABONO INDEPENDIENTE";
  if (event.kind === "MIXED_PAYMENT") return "ABONO MIXTO";
  if (event.kind === "PROMISE_PAYMENT") return "ABONO A PROMESA";
  return { ASSIGN: "ASIGNACIÓN", CONTACT: "CONTACTO", PROMISE: "PROMESA", PAYMENT: "ABONO" }[event.type] ?? "MOVIMIENTO";
}

function eventTone(event) {
  if (event.type === "SCHEDULE_FOLLOW_UP") return "scheduled";
  if (event.kind === "OVERDUE_FOLLOWUP") return "overdue";
  if (["DATED_PROMISE", "UNDATED_PROMISE", "DATE_CONFIRMED"].includes(event.kind)) return "promise";
  if (event.kind === "FOLLOW_UP") return "scheduled";
  if (event.kind === "NO_AGREEMENT") return "contact";
  if (event.kind === "INDEPENDENT_PAYMENT") return "independent";
  if (event.kind === "MIXED_PAYMENT") return "mixed";
  if (event.kind === "PROMISE_PAYMENT") return "linked";
  return { ASSIGN: "assign", CONTACT: "contact", PROMISE: "promise", PAYMENT: "linked" }[event.type] ?? "assign";
}

function movementSummary(account, event) {
  const payment = account.payments.find((item) => item.sequence === event.sequence);
  if (payment) {
    const extra = payment.amountCents - payment.appliedToPromiseCents;
    const paidThroughEvent = account.payments
      .filter((item) => item.sequence <= event.sequence)
      .reduce((sum, item) => sum + item.amountCents, 0);
    const parts = [`${money(payment.amountCents)} recibido`];
    if (payment.appliedToPromiseCents) parts.push(`${money(payment.appliedToPromiseCents)} al compromiso`);
    if (extra) parts.push(`${money(extra)} independiente`);
    parts.push(`saldo ${money(account.openingBalanceCents - paidThroughEvent)}`);
    return parts.join(" · ");
  }
  const contact = account.contacts.find((item) => item.sequence === event.sequence);
  if (contact) {
    const promise = account.promises.find((item) => item.sequence === event.sequence);
    const result = contact.outcome === "NO_ANSWER" ? "Sin respuesta"
      : promise ? `${money(promise.amountCents)} acordados${promise.dueDate ? ` para ${promise.dueDate}` : ", sin fecha"}`
      : contact.disposition === "DATE_CONFIRMED" ? `Fecha acordada: ${event.detail.match(/fecha de pago (\d{4}-\d{2}-\d{2})/)?.[1] ?? "ver nota"}`
      : contact.disposition === "FOLLOW_UP" ? "Requiere seguimiento"
      : contact.disposition === "NO_AGREEMENT" ? "Sin acuerdo"
      : "Contacto efectivo";
    return contact.note ? `${result} · ${contact.note}` : result;
  }
  const promise = account.promises.find((item) => item.sequence === event.sequence);
  if (promise) return `${money(promise.amountCents)} acordados${promise.dueDate ? ` para ${promise.dueDate}` : ", sin fecha"}`;
  if (event.type === "SCHEDULE_FOLLOW_UP") {
    const scheduledDate = event.detail.match(/(?:para| a) (\d{4}-\d{2}-\d{2})/)?.[1];
    if (scheduledDate) return `Próxima gestión: ${scheduledDate}`;
  }
  return event.detail.replace(/\.$/, "");
}

function progress(account) {
  const steps = [
    ["01", "Asignación", Boolean(account.assignedTo)],
    ["02", "Contacto", account.contacts.length > 0],
    ["03", "Compromiso", account.promises.length > 0],
    ["04", "Abono", account.payments.length > 0]
  ];
  return `<ol class="steps" aria-label="Progreso del flujo">${steps.map(([number, label, done]) =>
    `<li class="${done ? "done" : ""}"><span class="step-number">${number}</span><strong>${label}</strong><span class="step-marker" aria-label="${done ? "Completado" : "Pendiente"}">${done ? "✓" : "·"}</span></li>`
  ).join("")}</ol>`;
}

function actionPanel(account, actor) {
  if (actor.role === "supervisor") {
    if (account.balanceCents === 0) return `<div class="notice">Esta cuenta ya está liquidada. Elige una cuenta sin asignar en la cartera de la izquierda para iniciar otro caso.</div>`;
    if (account.contacts.length) return `<div class="notice">Esta cuenta ya tiene seguimiento. Para asignar otra, selecciónala en la cartera de la izquierda.</div>`;
    return `<form data-action="ASSIGN" class="form-stack">
      <label for="agent-id">Asignar responsable</label>
      <select name="agentId" id="agent-id" required>
        <option value="">Elige un agente</option>
        ${AGENTS.map((agent) => `<option value="${agent.id}" ${account.assignedTo === agent.id ? "selected" : ""}>${safe(agent.name)}</option>`).join("")}
      </select>
      <button class="primary" type="submit">${account.assignedTo ? "Cambiar asignación" : "Asignar cuenta"}</button>
    </form>`;
  }

  if (actor.role === "agent") {
    if (account.assignedTo !== actor.id) return `<div class="notice">No tienes cuentas asignadas en esta demo. Cambia a supervisora para asignarla.</div>`;
    if (account.balanceCents === 0) return `<div class="notice">Esta cuenta está liquidada. Su expediente y bitácora permanecen disponibles para consulta.</div>`;
    const active = account.promises.find((promise) => promise.status !== "FULFILLED");
    const latest = account.contacts.at(-1);
    const lastResult = latest?.outcome === "NO_ANSWER" ? "No hubo respuesta"
      : latest?.disposition === "DATED_PROMISE" ? "Promesa con fecha"
      : latest?.disposition === "UNDATED_PROMISE" ? "Compromiso sin fecha"
      : latest?.disposition === "DATE_CONFIRMED" ? "Fecha acordada para el compromiso"
      : latest?.disposition === "FOLLOW_UP" ? "Requiere seguimiento"
      : latest?.disposition === "NO_AGREEMENT" ? "Sin acuerdo"
      : latest ? "Contacto previo sin clasificación" : "Ninguno";
    return `<div class="form-stack" data-contact-workflow>
      <p class="contact-record">Último contacto guardado: <strong>${lastResult}</strong></p>
      <form data-action="CONTACT" class="form-stack subform">
        <h3>${active?.isOverdue ? "Seguimiento de promesa vencida" : "Registrar contacto"}</h3>
        <label for="outcome">Resultado</label>
        <select id="outcome" name="outcome" required>
          <option value="">Selecciona qué pasó</option>
          <option value="CONNECTED">Hablé con el cliente</option>
          <option value="NO_ANSWER">No hubo respuesta</option>
        </select>
        <div data-contact-disposition hidden>
          <label for="disposition">¿Cómo terminó la conversación?</label>
          <select id="disposition" name="disposition" disabled>
            <option value="">Elige el resultado concreto</option>
            ${active ? "" : `<option value="DATED_PROMISE">Acordó monto y fecha de pago</option>
            <option value="UNDATED_PROMISE">Acordó monto, sin fecha de pago</option>`}
            ${active && !active.dueDate ? `<option value="DATE_CONFIRMED">Acordó fecha para el compromiso existente</option>` : ""}
            <option value="FOLLOW_UP">Requiere seguimiento</option>
            <option value="NO_AGREEMENT">No se llegó a un acuerdo</option>
          </select>
          ${active ? `<p class="form-help">Ya hay un compromiso abierto. ${active.dueDate ? "Registra el seguimiento sin crear otro." : "Puedes acordar una fecha para ese mismo monto o registrar otro resultado."}</p>` : ""}
        </div>
        <div data-contact-amount hidden>
          <label for="promise-amount">Importe acordado (MXN)</label>
          <input id="promise-amount" name="amount" inputmode="decimal" placeholder="4000.00" disabled />
        </div>
        <div data-contact-date hidden>
          <label for="promise-date">Fecha de pago acordada</label>
          <input id="promise-date" name="dueDate" type="date" min="${todayPlusOne()}" disabled />
        </div>
        <label for="contact-note">Nota breve</label>
        <textarea id="contact-note" name="note" maxlength="240" rows="3" placeholder="Ej. Revisamos el saldo y acordamos seguimiento." required></textarea>
        <p class="form-help" data-contact-guidance aria-live="polite">Selecciona qué ocurrió. Si hubo acuerdo, registra también el monto y, cuando exista, la fecha.</p>
        <div class="form-actions">
          <button class="primary" type="submit">Guardar resultado del contacto</button>
        </div>
      </form>
      ${active
        ? `<div class="notice ${active.isOverdue ? "overdue-notice" : ""}">${active.isOverdue
          ? `La promesa venció el ${safe(active.dueDate)} y faltan ${money(active.remainingCents)}. Agenda la próxima gestión o registra un contacto; los abonos posteriores seguirán cubriéndola.`
          : active.dueDate ? "Ya hay una promesa abierta. Se actualizará cuando Finanzas confirme un abono." : "Hay un compromiso de monto sin fecha. No vencerá automáticamente; Finanzas podrá aplicarle abonos."}</div>`
        : `<div class="notice">Si el cliente acuerda un monto, registra el compromiso en el mismo contacto. También puedes cerrar la llamada sin acuerdo.</div>`}
      ${active?.isOverdue ? `<form data-action="SCHEDULE_FOLLOW_UP" class="form-stack subform followup-form">
        <h3>${active.nextFollowUpDate ? "Reprogramar próxima gestión" : "Agendar próxima gestión"}</h3>
        <p class="form-help">Esto no cambia la fecha prometida de pago ni el saldo. Quedará registrado en la bitácora.</p>
        <label for="next-follow-up-date">Nueva fecha de seguimiento</label>
        <input id="next-follow-up-date" name="nextFollowUpDate" type="date" min="${todayPlusOne()}" value="${active.nextFollowUpDate ? safe(active.nextFollowUpDate) : ""}" required />
        <button class="primary" type="submit">${active.nextFollowUpDate ? "Guardar nueva fecha" : "Agendar seguimiento"}</button>
      </form>` : ""}
    </div>`;
  }

  if (!account.assignedTo) return `<div class="notice">La supervisora debe asignar esta cuenta antes de registrar abonos.</div>`;
  if (account.balanceCents === 0) return `<div class="notice">La cuenta ya está liquidada. Sus abonos permanecen disponibles en la bitácora.</div>`;
  const activePromise = account.promises.find((promise) => promise.status === "PENDING" || promise.status === "PARTIAL");
  return `<form data-action="PAYMENT" class="form-stack">
    <h3>Confirmar abono recibido</h3>
    <p class="payment-target">Abono para <strong>${safe(account.id)} · ${safe(account.client)}</strong></p>
    <p class="payment-linkage ${activePromise ? "linked" : "independent"}"><strong>${activePromise ? `${activePromise.dueDate ? "Promesa" : "Compromiso sin fecha"} ${safe(activePromise.id)} abierto` : "Abono independiente"}</strong>${activePromise ? "El pago se aplicará a ese compromiso hasta cubrirlo; cualquier sobrante quedará como abono adicional." : "No hay compromiso abierto. El pago quedará ligado a esta cuenta, no al intento de contacto."}</p>
    <label for="payment-amount">Importe recibido (MXN)</label>
    <input id="payment-amount" name="amount" inputmode="decimal" placeholder="2500.00" required />
    <label for="payment-reference">Referencia única</label>
    <input id="payment-reference" name="reference" maxlength="40" placeholder="DEP-2026-001" required />
    <p class="form-help">La referencia evita registrar el mismo pago dos veces. Aquí solo se simula una confirmación.</p>
    <button class="primary" type="submit">Confirmar abono para esta cuenta</button>
  </form>`;
}

function render() {
  const actor = actors[roleKey];
  previewDate.min = state.todayDate ?? "";
  previewDate.value = state.asOfDate ?? "";
  useToday.hidden = !state.isDatePreview;
  resetDemo.disabled = Boolean(state.isDatePreview);
  resetDemo.hidden = !state.demoToolsEnabled;
  prepareOverdue.hidden = !state.demoToolsEnabled;
  prepareOverdue.disabled = Boolean(state.isDatePreview);
  const visibleAccounts = actor.role === "agent"
    ? state.accounts.filter((item) => item.assignedTo === actor.id)
    : actor.role === "finance"
      ? state.accounts.filter((item) => Boolean(item.assignedTo))
      : state.accounts;
  if (!visibleAccounts.some((item) => item.id === state.selectedAccountId)) {
    state.selectedAccountId = visibleAccounts[0]?.id ?? null;
  }
  const account = visibleAccounts.find((item) => item.id === state.selectedAccountId);
  document.getElementById("case-count").textContent = String(visibleAccounts.length);
  const unassignedCount = visibleAccounts.filter((item) => !item.assignedTo).length;
  const paidCount = visibleAccounts.filter((item) => item.balanceCents === 0).length;
  document.getElementById("case-summary").textContent = actor.role === "supervisor"
    ? `${unassignedCount} por asignar · ${paidCount} liquidada${paidCount === 1 ? "" : "s"}`
    : `${visibleAccounts.length} expediente${visibleAccounts.length === 1 ? "" : "s"} visible${visibleAccounts.length === 1 ? "" : "s"}`;
  caseList.innerHTML = visibleAccounts.length ? visibleAccounts.map((item) => {
    const [label, className] = status(item);
    return `<button type="button" class="case-choice ${item.id === state.selectedAccountId ? "selected" : ""}" data-case-id="${safe(item.id)}" ${item.id === state.selectedAccountId ? 'aria-current="true"' : ""}>
      <span class="case-choice-top"><strong>${safe(item.id)}</strong><small class="case-mini-status ${className}">${safe(label)}</small></span>
      <span class="case-choice-client">${safe(item.client)}</span>
      <span class="case-choice-balance ${className}">${money(item.balanceCents)} pendientes</span>
    </button>`;
  }).join("") : `<p class="rail-help">No tienes cuentas asignadas en esta demo.</p>`;
  document.getElementById("flow-progress").innerHTML = account ? progress(account) : `<p class="rail-help">Sin caso activo para este rol.</p>`;
  if (!account) {
    app.innerHTML = `<section class="case-sheet"><p class="eyebrow">CARTERA VACÍA</p><h2>${actor.role === "finance" ? "Aún no hay cuentas listas para finanzas." : "No tienes un caso asignado."}</h2><p class="muted">La supervisora debe asignar una cuenta antes de que este rol pueda trabajarla.</p></section>`;
    return;
  }
  const mine = true;
  const [statusText, statusClass] = status(account);
  const assigned = AGENTS.find((agent) => agent.id === account.assignedTo);
  const promise = account.promises.at(-1);
  const followUp = followUpAlert(account);

  app.innerHTML = `
    ${state.isDatePreview ? `<div class="preview-banner" role="status">Vista previa al ${safe(state.asOfDate)}: solo consulta. Vuelve a hoy para registrar movimientos reales.</div>` : ""}
    <section class="case-sheet" aria-labelledby="account-heading">
      <div class="case-main">
        <div class="case-identity">
          <p class="eyebrow">CUENTA ${safe(account.id)} / ${mine ? "VISTA DEL EXPEDIENTE" : "FUERA DE TU CARTERA"}</p>
          <h2 id="account-heading">${mine ? safe(account.client) : "Sin cuenta asignada"}</h2>
          <p class="muted">${mine ? safe(account.concept) : "Este agente no puede consultar el detalle de una cuenta asignada a otra persona."}</p>
        </div>
        <span class="status ${mine ? statusClass : "unassigned"}">${mine ? safe(statusText) : "No asignada a ti"}</span>
      </div>
      ${mine ? `<div class="case-numbers">
        <div class="balance"><span>SALDO PENDIENTE</span><strong>${money(account.balanceCents)}</strong><small>de ${money(account.openingBalanceCents)} originales</small></div>
        <div class="case-fact"><span>RESPONSABLE</span><strong>${assigned ? safe(assigned.name) : "Por asignar"}</strong></div>
        <div class="case-fact"><span>ABONOS CONFIRMADOS</span><strong>${money(account.openingBalanceCents - account.balanceCents)}</strong></div>
      </div>` : ""}
    </section>

    <div class="desk-grid">
      <section class="workbench" aria-labelledby="action-heading">
        <div class="section-title"><span class="section-index">A</span><div><p class="eyebrow">OPERACIÓN</p><h2 id="action-heading">${actor.role === "supervisor" ? "Asignar la cuenta" : actor.role === "agent" ? "Continuar seguimiento" : "Confirmar un abono"}</h2></div></div>
        <p class="muted actor-line">Estás trabajando como ${safe(actor.name)}.</p>
        ${actionPanel(account, actor)}
      </section>

      <div class="case-record">
        ${mine ? `<section class="promise-strip" aria-labelledby="agreement-heading">
          <div class="section-title"><span class="section-index">B</span><div><p class="eyebrow">COMPROMISO</p><h2 id="agreement-heading">Acuerdo de pago</h2></div></div>
          ${promise ? `<div class="agreement"><div><span>Compromiso</span><strong>${money(promise.amountCents)}</strong></div><div><span>Cubierto</span><strong>${money(promise.coveredCents)}</strong></div><div><span>Fecha</span><strong>${promise.dueDate ? safe(promise.dueDate) : "Sin fecha acordada"}</strong></div><div><span>Estado</span><strong>${promise.isOverdue ? "Vencida" : promise.status === "FULFILLED" ? "Cumplida" : promise.status === "PARTIAL" ? "Parcial" : "Pendiente"}</strong></div></div>
          ${promise.isOverdue ? `<p class="overdue-summary">Faltan ${money(promise.remainingCents)} de esta promesa. El saldo de la cuenta no cambia por el vencimiento.</p>` : ""}
          ${followUp ? `<p class="followup-summary ${followUp.tone}"><strong>${safe(followUp.label)}: ${safe(followUp.date)}</strong><span>La fecha prometida de pago sigue siendo ${safe(promise.dueDate)}.</span></p>` : ""}` : `<p class="empty">Sin compromiso de monto todavía. El resultado del contacto quedará en la bitácora.</p>`}
        </section>

        <section class="history" aria-labelledby="history-heading">
          <div class="section-title"><span class="section-index">C</span><div><p class="eyebrow">BITÁCORA</p><h2 id="history-heading">Todo lo que pasó <span class="count">${account.events.length}</span></h2></div></div>
          ${account.events.length ? `<div class="timeline-scroll" role="region" aria-label="Movimientos de ${safe(account.client)}" tabindex="0"><ol class="timeline">${account.events.map((event) => `<li class="tone-${eventTone(event)}"><span class="event-dot" aria-hidden="true"></span><div><span class="event-kind">${safe(eventLabel(event))}</span><p><strong>${safe(event.actorName)}</strong> · ${safe(movementSummary(account, event))}</p><small>${safe(new Date(event.at).toLocaleString("es-MX"))}</small></div></li>`).join("")}</ol></div>` : `<p class="empty">Sin movimientos todavía. Asignar la cuenta creará el primer registro.</p>`}
        </section>` : `<div class="record-placeholder">Cuando tengas una cuenta asignada, aquí verás sus acuerdos y movimientos.</div>`}
      </div>
    </div>`;
  if (state.isDatePreview) {
    app.querySelectorAll("form[data-action] input, form[data-action] select, form[data-action] textarea, form[data-action] button")
      .forEach((control) => { control.disabled = true; });
  }
}

function flash(text, isError = false) {
  message.hidden = false;
  message.classList.toggle("error", isError);
  message.textContent = text;
  message.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function api(path, options) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message ?? "No se pudo conectar con la base de datos.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadState(preferredAccountId = null) {
  const query = new URLSearchParams({ actor: roleKey });
  if (simulatedAsOf) query.set("asOf", simulatedAsOf);
  const fresh = await api(`/api/state?${query}`);
  state = {
    ...fresh,
    selectedAccountId: fresh.accounts.some((item) => item.id === preferredAccountId)
      ? preferredAccountId : fresh.selectedAccountId
  };
  render();
}

previewDate.addEventListener("change", async () => {
  if (previewDate.value && previewDate.value < state.todayDate) {
    previewDate.value = state.asOfDate;
    flash("La simulación debe ser hoy o una fecha posterior.", true);
    return;
  }
  simulatedAsOf = previewDate.value && previewDate.value !== state.todayDate ? previewDate.value : null;
  try { await loadState(state.selectedAccountId); } catch (error) { flash(error.message, true); }
});

useToday.addEventListener("click", async () => {
  simulatedAsOf = null;
  try { await loadState(state.selectedAccountId); } catch (error) { flash(error.message, true); }
});

roleSelect.addEventListener("change", async () => {
  roleKey = roleSelect.value;
  message.hidden = true;
  state = { accounts: [], selectedAccountId: null };
  caseList.innerHTML = "";
  document.getElementById("flow-progress").innerHTML = "";
  app.innerHTML = `<section class="case-sheet"><p class="eyebrow">CONECTANDO</p><h2>Cargando esta perspectiva…</h2></section>`;
  try { await loadState(); } catch (error) { flash(error.message, true); }
});

caseList.addEventListener("click", (event) => {
  const choice = event.target.closest("button[data-case-id]");
  if (!choice || !caseList.contains(choice)) return;
  state.selectedAccountId = choice.dataset.caseId;
  message.hidden = true;
  render();
});

function updateContactForm(form) {
  const connected = form.elements.outcome.value === "CONNECTED";
  const disposition = form.elements.disposition.value;
  const needsAmount = connected && ["DATED_PROMISE", "UNDATED_PROMISE"].includes(disposition);
  const needsDate = connected && ["DATED_PROMISE", "DATE_CONFIRMED"].includes(disposition);
  const dispositionBlock = form.querySelector("[data-contact-disposition]");
  const amountBlock = form.querySelector("[data-contact-amount]");
  const dateBlock = form.querySelector("[data-contact-date]");
  dispositionBlock.hidden = !connected;
  amountBlock.hidden = !needsAmount;
  dateBlock.hidden = !needsDate;
  form.elements.disposition.disabled = !connected;
  form.elements.disposition.required = connected;
  form.elements.amount.disabled = !needsAmount;
  form.elements.amount.required = needsAmount;
  form.elements.dueDate.disabled = !needsDate;
  form.elements.dueDate.required = needsDate;
  form.querySelector("[data-contact-guidance]").textContent = !connected
    ? "Guarda el intento sin respuesta; no se creará ningún compromiso."
    : disposition === "DATE_CONFIRMED" ? "Esta fecha se agregará al compromiso existente; el monto no cambia."
    : needsDate ? "El contacto y la promesa con fecha se guardarán juntos."
    : needsAmount ? "El contacto y el compromiso sin fecha se guardarán juntos. No habrá vencimiento automático."
    : disposition ? "Guarda el resultado de la llamada; no se creará una promesa."
    : "Elige cómo terminó la conversación antes de guardar.";
}

app.addEventListener("change", (event) => {
  if (!event.target.matches('form[data-action="CONTACT"] select[name="outcome"], form[data-action="CONTACT"] select[name="disposition"]')) return;
  const form = event.target.form;
  if (event.target.name === "outcome") form.elements.disposition.value = "";
  updateContactForm(form);
});

app.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-action]");
  if (!form) return;
  event.preventDefault();
  if (state.isDatePreview) {
    flash("Vuelve a hoy antes de registrar movimientos; la fecha simulada es solo de consulta.", true);
    return;
  }
  const fields = new FormData(form);
  const type = form.dataset.action;
  const action = { type, accountId: state.selectedAccountId };
  if (type === "ASSIGN") action.agentId = fields.get("agentId");
  if (type === "CONTACT") {
    action.outcome = fields.get("outcome");
    action.note = fields.get("note");
    if (action.outcome === "CONNECTED") {
      action.disposition = fields.get("disposition");
      if (["DATED_PROMISE", "UNDATED_PROMISE"].includes(action.disposition)) {
        try { action.amountCents = cents(fields.get("amount")); } catch (error) { flash(error.message, true); return; }
      }
      if (["DATED_PROMISE", "DATE_CONFIRMED"].includes(action.disposition)) action.dueDate = fields.get("dueDate");
    }
  }
  if (type === "SCHEDULE_FOLLOW_UP") action.nextFollowUpDate = fields.get("nextFollowUpDate");
  if (type === "PAYMENT") {
    action.reference = fields.get("reference");
    try { action.amountCents = cents(fields.get("amount")); } catch (error) { flash(error.message, true); return; }
  }
  try {
    const result = await api("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...action, actorKey: roleKey })
    });
    await loadState(action.accountId);
    flash(type === "SCHEDULE_FOLLOW_UP"
      ? "Próxima gestión agendada. La fecha de pago original no cambió y el movimiento aparece en la bitácora."
      : result.kind === "UNDATED_PROMISE"
      ? "Contacto y compromiso sin fecha guardados. Finanzas podrá aplicar abonos; no habrá vencimiento automático."
      : result.kind === "DATED_PROMISE"
      ? "Contacto y promesa con fecha guardados juntos; ya aparecen en el expediente."
      : result.kind === "DATE_CONFIRMED"
      ? "Fecha agregada al compromiso existente. El monto no cambió y el acuerdo quedó en la bitácora."
      : result.kind === "INDEPENDENT_PAYMENT"
      ? "Abono independiente confirmado: quedó en esta cuenta, sin promesa asociada, y ya aparece en la bitácora."
      : "Movimiento registrado. El saldo y el historial están actualizados.");
  } catch (error) {
    if (error.status === 409) {
      await loadState(action.accountId).catch(() => {});
    }
    flash(error.message, true);
  }
});

prepareOverdue.addEventListener("click", async () => {
  if (state.isDatePreview || !state.demoToolsEnabled) return;
  prepareOverdue.disabled = true;
  try {
    const result = await api("/api/demo/overdue-case", { method: "POST" });
    roleKey = "lia";
    roleSelect.value = roleKey;
    simulatedAsOf = null;
    await loadState(result.accountId);
    flash(result.created
      ? "Caso ficticio vencido preparado: puedes agendar la próxima gestión sin cambiar el reloj ni tus otras cuentas."
      : "Abrí el caso ficticio vencido que ya estaba preparado.");
  } catch (error) {
    prepareOverdue.disabled = false;
    flash(error.message, true);
  }
});

resetDemo.addEventListener("click", async () => {
  if (state.isDatePreview) return;
  if (!window.confirm("¿Borrar los movimientos de ejemplo y reiniciar las tres cuentas en SQL Server? Esto afecta a todos los roles de esta demo local.")) return;
  try {
    await api("/api/demo/reset", { method: "POST" });
    roleKey = "supervisor";
    roleSelect.value = roleKey;
    await loadState();
    flash("Cartera reiniciada en la base de datos. Puedes comenzar asignando la cuenta.");
  } catch (error) { flash(error.message, true); }
});

app.innerHTML = `<section class="case-sheet"><p class="eyebrow">CONECTANDO</p><h2>Preparando la cartera…</h2></section>`;
loadState().catch((error) => flash(error.message, true));
