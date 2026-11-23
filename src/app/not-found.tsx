import Link from "next/link";
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-serif text-2xl font-semibold">Página no encontrada</p>
      <Link className="text-sm text-brand underline" href="/">Volver al inicio</Link>
    </div>
  );
}
