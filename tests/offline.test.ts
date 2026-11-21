import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import {
  acknowledge,
  diff,
  empty,
  rebase,
  type State,
} from "../src/offline/model";
import { readState, editState } from "../src/offline/storage";
import { reportLines } from "../src/reports/calculate";
const row = {
  id: "work",
  user_id: "one",
  name: "Штукатурка",
  unit: "м²",
  price: 20,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
describe("durable account state", () => {
  it("persists edits, keeps separate accounts and serializes overlapping writes", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
    });
    await Promise.all([
      editState("one", (s) => {
        s.data.work_items.push(row);
        return s;
      }),
      editState("one", (s) => {
        s.data.work_items[0].price = 30;
        return s;
      }),
    ]);
    expect((await readState("one")).data.work_items[0].price).toBe(30);
    expect((await readState("two")).data.work_items).toEqual([]);
  });
  it("retains edits made during a request and acknowledges canonical server values", () => {
    const base = empty();
    const sent = empty();
    sent.work_items = [row];
    const data = structuredClone(sent);
    data.work_items[0].price = 35;
    const remote = structuredClone(sent);
    remote.work_items[0].updated_at = "server";
    const state: State = {
      base,
      data,
      inflight: { id: "stable-retry-id", changes: diff(base, sent), sent },
    };
    const next = acknowledge(state, remote);
    expect(next.data.work_items[0].price).toBe(35);
    expect(next.data.work_items[0].updated_at).toBe(row.updated_at);
    expect(diff(next.base, next.data)).toHaveLength(1);
  });
  it("explicit rebase preserves remote additions and local edits", () => {
    const base = empty();
    base.work_items = [row];
    const data = structuredClone(base);
    data.work_items[0].price = 45;
    const remote = structuredClone(base);
    remote.work_items.push({ ...row, id: "new" });
    expect(
      rebase({ base, data }, remote).data.work_items.map((w) => w.price),
    ).toEqual([20, 45]);
  });
});
describe("period history", () => {
  const item = {
    ...row,
    estimate_id: "estimate",
    position: 0,
    unit_price: 20,
    planned_qty: 100,
    completed_qty: 70,
    note: "",
    custom_values: {},
  };
  const events = [
    {
      id: "a",
      user_id: "one",
      estimate_id: "estimate",
      item_id: "work",
      date: "2026-02-01",
      delta: 5,
      unit_price: 20,
      created_at: "",
    },
    {
      id: "b",
      user_id: "one",
      estimate_id: "estimate",
      item_id: "work",
      date: "2026-02-02",
      delta: -2,
      unit_price: 20,
      created_at: "",
    },
  ];
  it("excludes historical cumulative totals and includes signed corrections", () => {
    const result = reportLines(
      [item],
      events,
      "period",
      "2026-02-01",
      "2026-02-02",
    );
    expect(result.lines[0].completed).toBe(3);
    expect(result.lines[0].amount).toBe(60);
    expect(
      reportLines([item], events, "progress", "", "").lines[0].completed,
    ).toBe(70);
  });
  it("includes date boundaries, excludes events already claimed and validates ranges", () => {
    expect(
      reportLines(
        [item],
        events,
        "period",
        "2026-02-01",
        "2026-02-02",
        new Set(["a"]),
      ).lines[0].completed,
    ).toBe(-2);
    expect(() =>
      reportLines([item], events, "period", "2026-02-02", "2026-02-01"),
    ).toThrow();
  });
});
it("fully reversed fractional work has zero quantity and zero cost", () => {
  const item = {
    ...row,
    estimate_id: "estimate",
    position: 0,
    unit_price: 1,
    planned_qty: 1,
    completed_qty: 0,
    note: "",
    custom_values: {},
  };
  const event = {
    id: "first",
    user_id: "one",
    estimate_id: "estimate",
    item_id: "work",
    date: "2026-02-01",
    delta: 0.005,
    unit_price: 1,
    created_at: "",
  };
  const result = reportLines(
    [item],
    [event, { ...event, id: "correction", delta: -0.005 }],
    "period",
    "2026-02-01",
    "2026-02-01",
  );
  expect(result.lines[0].completed).toBe(0);
  expect(result.lines[0].amount).toBe(0);
});
