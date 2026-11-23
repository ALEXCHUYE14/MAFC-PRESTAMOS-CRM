import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, SystemSettings, UserRole } from "@/types/database";

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    redirect(`/login?error=${profile ? "inactivo" : "sin_perfil"}`);
  }
  if (roles && !roles.includes(profile.role)) redirect("/?denied=1");
  return profile;
}

export const getSettings = cache(async (): Promise<SystemSettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("system_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("No se pudo leer system_settings. ¿Ejecutó supabase/schema.sql?");
  return data;
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
