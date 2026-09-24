import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, initialState, migrateLegacyState } from "./domain.js";

const at = "2026-09-22T12:00:00.000Z";
const supervisor = { id: "elena", name: "Elena Ríos", role: "supervisor" };
const lia = { id: "lia", name: "Lía Torres", role: "agent" };
const marco = { id: "marco", name: "Marco Gil", role: "agent" };
const finance = { id: "vera", name: "Vera Solís", role: "finance" };
const assign = (state) => applyAction(state, supervisor, { type: "ASSIGN", agentId: "lia", at });
const contact = (state, outcome = "CONNECTED", disposition = "FOLLOW_UP") => applyAction(state, lia, {
  type: "CONTACT", outcome, disposition: outcome === "CONNECTED" ? disposition : undefined,
  note: "Cliente confirma conversación", at
});
const promise = (state, amountCents = 400000) => applyAction(state, lia, {
  type: "CONTACT", outcome: "CONNECTED", disposition: "DATED_PROMISE",
  amountCents, dueDate: "2026-09-30", note: "Cliente acordó monto y fecha", at
});
const undatedPromise = (state, amountCents = 400000) => applyAction(state, lia, {
  type: "CONTACT", outcome: "CONNECTED", disposition: "UNDATED_PROMISE",
  amountCents, note: "Cliente acordó monto, sin fecha", at
});
const payment = (state, amountCents = 250000, reference = "DEP-001") => applyAction(state, finance, { type: "PAYMENT", amountCents, reference, at });
const account = (state, id = "CC-104") => state.accounts.find((item) => item.id === id);

test("flujo completo: asignación, contacto con promesa atómica, abono parcial y auditoría", () => {
  const original = initialState();
  const result = payment(promise(assign(original)));
  assert.equal(account(original).assignedTo, null, "las operaciones no deben mutar el estado previo");
  assert.equal(account(result).balanceCents, 1000000);
  assert.equal(account(result).promises[0].coveredCents, 250000);
  assert.equal(account(result).promises[0].status, "PARTIAL");
  assert.deepEqual(account(result).events.map((event) => event.type), ["PAYMENT", "CONTACT", "ASSIGN"]);
  assert.equal(account(result).events[1].kind, "DATED_PROMISE");
  assert.equal(result.version, 3);
});

test("solo supervisor asigna y solo el agente asignado atiende", () => {
  assert.throws(() => applyAction(initialState(), lia, { type: "ASSIGN", agentId: "lia", at }), /rol/);
  const assigned = assign(initialState());
  assert.throws(() => applyAction(assigned, marco, { type: "CONTACT", outcome: "CONNECTED", note: "Hola", at }), /asignado/);
  assert.throws(() => applyAction(assigned, finance, { type: "CONTACT", outcome: "CONNECTED", note: "Hola", at }), /rol/);
});

test("una llamada sin respuesta no crea promesa ni admite un resultado de conversación", () => {
  const state = contact(assign(initialState()), "NO_ANSWER");
  assert.equal(account(state).promises.length, 0);
  assert.throws(() => applyAction(state, lia, {
    type: "CONTACT", outcome: "NO_ANSWER", disposition: "DATED_PROMISE", note: "Nadie respondió", at
  }), /sin respuesta/);
});

test("contacto efectivo requiere clasificación; promesas validan monto, fecha y unicidad", () => {
  const state = contact(assign(initialState()));
  assert.throws(() => applyAction(state, lia, { type: "CONTACT", outcome: "CONNECTED", note: "Sin cierre", at }), /cómo terminó/);
  assert.throws(() => promise(state, 1250001), /superar el saldo/);
  assert.throws(() => applyAction(state, lia, {
    type: "CONTACT", outcome: "CONNECTED", disposition: "DATED_PROMISE", note: "Fecha de hoy",
    amountCents: 10000, dueDate: "2026-09-22", at
  }), /futura/);
  const withPromise = promise(state);
  assert.throws(() => promise(withPromise), /promesa abierta/);
});

test("compromiso con monto sin fecha recibe abonos, pero nunca vence", () => {
  const open = undatedPromise(assign(initialState()));
  const agreement = account(open).promises[0];
  assert.equal(agreement.dueDate, null);
  assert.equal(account(open).contacts[0].disposition, "UNDATED_PROMISE");
  assert.equal(account(open).events[0].kind, "UNDATED_PROMISE");
  const partial = payment(open, 250000);
  assert.equal(account(partial).promises[0].coveredCents, 250000);
  assert.equal(account(partial).payments[0].promiseId, agreement.id);
  assert.throws(() => applyAction(partial, lia, {
    type: "SCHEDULE_FOLLOW_UP", nextFollowUpDate: "2026-10-03", at: "2026-10-01T12:00:00.000Z"
  }), /realmente vencida/);
});

