"use client";
import { useEffect } from "react";
import { Printer } from "lucide-react";

export function PrintControls({ auto, shareUrl, shareText }: { auto?: boolean; shareUrl?: string; shareText?: string }) {
  useEffect(() => { if (auto) setTimeout(() => window.print(), 350); }, [auto]);
  return (
    <div className="no-print mx-auto mb-4 flex max-w-md justify-center gap-2">
      <button onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white">
        <Printer strokeWidth={1.75} className="size-4" />Imprimir
      </button>
      {shareUrl && (
        <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-md border border-sand-border bg-surface px-4 text-sm font-medium">
          {shareText ?? "Compartir"}
        </a>
      )}
    </div>
  );
}
