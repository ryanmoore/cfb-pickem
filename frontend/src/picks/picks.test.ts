import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PickRow, SaveResult } from "../api";
import { fromRows, moved, reconcile, sameRows, shuffle, toRows, type Game } from "./model";
import { createSaveQueue, type Status } from "./saveQueue";

const game = (id: number, fixedWager: number | null = null): Game => ({
  id,
  name: `Game ${id}`,
  kickoffAt: "2030-12-20T00:00:00Z",
  fixedWager,
  slots: [{ id: id * 10, label: "A" }, { id: id * 10 + 1, label: "B" }],
});
const games = [game(1), game(2), game(3), game(4), game(5, 4)];

const confidences = (rows: PickRow[]) =>
  rows.map((r) => r.confidence).filter((c) => c !== null).sort();

describe("entry model", () => {
  it.each([0, 0.3, 0.999999])("shuffle keeps every item once (rand %s)", (r) => {
    expect(shuffle([1, 2, 3, 4, 5, 6], () => r).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([
    ["to the top", 3, 0, [3, 1, 2, 4]],
    ["to the bottom", 1, 99, [2, 3, 4, 1]],
    ["by one", 2, 2, [1, 3, 2, 4]],
  ])("moving a game %s keeps confidences 1..N and leaves playoff games unranked", (_, id, idx, order) => {
    const next = moved([1, 2, 3, 4], id, idx);
    expect(next).toEqual(order);
    const rows = toRows(games, { order: next, winners: {} });
    expect(confidences(rows)).toEqual([1, 2, 3, 4]);
    expect(rows.find((r) => r.game_id === 5)?.confidence).toBeNull();
    expect(rows.find((r) => r.game_id === next[0])?.confidence).toBe(4);
  });

  it("reads back an incomplete saved set as a complete entry", () => {
    const rows: PickRow[] = [
      { game_id: 3, slot_id: 30, confidence: 2 },
      { game_id: 1, slot_id: 99, confidence: 1 },
    ];
    const e = fromRows(games, rows);
    expect(e.order.slice(0, 2)).toEqual([3, 1]);
    expect([...e.order].sort()).toEqual([1, 2, 3, 4]);
    expect(e.winners).toEqual({ 3: 30 });
  });
});

it("compares rows by value, whatever order the server writes their keys", () => {
  const a: PickRow[] = [{ game_id: 1, slot_id: 10, confidence: 2 }];
  expect(sameRows(a, [{ confidence: 2, game_id: 1, slot_id: 10 }])).toBe(true);
  expect(sameRows(a, [{ confidence: 1, game_id: 1, slot_id: 10 }])).toBe(false);
});

describe("reconcile", () => {
  it.each([
    ["nothing changed", { order: [1, 2], winners: { 1: 10 } }, [game(1), game(2)], { order: [1, 2], winners: { 1: 10 } }],
    ["a ranked game is added at the bottom", { order: [2, 1], winners: {} }, [game(1), game(2), game(3)], { order: [2, 1, 3], winners: {} }],
    ["a playoff game is not ranked", { order: [1], winners: {} }, [game(1), game(5, 4)], { order: [1], winners: {} }],
    ["a game is removed, with its winner", { order: [3, 1, 2], winners: { 3: 30, 1: 10 } }, [game(1), game(2)], { order: [1, 2], winners: { 1: 10 } }],
    ["a slot is removed", { order: [1], winners: { 1: 10 } }, [{ ...game(1), slots: [{ id: 11, label: "B" }] }], { order: [1], winners: {} }],
  ])("%s", (_, entry, list, want) => {
    expect(reconcile(list, entry)).toEqual(want);
  });
});

describe("save queue", () => {
  const rows = (n: number): PickRow[] => [{ game_id: 1, slot_id: null, confidence: n }];
  let results: SaveResult[];
  let sent: PickRow[][];
  let statuses: Status["kind"][];
  let saved: number;
  let conflicts: (string | null)[];
  const queue = () =>
    createSaveQueue({
      send: async (r) => {
        sent.push(r);
        return results.shift() ?? { kind: "ok", version: "v" };
      },
      onStatus: (s) => statuses.push(s.kind),
      onAccepted: (_, current) => current && saved++,
      onConflict: (c) => conflicts.push(c.version),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    results = [];
    sent = [];
    statuses = [];
    saved = 0;
    conflicts = [];
  });
  afterEach(() => vi.useRealTimers());

  it("sends one request for a burst, with the latest set", async () => {
    const q = queue();
    [1, 2, 3].forEach((n) => q.change(rows(n)));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual([rows(3)]);
    expect(saved).toBe(1);
  });

  it("sends a change made in flight after the request ends", async () => {
    let finish: (r: SaveResult) => void = () => {};
    const q = createSaveQueue({
      send: (r) => new Promise((res) => (sent.push(r), (finish = res))),
      onStatus: (s) => statuses.push(s.kind),
      onAccepted: (_, current) => current && saved++,
      onConflict: () => {},
    });
    q.change(rows(1));
    await vi.advanceTimersByTimeAsync(1000);
    q.change(rows(2));
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([rows(1)]);
    finish({ kind: "ok", version: "v" });
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([rows(1), rows(2)]);
    expect(saved).toBe(0);
    finish({ kind: "ok", version: "v" });
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toBe(1);
  });

  it("goes offline on a retryable failure, backs off, and recovers with the latest set", async () => {
    results = [{ kind: "retry" }, { kind: "retry" }];
    const q = queue();
    q.change(rows(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses.at(-1)).toBe("offline");
    q.change(rows(2));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.at(-1)).toEqual(rows(2));
    expect(statuses.at(-1)).toBe("saved");
    expect(saved).toBe(1);
  });

  it("retryNow skips the backoff", async () => {
    results = [{ kind: "retry" }];
    const q = queue();
    q.change(rows(1));
    await vi.advanceTimersByTimeAsync(1000);
    q.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe("saved");
  });

  it.each<[SaveResult, Status["kind"]]>([
    [{ kind: "locked" }, "locked"],
    [{ kind: "signedout" }, "signedout"],
    [{ kind: "rejected", message: "no" }, "rejected"],
  ])("stops for good on %j", async (result, status) => {
    results = [result];
    const q = queue();
    q.change(rows(1));
    await vi.advanceTimersByTimeAsync(1000);
    q.change(rows(2));
    await vi.advanceTimersByTimeAsync(60000);
    expect(sent.length).toBe(1);
    expect(statuses.at(-1)).toBe(status);
    expect(saved).toBe(0);
  });

  it("hands over the server's copy on a conflict and does not resend the stale set", async () => {
    results = [{ kind: "conflict", picks: [], version: "v9" }];
    const q = queue();
    q.change(rows(1));
    await vi.advanceTimersByTimeAsync(60000);
    expect(sent.length).toBe(1);
    expect(conflicts).toEqual(["v9"]);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("flushes an unsent set at once and not a sent one", async () => {
    const q = queue();
    q.change(rows(1));
    q.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([rows(1)]);
    q.flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.length).toBe(1);
  });
});
