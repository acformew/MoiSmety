import type { Completion, Report, ReportLine } from "../offline/model";
import type { EstimateItem } from "../lib/types";
export function reportLines(
  items: EstimateItem[],
  events: Completion[],
  kind: Report["kind"],
  from: string,
  to: string,
  used: Set<string> = new Set(),
): { lines: ReportLine[]; eventIds: string[] } {
  if (kind === "period" && (!from || !to || from > to))
    throw Error("Укажите корректный период");
  const selected = events.filter(
    (e) =>
      e.date >= from &&
      e.date <= to &&
      !used.has(e.id) &&
      items.some((i) => i.id === e.item_id),
  );
  const lines = items.map((item) => {
    const entries = selected.filter((e) => e.item_id === item.id);
    const completed =
      kind === "progress"
        ? Number(item.completed_qty)
        : Math.round(entries.reduce((sum, e) => sum + e.delta, 0) * 1000) /
          1000;
    const amount =
      kind === "progress"
        ? completed * Number(item.unit_price)
        : entries.reduce(
            (sum, e) => sum + Math.round(e.delta * e.unit_price * 100) / 100,
            0,
          );
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      planned: Number(item.planned_qty),
      completed,
      percent: item.planned_qty > 0 ? (completed / item.planned_qty) * 100 : 0,
      price: Number(item.unit_price),
      amount: Math.round(amount * 100) / 100,
      remaining:
        Math.round((item.planned_qty - item.completed_qty) * 1000) / 1000,
      note: item.note,
    };
  });
  return {
    lines,
    eventIds: kind === "period" ? selected.map((e) => e.id) : [],
  };
}
