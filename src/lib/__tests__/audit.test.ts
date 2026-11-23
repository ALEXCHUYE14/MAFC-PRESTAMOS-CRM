import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysISO, auditRecordHref, auditRecordLabel, diffRecord, formatAuditValue } from "../audit";

test("diff: solo campos que cambiaron, ignora updated_at", () => {
  const d = diffRecord(
    { status: "activo", balance_due: 100, updated_at: "a", notes: null, tags: [1] },
    { status: "castigado", balance_due: 100, updated_at: "b", notes: null, tags: [1, 2] },
  );
  assert.deepEqual(d.map((c) => c.field), ["status", "tags"]);
  assert.deepEqual(d[0], { field: "status", before: "activo", after: "castigado" });
});

test("diff: creación y eliminación muestran todos los campos", () => {
  assert.equal(diffRecord(null, { a: 1, b: 2 }).length, 2);
  assert.equal(diffRecord({ a: 1 }, null).length, 1);
  assert.deepEqual(diffRecord(null, null), []);
});

test("formato de valores: vacíos, objetos y textos largos", () => {
  assert.equal(formatAuditValue(null), "—");
  assert.equal(formatAuditValue(""), "—");
  assert.equal(formatAuditValue(false), "false");
  assert.equal(formatAuditValue({ x: 1 }), '{"x":1}');
  const long = formatAuditValue("x".repeat(300), 50);
  assert.equal(long.length, 50);
  assert.ok(long.endsWith("…"));
});

test("enlaces solo hacia ids válidos", () => {
  const id = "a199ae40-0e26-4fa8-9fb5-f80f938c62a8";
  assert.equal(auditRecordHref("loans", id, null), `/prestamos/${id}`);
  assert.equal(auditRecordHref("clients", id, null), `/clientes/${id}`);
  assert.equal(auditRecordHref("payments", "x", { loan_id: id }), `/prestamos/${id}`);
  assert.equal(auditRecordHref("loans", "javascript:alert(1)", null), null);
  assert.equal(auditRecordHref("payments", "x", { loan_id: "../../evil" }), null);
  assert.equal(auditRecordHref("holidays", "1", null), null);
});

test("etiqueta usa el código del registro cuando existe", () => {
  assert.equal(auditRecordLabel("a199ae40-0e26-4fa8-9fb5-f80f938c62a8", { code: "PREST-0007" }), "PREST-0007");
  assert.equal(auditRecordLabel("a199ae40-0e26-4fa8-9fb5-f80f938c62a8", null), "a199ae40…");
  assert.equal(auditRecordLabel(null, null), "—");
});

test("suma de días cruza meses y años", () => {
  assert.equal(addDaysISO("2026-01-31", 1), "2026-02-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysISO("2028-02-28", 1), "2028-02-29");
});
