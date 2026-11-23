import type { SystemSettings, WhatsappTemplates } from "@/types/database";

export type MoneySettings = Pick<SystemSettings, "currency_code" | "currency_symbol" | "currency_position" | "currency_decimals">;

export const DEFAULT_MONEY: MoneySettings = {
  currency_code: "PEN",
  currency_symbol: "S/",
  currency_position: "before",
  currency_decimals: 2,
};

/** Formatea montos según Ajustes > Moneda (símbolo, posición y decimales). */
export function formatMoney(amount: number | null | undefined, s: MoneySettings = DEFAULT_MONEY): string {
  const value = Number(amount ?? 0);
  const n = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: s.currency_decimals,
    maximumFractionDigits: s.currency_decimals,
  }).format(Math.abs(value));
  const sign = value < 0 ? "−" : "";
  return s.currency_position === "before" ? `${sign}${s.currency_symbol} ${n}` : `${sign}${n} ${s.currency_symbol}`;
}

export function formatCents(cents: number, s: MoneySettings = DEFAULT_MONEY): string {
  return formatMoney(cents / 100, s);
}

export function formatPercent(v: number, digits = 2): string {
  return `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: digits }).format(v)}%`;
}

/** `YYYY-MM-DD` o ISO → `dd/mm/aaaa` sin desfase de zona horaria. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m && value.length === 10) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined, timeZone = "America/Lima"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone,
  }).format(new Date(value));
}

export function formatShortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(d)} ${months[Number(m) - 1]}`;
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del negocio. */
export function todayISO(timeZone = "America/Lima"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Instante UTC en que empieza el día `dateISO` en la zona horaria indicada. */
export function startOfDayUTC(dateISO: string, timeZone = "America/Lima"): string {
  const guess = new Date(`${dateISO}T00:00:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone }));
  return new Date(guess.getTime() + (guess.getTime() - local.getTime())).toISOString();
}

/** Normaliza el teléfono y antepone el código de país para wa.me */
export function normalizePhone(phone: string, countryCode = "51"): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith(countryCode) && digits.length > 9) return digits;
  return `${countryCode}${digits.replace(/^0+/, "")}`;
}

export function whatsappLink(phone: string, message: string, countryCode = "51"): string {
  return `https://wa.me/${normalizePhone(phone, countryCode)}?text=${encodeURIComponent(message)}`;
}

export type TemplateVars = Partial<Record<
  "cliente" | "negocio" | "monto_cuota" | "saldo_total" | "fecha_vencimiento" | "dias_mora" | "link_recibo",
  string | number
>>;

export const TEMPLATE_VARIABLES: (keyof TemplateVars)[] = [
  "cliente", "negocio", "monto_cuota", "saldo_total", "fecha_vencimiento", "dias_mora", "link_recibo",
];

export const TEMPLATE_LABEL: Record<keyof WhatsappTemplates, string> = {
  bienvenida: "Bienvenida / Desembolso",
  recordatorio: "Recordatorio preventivo",
  mora: "Aviso de mora",
  recibo: "Recibo de pago",
};

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = vars[key as keyof TemplateVars];
    return v === undefined || v === null ? match : String(v);
  });
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
