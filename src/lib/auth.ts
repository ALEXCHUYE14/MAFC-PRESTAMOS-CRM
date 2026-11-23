import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, SystemSettings, UserRole } from "@/types/database";

/** Etiqueta de caché de los ajustes: se invalida al guardar en Ajustes (revalidateTag). */
export const SETTINGS_TAG = "system-settings";

/**
 * Usuario de la sesión, verificado. getClaims() valida la firma del JWT localmente cuando el
 * proyecto usa claves asimétricas (sin ida y vuelta al servidor de Auth: más rápido y menos
 * logs); con el secreto simétrico antiguo consulta al servidor, igual que getUser().
 */
export const getSessionUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string" || !sub) return null;
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  return { id: sub, email };
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) {
    // Error real de lectura (tabla inexistente, RLS, permisos...), distinto de "no hay fila".
    console.error(`[auth] No se pudo leer el perfil de ${user.email} (${user.id}):`, error.code, error.message);
  } else if (!data) {
    console.error(`[auth] El usuario ${user.email} (${user.id}) no tiene fila en public.profiles`);
  }
  return data;
});

export async function requireProfile(roles?: UserRole[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) {
    // Si hay sesión pero no hay perfil activo, NO basta con mandar a /login: el middleware
    // devolvería al usuario autenticado a "/" y se produciría un bucle de redirecciones.
    // El parámetro `error` hace que el middleware deje mostrar el login con el motivo.
    const user = await getSessionUser();
    if (!user) redirect("/login");
    redirect(`/login?error=${profile ? "inactivo" : "sin_perfil"}`);
  }
  if (roles && !roles.includes(profile.role)) redirect("/?denied=1");
  return profile;
}

/**
 * Ajustes en caché compartida del servidor: antes se leían de la base en CADA página.
 * Son los mismos para todos los usuarios (RLS los deja leer a cualquier autenticado).
 * Si la lectura falla se lanza el error: unstable_cache no guarda errores.
 */
const getCachedSettings = unstable_cache(
  async (): Promise<SystemSettings> => {
    const { data, error } = await createAdminClient().from("system_settings").select("*").eq("id", 1).single();
    if (error || !data) throw new Error(error?.message ?? "system_settings vacío");
    return data;
  },
  ["system-settings"],
  { tags: [SETTINGS_TAG], revalidate: 300 },
);

export const getSettings = cache(async (): Promise<SystemSettings> => {
  try {
    return await getCachedSettings();
  } catch {
    // Sin clave service_role (o caché no disponible): lectura directa con la sesión del usuario
    const supabase = await createClient();
    const { data, error } = await supabase.from("system_settings").select("*").eq("id", 1).single();
    if (error || !data) throw new Error("No se pudo leer system_settings. ¿Ejecutó supabase/schema.sql?");
    return data;
  }
});

export const ROLE_LABEL: Record<UserRole, string> = { admin: "Administrador", cajero: "Cajero", cobrador: "Cobrador" };

export function can(role: UserRole, action:
  | "settings" | "void_payment" | "disburse" | "create_client" | "reports" | "cash_manual" | "waive" | "audit"): boolean {
  switch (action) {
    case "settings": case "void_payment": case "audit": return role === "admin";
    case "disburse": case "create_client": case "cash_manual": case "waive": return role !== "cobrador";
    case "reports": return role !== "cobrador";
  }
}
