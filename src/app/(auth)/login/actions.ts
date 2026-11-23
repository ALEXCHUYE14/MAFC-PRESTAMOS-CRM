"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: "Credenciales incorrectas o usuario inactivo." };
  const next = String(formData.get("next") ?? "/");
  // Solo rutas internas: "//dominio.com" o "/\dominio.com" serían redirecciones abiertas.
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login");
  redirect(safe ? next : "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
