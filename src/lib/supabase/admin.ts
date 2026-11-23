import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Rol que declara una clave de Supabase. Las claves JWT llevan el rol en el payload;
 * las nuevas claves opacas se distinguen por prefijo (sb_secret_ / sb_publishable_).
 */
function keyRole(key: string): string | null {
  if (key.startsWith("sb_secret_")) return "service_role";
  if (key.startsWith("sb_publishable_")) return "anon";
  try {
    const payload = key.split(".")[1];
    return payload ? (JSON.parse(Buffer.from(payload, "base64url").toString()).role ?? null) : null;
  } catch {
    return null;
  }
}

/** Cliente con service role. Usar SOLO en Server Actions tras verificar rol admin, o tras validar un enlace firmado. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor");
  const role = keyRole(key);
  if (role !== "service_role") {
    // Error frecuente: pegar la clave anon/publishable en esta variable. Falla claro en vez de a medias.
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY no es la clave service_role (es "${role ?? "desconocida"}"). Cópiela de Supabase → Project Settings → API Keys.`);
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
