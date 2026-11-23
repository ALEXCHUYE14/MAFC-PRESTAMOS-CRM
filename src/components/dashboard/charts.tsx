"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMoney } from "@/components/ui/money";
import { formatShortDate } from "@/lib/formatters";

const C = { brand: "#1E3F32", sand: "#C9C3B6", ok: "#2B6A3E", warn: "#9A5B13", danger: "#9E2A2B", dangerSoft: "#C96B5C", grid: "#E2DFD7", ink: "#575E59" };

export function FlowChart({ data }: { data: { fecha: string; cobrado: number; desembolsado: number }[] }) {
  const { fmt } = useMoney();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="fecha" tickFormatter={formatShortDate} tick={{ fill: C.ink, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={12} />
        <YAxis tick={{ fill: C.ink, fontSize: 11 }} axisLine={false} tickLine={false} width={56}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip cursor={{ fill: "#EFECE6" }} formatter={(v: number) => fmt(v)} labelFormatter={(l: string) => formatShortDate(l)}
          contentStyle={{ borderRadius: 8, border: `1px solid ${C.grid}`, fontSize: 12 }} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: C.ink }} />
        <Bar dataKey="cobrado" name="Cobrado" fill={C.brand} radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Bar dataKey="desembolsado" name="Desembolsado" fill={C.sand} radius={[3, 3, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PortfolioChart({ data }: { data: { al_dia: number; por_vencer: number; mora_1_7: number; mora_8_mas: number } }) {
  const rows = [
    { name: "Al día", value: data.al_dia, color: C.ok },
    { name: "Por vencer (3 días)", value: data.por_vencer, color: C.warn },
    { name: "Mora 1-7 días", value: data.mora_1_7, color: C.dangerSoft },
    { name: "Mora +8 días", value: data.mora_8_mas, color: C.danger },
  ];
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={total ? rows : [{ name: "Sin datos", value: 1, color: C.grid }]} dataKey="value" innerRadius={52} outerRadius={78} paddingAngle={total ? 2 : 0} stroke="none">
              {(total ? rows : [{ color: C.grid }]).map((r, i) => <Cell key={i} fill={r.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-xs text-ink-muted">préstamos</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: r.color }} />
            <span className="flex-1 text-ink-muted">{r.name}</span>
            <span className="font-medium tabular-nums">{r.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{total ? Math.round((r.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
