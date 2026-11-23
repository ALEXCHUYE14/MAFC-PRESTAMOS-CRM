"use client";
import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CollectionNoteForm } from "./collection-note-form";

export function NoteSheet({ clientId, loanId, clientName, compact }: { clientId: string; loanId: string; clientName: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className={compact
          ? "rounded-md p-1.5 text-ink-muted hover:bg-sand"
          : "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium text-ink-muted hover:bg-sand"}
          aria-label="Registrar gestión">
          <NotebookPen strokeWidth={1.75} className="size-4" />{!compact && "Gestión"}
        </button>
      </SheetTrigger>
      <SheetContent title="Gestión de cobranza" description={clientName}>
        <CollectionNoteForm clientId={clientId} loanId={loanId} onDone={() => setTimeout(() => setOpen(false), 700)} />
      </SheetContent>
    </Sheet>
  );
}
