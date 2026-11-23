import { CalendarCheck, MessageSquareText } from "lucide-react";
import { CONTACT_RESULT_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/formatters";
import type { CollectionNote } from "@/types/database";

export function NotesTimeline({ notes, authors }: { notes: CollectionNote[]; authors: Record<string, string> }) {
  if (!notes.length) return <p className="text-sm text-ink-muted">Sin gestiones registradas.</p>;
  return (
    <ol className="space-y-4">
      {notes.map((n) => (
        <li key={n.id} className="flex gap-3">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-sand">
            {n.contact_result === "promesa_pago"
              ? <CalendarCheck strokeWidth={1.75} className="size-3.5 text-warn" />
              : <MessageSquareText strokeWidth={1.75} className="size-3.5 text-ink-muted" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{CONTACT_RESULT_LABEL[n.contact_result]}
              {n.promise_date ? <span className="ml-2 text-xs font-normal text-warn">Promesa: {formatDate(n.promise_date)}{n.promise_amount ? ` · ${n.promise_amount.toFixed(2)}` : ""}</span> : null}
            </p>
            {n.notes ? <p className="text-sm text-ink-muted">{n.notes}</p> : null}
            <p className="mt-0.5 text-xs text-ink-faint">{formatDateTime(n.created_at)} · {authors[n.created_by ?? ""] ?? "—"}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
