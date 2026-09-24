import assert from "node:assert/strict";

const base = process.env.CARTERA_BASE_URL ?? "http://127.0.0.1:4173";

async function request(path, method = "GET", body) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function state(actor, asOf) {
  const query = new URLSearchParams({ actor });
  if (asOf) query.set("asOf", asOf);
  const result = await request(`/api/state?${query}`);
  assert.equal(result.status, 200);
  return result.data;
}

async function act(actorKey, type, accountId, fields = {}, expected = 200) {
  const result = await request("/api/actions", "POST", { actorKey, type, accountId, ...fields });
  assert.equal(result.status, expected, `${type}: ${JSON.stringify(result.data)}`);
  return result.data;
}

const health = await request("/api/health");
assert.deepEqual(health, { status: 200, data: { status: "ok" } });

const fresh = await state("supervisor");
assert.equal(fresh.accounts.length, 3);
assert.equal(fresh.version, 0, "La prueba requiere una base recién creada y sin movimientos.");
assert.deepEqual(fresh.accounts.map((account) => account.balanceCents), [1_250_000, 780_000, 430_000]);

await act("supervisor", "ASSIGN", "CC-104", { agentId: "lia" });
await act("lia", "CONTACT", "CC-104", { outcome: "NO_ANSWER", note: "Sin respuesta en llamada de prueba" });
await act("lia", "CONTACT", "CC-104", { outcome: "CONNECTED", note: "Resultado sin clasificar" }, 400);
await act("finance", "PAYMENT", "CC-104", { amountCents: 50_000, reference: "E2E-IND-001" });

const afterIndependent = (await state("finance")).accounts.find((account) => account.id === "CC-104");
assert.equal(afterIndependent.balanceCents, 1_200_000);
assert.equal(afterIndependent.events[0].kind, "INDEPENDENT_PAYMENT");
assert.equal(afterIndependent.payments[0].promiseId, null);

const dueDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
await act("lia", "CONTACT", "CC-104", {
  outcome: "CONNECTED", disposition: "DATED_PROMISE", note: "Cliente acuerda monto y fecha de prueba",
  amountCents: 400_000, dueDate
});
const nextDay = new Date(`${dueDate}T00:00:00Z`);
nextDay.setUTCDate(nextDay.getUTCDate() + 1);
const overdueDate = nextDay.toISOString().slice(0, 10);
const dueDayPromise = (await state("lia", dueDate)).accounts[0].promises[0];
assert.equal(dueDayPromise.isOverdue, false, "la fecha acordada todavía no es vencimiento");
const overduePreview = await state("lia", overdueDate);
assert.equal(overduePreview.isDatePreview, true);
assert.equal(overduePreview.accounts[0].promises[0].isOverdue, true);
assert.equal(overduePreview.accounts[0].promises[0].remainingCents, 400_000);
assert.equal((await state("lia")).accounts[0].promises[0].isOverdue, false, "la simulación no altera la promesa guardada");
await act("finance", "PAYMENT", "CC-104", { amountCents: 250_000, reference: "E2E-PR-001" });
await act("finance", "PAYMENT", "CC-104", { amountCents: 1_000, reference: "e2e-pr-001" }, 409);

const afterPromise = (await state("finance")).accounts.find((account) => account.id === "CC-104");
assert.equal(afterPromise.balanceCents, 950_000);
assert.equal(afterPromise.promises[0].coveredCents, 250_000);
assert.equal(afterPromise.promises[0].status, "PARTIAL");
assert.equal(afterPromise.events[0].kind, "PROMISE_PAYMENT");
const overduePartial = (await state("lia", overdueDate)).accounts[0].promises[0];
assert.equal(overduePartial.isOverdue, true);
assert.equal(overduePartial.remainingCents, 150_000);

