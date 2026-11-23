import { Check } from "lucide-react";

/**
 * Ilustración de una tarjeta de control de pagos de un préstamo diario: la que el cobrador
 * sella en cada visita. Lunes a sábado, sin domingo (el sistema excluye domingos en los
 * préstamos diarios). Es decorativa: se oculta a lectores de pantalla.
 */
const DAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
const TOTAL = 24;
const PAID = 15;
const AMOUNT = 50;

export function PaymentCard({ currency }: { currency: string }) {
  const money = (v: number) => `${currency} ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div aria-hidden className="w-full max-w-[440px] -rotate-[1.5deg] rounded-[14px] bg-[#FBFAF6] p-6 text-ink shadow-[0_1px_0_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.45)]">
      <div className="flex items-start justify-between gap-4 border-b border-dashed border-ink/15 pb-4">
        <div>
          <p className="font-serif text-lg font-semibold leading-tight">Tarjeta de pagos</p>
          <p className="mt-1 text-[13px] text-ink-muted">Préstamo diario de {TOTAL} cuotas</p>
        </div>
        <div className="text-right">
          <p className="text-[13px] text-ink-muted">Cuota</p>
          <p className="font-semibold tabular-nums">{money(AMOUNT)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-6 gap-1.5">
        {DAYS.map((d) => <p key={d} className="pb-1 text-center text-[11px] font-medium text-ink-faint">{d}</p>)}
        {Array.from({ length: TOTAL }, (_, i) => {
          const n = i + 1;
          const paid = n <= PAID;
          const today = n === PAID + 1;
          return (
            <div key={n} className={
              "relative grid aspect-square place-items-center rounded-md border text-[11px] tabular-nums " +
              (today ? "border-brand bg-brand-soft font-semibold text-brand" : "border-ink/10 text-ink-faint")
            }>
              <span className="absolute left-1 top-0.5">{n}</span>
              {paid && (
                <span
                  className="stamp grid size-[62%] place-items-center rounded-full border-[1.5px] border-brand/70 text-brand/80"
                  style={{ "--stamp-delay": `${200 + i * 45}ms`, "--stamp-rot": `${((n * 37) % 23) - 11}deg` } as React.CSSProperties}
                >
                  <Check strokeWidth={2.5} className="size-[55%]" />
                </span>
              )}
              {today && <span className="mt-2 text-[10px] font-medium">hoy</span>}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-dashed border-ink/15 pt-4 text-[13px]">
        <div><p className="text-ink-muted">Pagado</p><p className="font-semibold tabular-nums text-ok">{money(PAID * AMOUNT)}</p></div>
        <div className="text-right"><p className="text-ink-muted">Saldo</p><p className="font-semibold tabular-nums">{money((TOTAL - PAID) * AMOUNT)}</p></div>
      </div>
    </div>
  );
}
