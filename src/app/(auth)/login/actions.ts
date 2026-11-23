"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  error: string | null;
  /** Se devuelve para no obligar a reescribir el correo tras un error (nunca la contraseña). */
  email?: string;
  /** true solo cuando el problema está en los datos ingresados (marca los campos en rojo). */
  invalid?: boolean;
}

export async function signIn(_: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Ingrese su correo y su contraseña.", email, invalid: true };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Mensaje único a propósito: no revela si el correo existe en el sistema.
  if (error) return { error: "El correo o la contraseña no son correctos. Revise los datos e intente de nuevo.", email, invalid: true };

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