await act("supervisor", "ASSIGN", "CC-105", { agentId: "marco" });
await act("marco", "CONTACT", "CC-105", {
  outcome: "CONNECTED", disposition: "UNDATED_PROMISE", note: "Cliente acuerda monto, sin fecha",
  amountCents: 780_000
});
assert.equal((await state("marco", overdueDate)).accounts[0].promises[0].isOverdue, false, "sin fecha no hay vencimiento");
await act("finance", "PAYMENT", "CC-105", { amountCents: 100_000, reference: "E2E-UNDATED-105" });
const undatedId = (await state("marco")).accounts[0].promises[0].id;
await act("marco", "CONTACT", "CC-105", {
  outcome: "CONNECTED", disposition: "DATE_CONFIRMED", note: "Cliente acuerda fecha para lo pendiente", dueDate
});
const datedLater = (await state("marco")).accounts[0];
assert.equal(datedLater.promises.length, 1);
assert.equal(datedLater.promises[0].id, undatedId);
assert.equal(datedLater.promises[0].dueDate, dueDate);
await act("finance", "PAYMENT", "CC-105", { amountCents: 680_000, reference: "E2E-LIQ-105" });

const final = await state("supervisor");
const paid = final.accounts.find((account) => account.id === "CC-105");
assert.equal(paid.balanceCents, 0);
assert.equal(paid.promises[0].status, "FULFILLED");
assert.equal((await state("marco", overdueDate)).accounts[0].promises.at(-1).isOverdue, false, "una promesa cumplida no vence");
assert.equal(final.accounts.find((account) => account.id === "CC-106").balanceCents, 430_000);
assert.deepEqual((await state("lia")).accounts.map((account) => account.id), ["CC-104"]);
assert.deepEqual((await state("marco")).accounts.map((account) => account.id), ["CC-105"]);
assert.deepEqual((await state("finance")).accounts.map((account) => account.id), ["CC-104", "CC-105"]);

const sample = await request("/api/demo/overdue-case", "POST");
assert.equal(sample.status, 200);
assert.equal(sample.data.accountId, "CC-107");
assert.equal(sample.data.created, true);
assert.equal((await request("/api/demo/overdue-case", "POST")).data.created, false, "el caso de prueba no se duplica");
const overdueAccount = (await state("lia")).accounts.find((item) => item.id === "CC-107");
assert.equal(overdueAccount.promises[0].isOverdue, true);
const originalDueDate = overdueAccount.promises[0].dueDate;
const nextContact = new Date(`${(await state("lia")).todayDate}T00:00:00Z`);
nextContact.setUTCDate(nextContact.getUTCDate() + 1);
const nextFollowUpDate = nextContact.toISOString().slice(0, 10);
await act("lia", "SCHEDULE_FOLLOW_UP", "CC-107", { nextFollowUpDate });
const scheduledAccount = (await state("lia")).accounts.find((item) => item.id === "CC-107");
assert.equal(scheduledAccount.promises[0].nextFollowUpDate, nextFollowUpDate);
assert.equal(scheduledAccount.promises[0].dueDate, originalDueDate);
assert.equal(scheduledAccount.balanceCents, overdueAccount.balanceCents);
assert.equal(scheduledAccount.events[0].type, "SCHEDULE_FOLLOW_UP");
await act("finance", "PAYMENT", "CC-107", { amountCents: 60_000, reference: "E2E-OVERDUE-PART-107" });
const partiallySettledSample = (await state("lia")).accounts.find((item) => item.id === "CC-107");
assert.equal(partiallySettledSample.balanceCents, 290_000);
assert.equal(partiallySettledSample.promises[0].coveredCents, 60_000);
assert.equal(partiallySettledSample.promises[0].remainingCents, 90_000);
assert.equal(partiallySettledSample.promises[0].status, "PARTIAL");
assert.equal(partiallySettledSample.promises[0].nextFollowUpDate, nextFollowUpDate, "el abono parcial conserva la cita");
await act("finance", "PAYMENT", "CC-107", { amountCents: 90_000, reference: "E2E-OVERDUE-FULL-107" });
const settledSample = (await state("lia")).accounts.find((item) => item.id === "CC-107");
assert.equal(settledSample.balanceCents, 200_000);
assert.equal(settledSample.promises[0].status, "FULFILLED");
assert.equal(settledSample.promises[0].nextFollowUpDate, null);
assert.match(settledSample.events[0].detail, /cerró el seguimiento/);

console.log("E2E con SQL Server: contacto clasificado, abono independiente, compromiso sin fecha con abono y fecha posterior, vencimiento, agenda, duplicado y liquidación OK.");
console.log("Los movimientos de prueba permanecen en la base para que puedas inspeccionarlos en la interfaz.");
