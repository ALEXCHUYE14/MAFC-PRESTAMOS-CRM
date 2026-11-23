import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";

/**
 * Enlaces públicos firmados para que el CLIENTE (sin cuenta en el sistema) pueda ver
 * su recibo o su estado de cuenta desde WhatsApp.
 *
 * El enlace lleva una firma HMAC-SHA256 de (tipo, id, vencimiento) con un secreto que
 * solo conoce el servidor: no se puede adivinar, ni cambiar el id para ver otro recibo,
 * ni extender el vencimiento. Ver `verifySignedLink`.
 */
export type LinkKind = "recibo" | "estado";

/** Vigencia de cada tipo de enlace. El recibo es un comprobante: dura más. */
const TTL_DAYS: Record<LinkKind, number> = { recibo: 180, estado: 30 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  // Secreto EXCLUSIVO para firmar enlaces. No se reutiliza ninguna clave de Supabase: si por
  // error una variable contuviera la clave anon (pública), cualquiera podría falsificar enlaces.
  // Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  const s = process.env.LINK_SIGNING_SECRET;
  if (!s || s.length < 32) throw new Error("Configure LINK_SIGNING_SECRET (mínimo 32 caracteres) en el servidor");
  if (s === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("LINK_SIGNING_SECRET no puede ser la clave anon (es pública)");
  return s;
}

function sign(kind: LinkKind, id: string, exp: number): string {
  return createHmac("sha256", secret()).update(`v1:${kind}:${id.toLowerCase()}:${exp}`).digest("base64url");
}

export function signedPath(kind: LinkKind, id: string, nowMs = Date.now()): string {
  if (!UUID_RE.test(id)) throw new Error("Identificador inválido");
  const exp = Math.floor(nowMs / 1000) + TTL_DAYS[kind] * 86_400;
  return `/v/${kind}/${id}?e=${exp}&t=${sign(kind, id, exp)}`;
}

export type LinkCheck = "ok" | "expired" | "invalid";

export function verifySignedLink(kind: LinkKind, id: string, e: unknown, t: unknown, nowMs = Date.now()): LinkCheck {
  if (!UUID_RE.test(id) || typeof e !== "string" || typeof t !== "string" || !/^\d{1,12}$/.test(e) || t.length > 100) {
    return "invalid";
  }
  const exp = Number(e);
  const expected = Buffer.from(sign(kind, id, exp));
  const received = Buffer.from(t);
  // Comparación en tiempo constante; se verifica la firma ANTES del vencimiento para no
  // revelar si un enlace manipulado "existió".
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return "invalid";
  return exp * 1000 < nowMs ? "expired" : "ok";
}

/** URL base pública del sistema, para armar enlaces absolutos (WhatsApp necesita URL completa). */
export async function appBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

export async function signedUrl(kind: LinkKind, id: string): Promise<string> {
  return `${await appBaseUrl()}${signedPath(kind, id)}`;
}
