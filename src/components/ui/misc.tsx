import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: LucideIcon; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-sand p-3"><Icon strokeWidth={1.75} className="size-5 text-ink-muted" /></div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "ok" | "warn" | "danger" }) {
  const color = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/** Pestañas basadas en URL (searchParams) — persistentes y compartibles. */
export function UrlTabs({ tabs, active, basePath, params = {} }: {
  tabs: { key: string; label: string; count?: number }[]; active: string; basePath: string; params?: Record<string, string | undefined>;
}) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <nav className="inline-flex min-w-full gap-1 rounded-lg border border-sand-border bg-sand/60 p-1 sm:min-w-0">
        {tabs.map((t) => {
          const qs = new URLSearchParams(Object.entries({ ...params, tab: t.key }).filter(([, v]) => v) as [string, string][]);
          return (
            <Link key={t.key} href={`${basePath}?${qs.toString()}`} scroll={false}
              className={cn("flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors sm:flex-none",
                active === t.key ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink")}>
              {t.label}
              {t.count !== undefined ? <span className="rounded-sm bg-sand px-1.5 text-xs tabular-nums text-ink-muted">{t.count}</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn("mt-0.5 text-base font-semibold tabular-nums text-ink",
        tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</p>
      {hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}

export function Alert({ tone = "warn", children }: { tone?: "ok" | "warn" | "danger"; children: React.ReactNode }) {
  const t = { ok: "bg-ok-bg text-ok border-ok/20", warn: "bg-warn-bg text-warn border-warn/20", danger: "bg-danger-bg text-danger border-danger/20" }[tone];
  return <div className={cn("rounded-md border px-3 py-2 text-sm", t)}>{children}</div>;
}
