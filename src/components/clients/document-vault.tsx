"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileImage, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { registerDocument } from "@/app/(dashboard)/clientes/actions";

const KINDS = [
  ["foto_cliente", "Foto del cliente"], ["documento_anverso", "Documento (anverso)"], ["documento_reverso", "Documento (reverso)"],
  ["negocio", "Foto del negocio"], ["garantia", "Garantía"], ["otro", "Otro"],
] as const;

export interface VaultDoc { id: string; kind: string; url: string | null; created_at: string }

/** Bóveda documental en Supabase Storage (bucket privado `client-docs/<client_id>/...`). */
export function DocumentVault({ clientId, docs }: { clientId: string; docs: VaultDoc[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>("foto_cliente");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (file: File) => {
    setError(null);
    start(async () => {
      if (file.size > 8 * 1024 * 1024) { setError("El archivo supera 8 MB."); return; }
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${clientId}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("client-docs").upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) { setError(upErr.message); return; }
      const res = await registerDocument(clientId, kind, path);
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  };

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="sm:w-56">
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        <Button type="button" variant="secondary" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? <Loader2 strokeWidth={1.75} className="animate-spin" /> : <Camera strokeWidth={1.75} />}
          {pending ? "Subiendo…" : "Tomar foto / subir"}
        </Button>
      </div>
      {error ? <div className="mt-2"><Alert tone="danger">{error}</Alert></div> : null}
      {docs.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted"><Upload strokeWidth={1.75} className="size-4" />Aún no hay documentos.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {docs.map((d) => (
            <li key={d.id} className="overflow-hidden rounded-md border border-sand-border">
              <a href={d.url ?? "#"} target="_blank" rel="noreferrer" className="block">
                {d.url && !d.url.includes(".pdf") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.url} alt={d.kind} className="aspect-[4/3] w-full bg-sand object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-sand"><FileImage strokeWidth={1.75} className="size-6 text-ink-muted" /></div>
                )}
                <p className="truncate px-2 py-1.5 text-xs text-ink-muted">{KINDS.find((k) => k[0] === d.kind)?.[1] ?? d.kind}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
