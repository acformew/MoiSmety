import type { Estimate, EstimateItem, WorkItem } from "../lib/types";
export interface Completion {
  id: string;
  user_id: string;
  estimate_id: string;
  item_id: string;
  date: string;
  delta: number;
  unit_price: number;
  created_at: string;
}
export interface ReportLine {
  id: string;
  name: string;
  unit: string;
  planned: number;
  completed: number;
  percent: number;
  price: number;
  amount: number;
  remaining: number;
  note: string;
}
export interface Report {
  id: string;
  user_id: string;
  estimate_id: string;
  title: string;
  customer: string;
  date: string;
  from: string;
  to: string;
  kind: "period" | "progress";
  status: "draft" | "final";
  note: string;
  lines: ReportLine[];
  event_ids: string[];
  photos: string[];
  created_at: string;
}
export interface Photo {
  id: string;
  user_id: string;
  report_id: string;
  data: string;
  created_at: string;
}
export interface Snapshot {
  work_items: WorkItem[];
  estimates: Estimate[];
  estimate_items: EstimateItem[];
  completions: Completion[];
  reports: Report[];
  report_photos: Photo[];
}
export type Table = keyof Snapshot;
export type Row = Snapshot[Table][number];
export const tables: Table[] = [
  "work_items",
  "estimates",
  "estimate_items",
  "completions",
  "reports",
  "report_photos",
];
export const empty = (): Snapshot => ({
  work_items: [],
  estimates: [],
  estimate_items: [],
  completions: [],
  reports: [],
  report_photos: [],
});
export interface Change {
  table: Table;
  id: string;
  before: Row | null;
  after: Row | null;
}
export interface Inflight {
  id: string;
  changes: Change[];
  sent: Snapshot;
}
export interface State {
  data: Snapshot;
  base: Snapshot;
  inflight?: Inflight;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function diff(before: Snapshot, after: Snapshot): Change[] {
  return tables.flatMap((table) => {
    const old = new Map(before[table].map((row) => [row.id, row]));
    const next = new Map(after[table].map((row) => [row.id, row]));
    return [...new Set([...old.keys(), ...next.keys()])].flatMap((id) => {
      const a = old.get(id) ?? null,
        b = next.get(id) ?? null;
      return canonical(a) === canonical(b)
        ? []
        : [{ table, id, before: a, after: b }];
    });
  });
}
export function apply(snapshot: Snapshot, changes: Change[]): Snapshot {
  const result = structuredClone(snapshot);
  for (const change of changes) {
    const rows = result[change.table] as Row[];
    const index = rows.findIndex((row) => row.id === change.id);
    if (index >= 0) rows.splice(index, 1);
    if (change.after) rows.push(structuredClone(change.after));
  }
  return result;
}
export function acknowledge(state: State, remote: Snapshot): State {
  if (!state.inflight) throw Error("Нет отправленной операции");
  return {
    base: remote,
    data: apply(remote, diff(state.inflight.sent, state.data)),
  };
}
export function rebase(state: State, remote: Snapshot): State {
  return { base: remote, data: apply(remote, diff(state.base, state.data)) };
}
