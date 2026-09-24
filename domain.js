export const AGENTS = [
  { id: "lia", name: "Lía Torres" },
  { id: "marco", name: "Marco Gil" }
];

function seedAccount(id, client, concept, balanceCents) {
  return {
    id,
    client,
    concept,
    openingBalanceCents: balanceCents,
    balanceCents,
    assignedTo: null,
    contacts: [],
    promises: [],
    payments: [],
    events: []
  };
}

export function initialState() {
  return {
    schemaVersion: 2,
    version: 0,
    selectedAccountId: "CC-104",
    accounts: [
      seedAccount("CC-104", "Estudio Bruma", "Servicios profesionales a crédito", 1250000),
      seedAccount("CC-105", "Librería Jacaranda", "Suministro comercial a crédito", 780000),
      seedAccount("CC-106", "Taller Nube", "Mantenimiento de equipo a crédito", 430000)
    ]
  };
}

export function migrateLegacyState(legacy) {
  if (!legacy?.account || !Array.isArray(legacy.events) || !Number.isSafeInteger(legacy.version)) {
    fail("No se pudo recuperar la demo anterior.");
  }
  const migrated = initialState();
  migrated.version = legacy.version;
  migrated.accounts[0] = { ...structuredClone(legacy.account), events: structuredClone(legacy.events) };
  return migrated;
}

function fail(message) {
  throw new Error(message);
}

