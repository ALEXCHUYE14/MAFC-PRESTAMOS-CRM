/** CSV compatible con Excel (BOM UTF-8, separador `;` configurable, comillas escapadas). */
export function toCSV(rows: Record<string, unknown>[], sep = ";"): string {
  if (!rows.length) return "﻿";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers.join(sep), ...rows.map((r) => headers.map((h) => esc(r[h])).join(sep))].join("\r\n");
}