test("una fecha posterior completa el mismo compromiso sin duplicarlo ni cambiar su monto", () => {
  const open = undatedPromise(assign(initialState()));
  const result = applyAction(open, lia, {
    type: "CONTACT", outcome: "CONNECTED", disposition: "DATE_CONFIRMED",
    dueDate: "2026-10-03", note: "Cliente confirma el día", at
  });
  assert.equal(account(result).promises.length, 1);
  assert.equal(account(result).promises[0].id, account(open).promises[0].id);
  assert.equal(account(result).promises[0].amountCents, 400000);
  assert.equal(account(result).promises[0].dueDate, "2026-10-03");
  assert.equal(account(result).events[0].kind, "DATE_CONFIRMED");
  assert.equal(account(open).promises[0].dueDate, null);
  assert.throws(() => applyAction(result, lia, {
    type: "CONTACT", outcome: "CONNECTED", disposition: "DATE_CONFIRMED",
    dueDate: "2026-10-04", note: "Otro cambio", at
  }), /sin fecha/);
});

test("contacto efectivo sin acuerdo puede recibir un abono independiente", () => {
  const state = contact(assign(initialState()), "CONNECTED", "NO_AGREEMENT");
  const result = payment(state, 50000, "SIN-ACUERDO-1");
  assert.equal(account(result).promises.length, 0);
  assert.equal(account(result).payments[0].promiseId, null);
  assert.equal(account(result).events[0].kind, "INDEPENDENT_PAYMENT");
});

test("finanzas liquida promesa sin duplicar abono ni exceder saldo", () => {
  const state = promise(contact(assign(initialState())));
  const withPayment = payment(state, 400000);
  assert.equal(account(withPayment).promises[0].status, "FULFILLED");
  assert.equal(account(withPayment).balanceCents, 850000);
  assert.throws(() => payment(withPayment, 10000, "dep-001"), /referencia ya fue registrada/);
  assert.throws(() => payment(withPayment, 850001, "DEP-002"), /superar el saldo/);
});

test("un abono mayor a la promesa cubre solo la promesa y todo reduce el saldo", () => {
  const state = promise(contact(assign(initialState())));
  const result = payment(state, 500000);
  assert.equal(account(result).balanceCents, 750000);
  assert.equal(account(result).promises[0].coveredCents, 400000);
  assert.equal(account(result).payments[0].appliedToPromiseCents, 400000);
  assert.equal(account(result).events[0].kind, "MIXED_PAYMENT");
  assert.match(account(result).events[0].detail, /abono adicional sin promesa/);
});

test("un abono tras contacto sin respuesta queda independiente de la llamada", () => {
  const afterNoAnswer = contact(assign(initialState()), "NO_ANSWER");
  const result = payment(afterNoAnswer, 50000, "TR-001");
  assert.equal(account(result).balanceCents, 1200000);
  assert.equal(account(result).payments[0].promiseId, null);
  assert.equal(account(result).events[0].kind, "INDEPENDENT_PAYMENT");
  assert.match(account(result).events[0].detail, /sin promesa asociada/);
  assert.equal(account(result).contacts[0].outcome, "NO_ANSWER");
});

test("un abono con promesa abierta se identifica en la bitácora", () => {
  const result = payment(promise(contact(assign(initialState()))), 250000, "TR-002");
  assert.equal(account(result).events[0].kind, "PROMISE_PAYMENT");
  assert.match(account(result).events[0].detail, /aplicado a la promesa/);
});

test("seguimiento de promesa vencida conserva el saldo y deja rastro específico", () => {
  const partial = payment(promise(contact(assign(initialState()))), 250000, "TR-003");
  const followUp = applyAction(partial, lia, {
    type: "CONTACT", outcome: "NO_ANSWER", note: "Se programó un nuevo intento", at: "2026-10-01T12:00:00.000Z"
  });
  assert.equal(account(followUp).events[0].kind, "OVERDUE_FOLLOWUP");
  assert.match(account(followUp).events[0].detail, /faltan.*1,500/);
  assert.equal(account(followUp).balanceCents, account(partial).balanceCents);
  assert.equal(account(followUp).promises[0].status, "PARTIAL");
  assert.equal(account(followUp).promises[0].coveredCents, 250000);
});

test("en la fecha acordada o con la promesa cumplida, el contacto no se marca vencido", () => {
  const open = promise(contact(assign(initialState())));
  const dueDay = applyAction(open, lia, { type: "CONTACT", outcome: "CONNECTED", disposition: "FOLLOW_UP", note: "Seguimiento el día acordado", at: "2026-09-30T12:00:00.000Z" });
  assert.equal(account(dueDay).events[0].kind, "FOLLOW_UP");
  const paid = payment(open, 400000);
  const afterPaid = applyAction(paid, lia, { type: "CONTACT", outcome: "CONNECTED", disposition: "FOLLOW_UP", note: "Seguimiento posterior", at: "2026-10-01T12:00:00.000Z" });
  assert.equal(account(afterPaid).events[0].kind, "FOLLOW_UP");
});

