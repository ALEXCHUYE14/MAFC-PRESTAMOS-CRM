import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toNumber(v: FormDataEntryValue | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function str(v: FormDataEntryValue | null | undefined): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };

/** Normaliza errores de Postgres/Supabase en mensajes legibles. */
export function errorMessage(e: unknown): string {
  if (!e) return "Error desconocido";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: string }).message);
  return "Error desconocido";
}
