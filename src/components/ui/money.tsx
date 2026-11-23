"use client";
import { createContext, useContext } from "react";
import { DEFAULT_MONEY, formatMoney, type MoneySettings } from "@/lib/formatters";

const MoneyContext = createContext<MoneySettings>(DEFAULT_MONEY);

export function MoneyProvider({ value, children }: { value: MoneySettings; children: React.ReactNode }) {
  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>;
}

export function useMoney() {
  const s = useContext(MoneyContext);
  return { settings: s, fmt: (v: number | null | undefined) => formatMoney(v, s) };
}
