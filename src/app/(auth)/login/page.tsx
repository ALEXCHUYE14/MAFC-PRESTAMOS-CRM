import { Inter, Source_Serif_4 } from "next/font/google";
import { Landmark } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { LoginForm } from "./login-form";
import { PaymentCard } from "./payment-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ingresar" };
// La marca puede cambiar desde Ajustes: no se cachea la página
export const dynamic = "force-dynamic";

// Fuentes cargadas solo en esta página (las variables quedan acotadas a <main>)
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap", weight: ["600"] });

// Solo se muestran mensajes conocidos: nunca texto arbitrario tomado de la URL.
const ERROR_MESSAGES: Record<string, string> = {
  sin_perfil: "Su usuario no tiene un perfil registrado en el sistema. Pida al administrador que lo dé de alta.",
  inactivo: "Su usuario está desactivado. Comuníquese con el administrador.",
};

interface Branding { name: string; logo: string | null; currency: string }

/** Nombre, logo y moneda configurados en Ajustes. Si no se pueden leer, valores neutros. */
async function getBranding(): Promise<Branding> {
  const fallback: Branding = { name: "Sistema de préstamos", logo: null, currency: "S/" };
  try {
    const { data } = await createAdminClient()
      .from("system_settings").select("business_name, logo_url, currency_symbol").eq("id", 1).maybeSingle();
    if (!data) return fallback;
    const logo = data.logo_url && /^https:\/\//i.test(data.logo_url) ? data.logo_url : null;
    return { name: data.business_name?.trim() || fallback.name, logo, currency: data.currency_symbol?.trim() || fallback.currency };
  } catch {
    return fallback;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const brand = await getBranding();
  const initialError = sp.error ? ERROR_MESSAGES[sp.error] ?? "No se pudo validar su acceso. Intente ingresar de nuevo." : undefined;

  return (
    <main className={cn(sans.variable, serif.variable, "grid min-h-dvh bg-canvas font-sans lg:grid-cols-[minmax(440px,5fr)_7fr]")}>
      <section className="flex flex-col px-6 pb-8 pt-[max(2rem,env(safe-area-inset-top))] sm:px-12 lg:px-16">
        <header className="flex items-center gap-3">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt="" className="size-10 rounded-lg object-contain" />
          ) : (
            <span className="grid size-10 place-items-center rounded-lg bg-brand text-white">
              <Landmark strokeWidth={1.75} className="size-5" aria-hidden />
            </span>
          )}
          <span className="text-[15px] font-semibold tracking-[-0.01em]">{brand.name}</span>
        </header>

        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-[380px]">
            <h1 className="font-serif text-[2rem] font-semibold leading-[1.15] tracking-[-0.015em]">Ingresar</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
              Use el correo y la contraseña que le asignó el administrador.
            </p>
            <LoginForm next={sp.next ?? "/"} initialError={initialError} />
          </div>
        </div>

        <footer className="max-w-[380px] text-xs leading-relaxed text-ink-faint">
          Acceso exclusivo para el personal de {brand.name}. Cada operación queda registrada con su usuario.
        </footer>
      </section>

      <aside className="relative hidden flex-col items-center justify-center overflow-hidden bg-brand px-12 py-16 lg:flex">
        {/* Trama de cuadrícula sutil, como el papel cuadriculado de un cuaderno de cobranza */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative flex w-full max-w-[440px] flex-col gap-10">
          <PaymentCard currency={brand.currency} />
          <p className="max-w-[36ch] text-[15px] leading-relaxed text-white/75">
            Cada abono queda sellado en el cronograma, sumado en la caja del día y respaldado con el recibo del cliente.
          </p>
        </div>
      </aside>
    </main>
  );
}