function positiveCents(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} debe ser mayor a cero y expresarse en centavos enteros.`);
  }
  return value;
}

function requiredText(value, label, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    fail(`${label} es obligatorio y debe tener máximo ${max} caracteres.`);
  }
  return value.trim();
}

function requireRole(actor, role) {
  if (actor?.role !== role) fail("Tu rol no puede realizar esta acción.");
}

function requireAssigned(account, actor) {
  requireRole(actor, "agent");
  if (account.assignedTo !== actor.id) fail("Solo el agente asignado puede atender esta cuenta.");
}

function activePromise(account) {
  return account.promises.find((promise) => promise.status === "PENDING" || promise.status === "PARTIAL");
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("Selecciona una fecha válida.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail("Selecciona una fecha válida.");
  return value;
}

function moneyText(cents) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
}

export function applyAction(state, actor, action) {
  if (!state || state.schemaVersion !== 2 || !Array.isArray(state.accounts)) fail("El estado de la cartera no es válido.");
  if (!actor || typeof actor.id !== "string") fail("Identifica al operador.");
  if (!action || typeof action.type !== "string") fail("Indica una acción válida.");

  const next = structuredClone(state);
  const account = next.accounts.find((item) => item.id === (action.accountId ?? next.selectedAccountId));
  if (!account) fail("Selecciona una cuenta válida.");
  const at = action.at ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(at))) fail("La fecha de la operación no es válida.");
  const eventId = `EV-${String(next.version + 1).padStart(3, "0")}`;
  let detail;
  let eventKind = null;

  switch (action.type) {
    case "ASSIGN": {
      requireRole(actor, "supervisor");
      if (account.balanceCents === 0) fail("La cuenta está liquidada; selecciona otra cuenta para asignar.");
      if (account.contacts.length) fail("La cuenta ya tiene contactos; una transferencia requiere otro flujo.");
      if (!AGENTS.some((agent) => agent.id === action.agentId)) fail("Selecciona un agente válido.");
      if (account.assignedTo === action.agentId) fail("La cuenta ya está asignada a ese agente.");
      account.assignedTo = action.agentId;
      detail = `Asignó la cuenta a ${AGENTS.find((agent) => agent.id === action.agentId).name}.`;
      break;
    }
    case "CONTACT": {
      requireAssigned(account, actor);
      if (account.balanceCents === 0) fail("La cuenta ya está liquidada; no requiere más seguimiento.");
      const outcome = action.outcome;
      if (!(["CONNECTED", "NO_ANSWER"].includes(outcome))) fail("Selecciona un resultado de contacto válido.");
      const note = requiredText(action.note, "La nota de contacto", 240);
      const disposition = action.disposition ?? null;
      if (outcome === "NO_ANSWER" && disposition !== null) fail("Un intento sin respuesta no puede tener acuerdo de pago.");
      if (outcome === "CONNECTED" && !["DATED_PROMISE", "UNDATED_PROMISE", "DATE_CONFIRMED", "FOLLOW_UP", "NO_AGREEMENT"].includes(disposition)) {
        fail("Selecciona cómo terminó el contacto efectivo.");
      }
      const createsPromise = ["DATED_PROMISE", "UNDATED_PROMISE"].includes(disposition);
      const existingPromise = activePromise(account);
      let promiseAmount = 0;
      let promiseDueDate = null;
      if (createsPromise) {
        if (existingPromise) fail("Ya existe una promesa abierta para esta cuenta.");
        promiseAmount = positiveCents(action.amountCents, "La promesa");
        if (promiseAmount > account.balanceCents) fail("La promesa no puede superar el saldo pendiente.");
        if (disposition === "DATED_PROMISE") {
          promiseDueDate = parseDate(action.dueDate);
          if (promiseDueDate <= at.slice(0, 10)) fail("La fecha de promesa debe ser futura.");
        } else if (action.dueDate) fail("La promesa sin fecha no debe incluir una fecha de pago.");
      } else if (disposition === "DATE_CONFIRMED") {
        if (!existingPromise || existingPromise.dueDate) fail("Solo puedes acordar una fecha para un compromiso abierto sin fecha.");
        if (action.amountCents != null) fail("Este contacto solo acuerda la fecha; el monto original no cambia.");
        promiseDueDate = parseDate(action.dueDate);
        if (promiseDueDate <= at.slice(0, 10)) fail("La fecha acordada debe ser futura.");
      } else if (action.amountCents != null || action.dueDate) fail("Este resultado de contacto no incluye una promesa de pago.");
      account.contacts.push({ id: `CT-${eventId}`, at, actorId: actor.id, outcome, disposition, note });
      if (createsPromise) {
        account.promises.push({
          id: `PR-${eventId}`, amountCents: promiseAmount, coveredCents: 0, dueDate: promiseDueDate,
          nextFollowUpDate: null, status: "PENDING", createdAt: at, actorId: actor.id
        });
        eventKind = disposition;
        detail = disposition === "DATED_PROMISE"
          ? `Contacto efectivo; acordó promesa por ${moneyText(promiseAmount)} para ${promiseDueDate}. ${note}`
          : `Contacto efectivo; acordó promesa por ${moneyText(promiseAmount)} sin fecha de pago. ${note}`;
        break;
      }
      if (disposition === "DATE_CONFIRMED") {
        existingPromise.dueDate = promiseDueDate;
        eventKind = disposition;
        detail = `Contacto efectivo; acordó fecha de pago ${promiseDueDate} para el compromiso ${existingPromise.id} por ${moneyText(existingPromise.amountCents)}. ${note}`;
        break;
      }
      const overduePromise = existingPromise;
      const dispositionText = disposition === "FOLLOW_UP" ? "requiere seguimiento" : "no se alcanzó un acuerdo";
      if (overduePromise?.dueDate && overduePromise.dueDate < at.slice(0, 10)) {
        eventKind = "OVERDUE_FOLLOWUP";
        detail = `Seguimiento de promesa vencida ${overduePromise.id} (faltan ${moneyText(overduePromise.amountCents - overduePromise.coveredCents)}): ${outcome === "CONNECTED" ? dispositionText : "sin respuesta"}. ${note}`;
      } else {
        eventKind = disposition;
        detail = outcome === "CONNECTED" ? `Contacto efectivo; ${dispositionText}. ${note}` : `Sin respuesta: ${note}`;
      }
      break;
    }
    case "SCHEDULE_FOLLOW_UP": {
      requireAssigned(account, actor);
      const promise = activePromise(account);
      const today = at.slice(0, 10);
      if (!promise?.dueDate || promise.dueDate >= today) fail("Solo puedes agendar seguimiento de una promesa realmente vencida y no cubierta.");
      const nextDate = parseDate(action.nextFollowUpDate);
      if (nextDate <= today) fail("La nueva fecha de seguimiento debe ser posterior a hoy.");
      if (promise.nextFollowUpDate === nextDate) fail("Ese seguimiento ya está agendado para esa fecha.");
      const previous = promise.nextFollowUpDate;
      promise.nextFollowUpDate = nextDate;
      detail = previous
        ? `Reprogramó seguimiento de la promesa vencida ${promise.id} de ${previous} a ${nextDate}. La fecha original de pago no cambió.`
        : `Agendó seguimiento de la promesa vencida ${promise.id} para ${nextDate}. La fecha original de pago ${promise.dueDate} no cambió.`;
      break;
    }
    case "PAYMENT": {
      requireRole(actor, "finance");
      if (!account.assignedTo) fail("La cuenta aún no está asignada; finanzas no puede registrar un abono.");
      const amountCents = positiveCents(action.amountCents, "El abono");
      if (amountCents > account.balanceCents) fail("El abono no puede superar el saldo pendiente.");
      const reference = requiredText(action.reference, "La referencia", 40);
      if (next.accounts.some((item) => item.payments.some((payment) => payment.reference.toLowerCase() === reference.toLowerCase()))) {
        fail("Esa referencia ya fue registrada; no dupliques el abono.");
      }
      const promise = activePromise(account);
      const appliedToPromiseCents = promise ? Math.min(amountCents, promise.amountCents - promise.coveredCents) : 0;
      const independentCents = amountCents - appliedToPromiseCents;
      let closedFollowUp = false;
      if (promise) {
        promise.coveredCents += appliedToPromiseCents;
        promise.status = promise.coveredCents === promise.amountCents ? "FULFILLED" : "PARTIAL";
        if (promise.status === "FULFILLED" && promise.nextFollowUpDate) {
          promise.nextFollowUpDate = null;
          closedFollowUp = true;
        }
      }
      account.balanceCents -= amountCents;
      account.payments.push({
        id: `PM-${eventId}`,
        at,
        actorId: actor.id,
        reference,
        amountCents,
        appliedToPromiseCents,
        promiseId: promise?.id ?? null
      });
      if (!promise) {
        eventKind = "INDEPENDENT_PAYMENT";
        detail = `Confirmó abono independiente ${reference} por ${moneyText(amountCents)} en la cuenta ${account.id}; sin promesa asociada. Saldo pendiente: ${moneyText(account.balanceCents)}.`;
      } else if (independentCents > 0) {
        eventKind = "MIXED_PAYMENT";
        detail = `Confirmó abono ${reference} por ${moneyText(amountCents)}: ${moneyText(appliedToPromiseCents)} a la promesa ${promise.id} y ${moneyText(independentCents)} como abono adicional sin promesa. Saldo pendiente: ${moneyText(account.balanceCents)}.`;
      } else {
        eventKind = "PROMISE_PAYMENT";
        detail = `Confirmó abono ${reference} por ${moneyText(amountCents)} aplicado a la promesa ${promise.id}. Saldo pendiente: ${moneyText(account.balanceCents)}.`;
      }
      if (closedFollowUp) detail += " Se cerró el seguimiento agendado al cumplirse la promesa.";
      break;
    }
    default:
      fail("Acción no reconocida.");
  }

  next.version += 1;
  account.events.unshift({ id: eventId, type: action.type, kind: eventKind, actorId: actor.id, actorName: actor.name, at, detail });
  return next;
}
