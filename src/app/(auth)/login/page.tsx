import { Landmark } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Ingresar" };

// Solo se muestran mensajes conocidos: nunca texto arbitrario tomado de la URL.
const ERROR_MESSAGES: Record<string, string> = {
  sin_perfil: "Su usuario no tiene un perfil registrado en el sistema. Pida al administrador que lo dé de alta.",
  inactivo: "Su usuario está desactivado. Comuníquese con el administrador.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand p-10 text-white lg:flex">
        <div className="flex items-center gap-2 text-sm font-medium opacity-90">
          <Landmark strokeWidth={1.75} className="size-5" /> Core de Préstamos
        </div>
        <div>
          <p className="font-serif text-4xl leading-tight">Cartera, cobranza y caja<br />en un solo libro.</p>
          <p className="mt-4 max-w-md text-sm text-white/70">Cronogramas exactos al céntimo, ruta diaria para cobradores y arqueo de caja con trazabilidad completa.</p>
        </div>
        <p className="text-xs text-white/50">Acceso restringido a personal autorizado.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Landmark strokeWidth={1.75} className="size-7 text-brand" /></div>
          <h1 className="font-serif text-2xl font-semibold">Ingresar</h1>
          <p className="mt-1 text-sm text-ink-muted">Use las credenciales asignadas por el administrador.</p>
          <LoginForm next={sp.next ?? "/"} initialError={sp.error ? ERROR_MESSAGES[sp.error] ?? "No se pudo validar su acceso." : undefined} />
        </div>
      </section>
    </main>
  );
}
