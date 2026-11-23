"use client";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, ArrowUpFromLine, Eye, EyeOff, Loader2 } from "lucide-react";
import { signIn, type SignInState } from "./actions";
import { cn } from "@/lib/utils";

const field =
  "h-12 w-full rounded-lg border border-sand-border bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-faint " +
  "transition-[border-color,box-shadow] duration-150 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 " +
  "aria-[invalid=true]:border-danger/60";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action] = useActionState<SignInState, FormData>(signIn, { error: initialError ?? null });
  // Controlado: React restablece los campos no controlados tras cada envío y el correo se perdería.
  const [email, setEmail] = useState(state.email ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const errorId = useId();
  const capsId = useId();
  const hasError = Boolean(state.error);
  // Los avisos de cuenta (sin perfil, desactivada) no son culpa de lo escrito: no se marcan los campos
  const invalid = hasError && state.invalid === true;

  const detectCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") setCapsLock(e.getModifierState("CapsLock"));
  };

  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next} />

      {hasError && (
        <div id={errorId} role="alert" className="flex gap-2.5 rounded-lg border border-danger/20 bg-danger-bg px-3.5 py-3 text-sm text-danger">
          <AlertCircle strokeWidth={1.75} className="mt-px size-4 shrink-0" aria-hidden />
          <p className="leading-snug">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-ink">Correo</label>
        <input
          id="email" name="email" type="email" required autoFocus
          autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          maxLength={254} placeholder="nombre@empresa.com"
          value={email} onChange={(e) => setEmail(e.target.value)}
          aria-invalid={invalid || undefined} aria-describedby={hasError ? errorId : undefined}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-ink">Contraseña</label>
        <div className="relative">
          <input
            id="password" name="password" type={showPassword ? "text" : "password"} required
            autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            onKeyDown={detectCaps} onKeyUp={detectCaps} onBlur={() => setCapsLock(false)}
            aria-invalid={invalid || undefined}
            aria-describedby={[hasError ? errorId : "", capsLock ? capsId : ""].filter(Boolean).join(" ") || undefined}
            className={cn(field, "pr-12")}
          />
          <button
            type="button" onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} aria-controls="password"
            className="absolute inset-y-0 right-1 my-1 grid w-10 place-items-center rounded-md text-ink-muted hover:bg-sand hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {showPassword ? <EyeOff strokeWidth={1.75} className="size-[18px]" /> : <Eye strokeWidth={1.75} className="size-[18px]" />}
          </button>
        </div>
        {capsLock && (
          <p id={capsId} className="mt-2 flex items-center gap-1.5 text-[13px] text-warn" aria-live="polite">
            <ArrowUpFromLine strokeWidth={1.75} className="size-3.5" aria-hidden />Bloq Mayús está activado
          </p>
        )}
      </div>

      <Submit />

      <p className="text-[13px] leading-relaxed text-ink-muted">
        ¿Olvidó su contraseña? Pida al administrador del sistema que le asigne una nueva.
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit" disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-medium text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 disabled:cursor-wait disabled:opacity-80"
    >
      {pending && <Loader2 strokeWidth={2} className="size-4 animate-spin" aria-hidden />}
      {pending ? "Verificando…" : "Ingresar"}
    </button>
  );
}
