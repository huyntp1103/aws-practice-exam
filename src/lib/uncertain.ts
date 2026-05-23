import type { UncertainBank, UncertainItem } from "./types";

export type UncertainMap = Map<number, UncertainItem>;

export function toUncertainMap(bank: UncertainBank | null): UncertainMap {
  const m: UncertainMap = new Map();
  if (!bank) return m;
  for (const it of bank.items) m.set(it.number, it);
  return m;
}
