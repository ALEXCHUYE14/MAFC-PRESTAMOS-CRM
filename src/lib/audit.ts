/** Utilidades puras del visor de auditoría (sin dependencias de servidor: testeables). */

export const AUDIT_TABLES = {
  clients: "Clientes",
  loans: "Préstamos",
  payments: "Pagos",
  cash_sessions: "Caja",
  profiles: "Usuarios",
  system_settings: "Ajustes",
  holidays: "Feriados",
} as const;
export type AuditTable = keyof typeof AUDIT_TABLES;

export const AUDIT_ACTIONS = { insert: "Creación", update: "Modificación", delete: "Eliminación" } as const;
export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Campos que cambian siempre y no aportan al análisis. */
const NOISE = new Set(["updated_at"]);

export interface FieldChange { field: string; before: unknown; after: unknown }

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Campos que difieren entre la versión anterior y la nueva de un registro. */
export function diffRecord(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null): FieldChange[] {
  const before = oldV ?? {};
  const after = newV ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !NOISE.has(k)).sort();
  return keys.filter((k) => !same(before[k], after[k])).map((k) => ({ field: k, before: before[k], after: after[k] }));
}

/** Representación corta y segura de un valor para mostrarlo en pantalla (React escapa el HTML). */
export function formatAuditValue(v: unknown, max = 120): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Enlace interno al registro auditado, cuando existe una pantalla para verlo. */
export function auditRecordHref(table: string, recordId: string | null, values: Record<string, unknown> | null): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (table === "loans" && recordId && uuid.test(recordId)) return `/prestamos/${recordId}`;
  if (table === "clients" && recordId && uuid.test(recordId)) return `/clientes/${recordId}`;
  const loanId = values?.loan_id;
  if (table === "payments" && typeof loanId === "string" && uuid.test(loanId)) return `/prestamos/${loanId}`;
  return null;
}

/** Etiqueta legible del registro: su código si lo tiene (PREST-0001, REC-0002, CLI-0003). */
export function auditRecordLabel(recordId: string | null, values: Record<string, unknown> | null): string {
  const code = values?.code;
  if (typeof code === "string" && code) return code;
  if (!recordId) return "—";
  return recordId.length > 12 ? `${recordId.slice(0, 8)}…` : recordId;
}

/** Suma días a una fecha ISO (YYYY-MM-DD) sin depender de la zona horaria del servidor. */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
