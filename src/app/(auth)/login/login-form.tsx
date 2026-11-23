"use client";
import { useActionState } from "react";
import { Input, Field } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/misc";
import { signIn } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action] = useActionState(signIn, { error: initialError ?? null });
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Correo" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Contraseña" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SubmitButton className="w-full" pendingText="Ingresando…">Ingresar</SubmitButton>
    </form>
  );
}
