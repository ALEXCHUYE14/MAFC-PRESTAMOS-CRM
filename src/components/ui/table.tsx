import * as React from "react";
import { cn } from "@/lib/utils";

export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-x-auto", className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...props} />;
}

export function Th({ className, align, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <th className={cn(
      "whitespace-nowrap border-b border-sand-border bg-canvas px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", className)} {...props} />
  );
}

export function Td({ className, align, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <td className={cn(
      "whitespace-nowrap border-b border-sand-border/70 px-3 py-2.5 text-ink first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
      align === "right" && "text-right tabular-nums", align === "center" && "text-center", className)} {...props} />
  );
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-canvas/70", className)} {...props} />;
}