test("agendar y reprogramar seguimiento no cambia la promesa ni el saldo", () => {
  const open = promise(contact(assign(initialState())));
  const schedule = (state, date, at) => applyAction(state, lia, {
    type: "SCHEDULE_FOLLOW_UP", nextFollowUpDate: date, at
  });
  assert.throws(() => schedule(open, "2026-10-03", "2026-09-30T12:00:00.000Z"), /realmente vencida/);
  assert.throws(() => schedule(open, "2026-10-01", "2026-10-01T12:00:00.000Z"), /posterior a hoy/);
  assert.throws(() => applyAction(open, supervisor, { type: "SCHEDULE_FOLLOW_UP", nextFollowUpDate: "2026-10-03", at: "2026-10-01T12:00:00.000Z" }), /rol/);
  const scheduled = schedule(open, "2026-10-03", "2026-10-01T12:00:00.000Z");
  assert.equal(account(scheduled).promises[0].nextFollowUpDate, "2026-10-03");
  assert.equal(account(scheduled).promises[0].dueDate, "2026-09-30");
  assert.equal(account(scheduled).balanceCents, account(open).balanceCents);
  assert.equal(account(scheduled).events[0].type, "SCHEDULE_FOLLOW_UP");
  assert.throws(() => schedule(scheduled, "2026-10-03", "2026-10-01T13:00:00.000Z"), /ya está agendado/);
  const rescheduled = schedule(scheduled, "2026-10-04", "2026-10-02T12:00:00.000Z");
  assert.match(account(rescheduled).events[0].detail, /2026-10-03 a 2026-10-04/);
  const paid = applyAction(rescheduled, finance, {
    type: "PAYMENT", amountCents: 400000, reference: "LATE-1", at: "2026-10-02T13:00:00.000Z"
  });
  assert.equal(account(paid).promises[0].status, "FULFILLED");
  assert.equal(account(paid).promises[0].nextFollowUpDate, null);
  assert.match(account(paid).events[0].detail, /cerró el seguimiento/);
});

test("nadie puede transferir después del primer contacto en esta vertical", () => {
  const state = contact(assign(initialState()));
  assert.throws(() => applyAction(state, supervisor, { type: "ASSIGN", agentId: "marco", at }), /transferencia/);
});

test("tras liquidar una cuenta, la supervisora asigna otra sin alterar la anterior", () => {
  const firstPaid = payment(assign(initialState()), 1250000, "LIQ-104");
  assert.throws(() => applyAction(firstPaid, supervisor, { type: "ASSIGN", accountId: "CC-104", agentId: "marco", at }), /liquidada/);
  assert.throws(() => contact(firstPaid), /liquidada/);
  const next = applyAction(firstPaid, supervisor, { type: "ASSIGN", accountId: "CC-105", agentId: "marco", at });
  assert.equal(account(next, "CC-104").balanceCents, 0);
  assert.equal(account(next, "CC-104").events.length, 2);
  assert.equal(account(next, "CC-105").assignedTo, "marco");
  assert.equal(account(next, "CC-105").balanceCents, 780000);
  assert.deepEqual(account(next, "CC-105").events.map((event) => event.type), ["ASSIGN"]);
});

test("la referencia de abono es única en toda la cartera", () => {
  const first = payment(assign(initialState()), 20000, "BANCO-77");
  const secondAssigned = applyAction(first, supervisor, { type: "ASSIGN", accountId: "CC-105", agentId: "marco", at });
  assert.throws(() => applyAction(secondAssigned, finance, { type: "PAYMENT", accountId: "CC-105", amountCents: 10000, reference: "banco-77", at }), /referencia ya fue registrada/);
});

test("finanzas no puede abonar una cuenta sin responsable", () => {
  assert.throws(() => payment(initialState(), 20000, "BANCO-11"), /no está asignada/);
  const assigned = assign(initialState());
  assert.equal(payment(assigned, 20000, "BANCO-11").accounts[0].balanceCents, 1230000);
});

test("migra la cuenta ya trabajada sin perder saldo ni bitácora", () => {
  const prior = payment(assign(initialState()), 1250000, "LIQ-104");
  const { events, ...legacyAccount } = account(prior);
  const migrated = migrateLegacyState({ version: prior.version, account: legacyAccount, events });
  assert.equal(account(migrated).balanceCents, 0);
  assert.equal(account(migrated).events.length, 2);
  assert.equal(account(migrated, "CC-105").assignedTo, null);
  assert.equal(migrated.version, 2);
});
