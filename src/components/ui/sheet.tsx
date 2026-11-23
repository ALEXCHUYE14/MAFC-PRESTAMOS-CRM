"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

/** Panel deslizable: lateral en escritorio, hoja inferior en móvil. */
export function SheetContent({ title, description, children, className, side = "right" }: {
  title: string; description?: string; children: React.ReactNode; className?: string; side?: "right" | "bottom";
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-in" />
      <Dialog.Content
        className={cn(
          "fixed z-50 flex flex-col bg-surface shadow-xl focus:outline-none",
          side === "right"
            ? "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-xl sm:rounded-none sm:border-l sm:border-sand-border"
            : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-sand-border px-5 py-4">
          <div>
            <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
            {description ? <Dialog.Description className="mt-0.5 text-sm text-ink-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          </div>
          <Dialog.Close className="rounded-md p-2 text-ink-muted hover:bg-sand" aria-label="Cerrar">
            <X strokeWidth={1.75} className="size-5" />
          </Dialog.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
