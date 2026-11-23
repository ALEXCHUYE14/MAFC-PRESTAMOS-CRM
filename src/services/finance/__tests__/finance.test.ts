import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSchedule, generateDueDates, allocatePayment, computeLateFee, computePayoff,
  computeCreditScore, toCents, addMonths, type InstallmentBalance,
} from "../index";

test("calendario diario salta domingos y feriados", () => {
  // 2026-11-12 es jueves
  assert.deepEqual(
    generateDueDates("2026-11-12", "diario", 4, { excludeSundays: true, holidays: ["2026-11-17"] }),
    ["2026-11-13", "2026-11-14", "2026-11-16", "2026-11-18"],
  );
});

test("mensual respeta fin de mes", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
});

test("interés simple: cuota redonda, la última absorbe la diferencia", () => {
  const s = buildSchedule({
    principal: 1000, ratePct: 20, interestType: "simple", frequency: "diario",
    termCount: 24, startDate: "2026-11-12", excludeSundays: true,
  });
  assert.equal(s.interestCents, 20000);
  assert.equal(s.totalCents, 120000);
  assert.equal(s.installmentCents, 5000);
  assert.deepEqual([s.rows[0].principalCents, s.rows[0].interestCents], [4167, 833]);
  assert.deepEqual([s.rows[23].principalCents, s.rows[23].interestCents], [4159, 841]);
  assert.equal(s.rows[23].balanceAfterCents, 0);
  assert.equal(s.effectiveRatePct, 20);
});

test("interés simple por periodo", () => {
  const s = buildSchedule({
    principal: 500, ratePct: 5, interestType: "simple", flatRateMode: "por_periodo",
    frequency: "mensual", termCount: 3, startDate: "2026-01-15", excludeSundays: false,
  });
  assert.equal(s.interestCents, 7500);
  assert.equal(s.rows.reduce((a, r) => a + r.principalCents, 0), 50000);
});

test("sistema francés coincide con PostgreSQL", () => {
  const s = buildSchedule({
    principal: 1500, ratePct: 10, interestType: "frances", frequency: "mensual",
    termCount: 6, startDate: "2026-11-22", excludeSundays: false,
  });
  assert.equal(s.installmentCents, 34441);
  assert.deepEqual(s.rows.map((r) => [r.principalCents, r.interestCents]), [
    [19441, 15000], [21385, 13056], [23524, 10917], [25876, 8565], [28464, 5977], [31310, 3131],
  ]);
  assert.equal(s.totalCents, 206646);
  assert.equal(s.rows.reduce((a, r) => a + r.principalCents, 0), 150000);
});

test("francés con tasa 0", () => {
  const s = buildSchedule({
    principal: 100, ratePct: 0, interestType: "frances", frequency: "semanal",
    termCount: 3, startDate: "2026-01-01", excludeSundays: false,
  });
  assert.equal(s.interestCents, 0);
  assert.equal(s.totalCents, 10000);
});

test("mora: fijo diario, porcentaje, por cuota y tope", () => {
  const base = { dueDate: "2026-11-13", today: "2026-11-22", graceDays: 0, outstandingCents: 5000 };
  assert.equal(computeLateFee({ ...base, type: "fijo_diario", value: 1 }), 900);
  assert.equal(computeLateFee({ ...base, type: "fijo_diario", value: 1, graceDays: 3 }), 600);
  assert.equal(computeLateFee({ ...base, type: "porcentaje_diario", value: 2 }), 900);
  assert.equal(computeLateFee({ ...base, type: "fijo_por_cuota", value: 5 }), 500);
  assert.equal(computeLateFee({ ...base, type: "fijo_diario", value: 1, cap: 4 }), 400);
  assert.equal(computeLateFee({ ...base, today: "2026-11-13", type: "fijo_diario", value: 1 }), 0);
});

function scenario(): InstallmentBalance[] {
  const s = buildSchedule({
    principal: 1000, ratePct: 20, interestType: "simple", frequency: "diario",
    termCount: 24, startDate: "2026-11-12", excludeSundays: true,
  });
  const today = "2026-11-22";
  return s.rows.map((r) => ({
    id: `i${r.number}`, number: r.number, dueDate: r.dueDate,
    principalDue: r.principalCents, interestDue: r.interestCents,
    lateFeeDue: computeLateFee({ dueDate: r.dueDate, today, graceDays: 0, type: "fijo_diario", value: 1, outstandingCents: r.totalCents }),
    principalPaid: 0, interestPaid: 0, lateFeePaid: 0,
  }));
}

test("cascada: mora → interés vencido → capital vencido (igual que SQL)", () => {
  const r = allocatePayment(toCents(120), scenario(), "2026-11-22");
  assert.deepEqual(r.applied, { late_fee: 3800, interest: 6664, principal: 1536 });
  assert.equal(r.remainder, 0);
  assert.equal(r.allocations[0].principal, 1536);
});

test("cascada: el sobrante pasa a cuotas futuras", () => {
  const r = allocatePayment(toCents(500), scenario(), "2026-11-22");
  const overdueTotal = 3800 + 8 * 5000;
  assert.equal(r.applied.late_fee + r.applied.interest + r.applied.principal, 50000);
  const future = r.allocations.filter((a) => a.number > 8);
  assert.equal(future.reduce((a, x) => a + x.interest + x.principal, 0), 50000 - overdueTotal);
});

test("cascada respeta orden configurable", () => {
  const r = allocatePayment(toCents(40), scenario(), "2026-11-22", ["principal", "interest", "late_fee"]);
  assert.deepEqual(r.applied, { principal: 4000, interest: 0, late_fee: 0 });
});

test("liquidación anticipada con y sin condonación", () => {
  const inst = scenario();
  const q = computePayoff(inst, "2026-11-22");
  assert.equal(q.total, 120000 + 3800);
  const q2 = computePayoff(inst, "2026-11-22", { waiveLateFee: true, waiveFutureInterest: true });
  assert.equal(q2.total, 120000 - q.futureInterest);
});

test("score interno", () => {
  assert.equal(computeCreditScore([], "2026-11-22"), 70);
  const puntual = Array.from({ length: 10 }, (_, k) => ({ dueDate: `2026-10-${10 + k}`, paidAt: `2026-10-${10 + k}`, graceDays: 0 }));
  assert.equal(computeCreditScore(puntual, "2026-11-22"), 100);
  const moroso = [{ dueDate: "2026-11-01", paidAt: null, graceDays: 0 }];
  assert.equal(computeCreditScore(moroso, "2026-11-22"), 0);
});
