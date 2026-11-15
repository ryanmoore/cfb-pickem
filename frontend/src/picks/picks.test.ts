import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PickRow, PicksDoc, SaveResult } from "../api";
import { freshEntry, fromDoc, moved, reconcile, sameDoc, shuffle, toDoc, type Entry, type Game } from "./model";
import { createSaveQueue, type Status } from "./saveQueue";

const game = (id: number, fixedWager: number | null = null): Game => ({
  id,
  name: `Game ${id}`,
  kickoffAt: "2030-12-20T00:00:00Z",
  fixedWager,
  slots: [{ id: id * 10, label: "A" }, { id: id * 10 + 1, label: "B" }],
});
const games = [game(1), game(2), game(3), game(4), game(5, 4)];

const doc = (picks: PickRow[], playoff: PicksDoc["playoff"] = []): PicksDoc => ({ picks, playoff, playoff_done: false });
const entry = (order: number[], winners: Entry["winners"] = {}, ranking: number[] = []): Entry => ({ order, winners, ranking, done: false });

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
    const rows = toDoc(games, entry(next)).picks;
    expect(confidences(rows)).toEqual([1, 2, 3, 4]);
    expect(rows.find((r) => r.game_id === 5)?.confidence).toBeNull();
    expect(rows.find((r) => r.game_id === next[0])?.confidence).toBe(4);
  });

  it("reads back an incomplete saved set as a complete entry", () => {
    const rows: PickRow[] = [
      { game_id: 3, slot_id: 30, confidence: 2 },
      { game_id: 1, slot_id: 99, confidence: 1 },
    ];
    const e = fromDoc(games, [], doc(rows));
    expect(e.order.slice(0, 2)).toEqual([3, 1]);
    expect([...e.order].sort()).toEqual([1, 2, 3, 4]);
    expect(e.winners).toEqual({ 3: 30 });
  });
});

describe("playoff ranking", () => {
  const teams = [101, 102, 103, 104];

  it("starts shuffled, never in seed order by default, and keeps every team once", () => {
    const first = freshEntry(games, teams, () => 0);
    expect(first.ranking).not.toEqual(teams);
    expect([...first.ranking].sort()).toEqual(teams);
    expect(freshEntry(games, teams, () => 0.9).ranking).not.toEqual(first.ranking);
  });

  it("shuffles the teams when an entry has no ranking yet", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const picksOnly = doc([{ game_id: 1, slot_id: 10, confidence: 2 }]);
    for (const ranking of [fromDoc(games, teams, picksOnly).ranking, reconcile(games, teams, entry([1, 2, 3, 4])).ranking]) {
      expect(ranking).not.toEqual(teams);
      expect([...ranking].sort()).toEqual(teams);
    }
    vi.restoreAllMocks();
  });

  it("saves ranks N..1 down the ranking and reads them back", () => {
    const e = entry([1, 2, 3, 4], {}, [103, 101, 104, 102]);
    const saved = toDoc(games, e);
    expect(saved.playoff).toEqual([
      { team_season_id: 103, rank: 4 },
      { team_season_id: 101, rank: 3 },
      { team_season_id: 104, rank: 2 },
      { team_season_id: 102, rank: 1 },
    ]);
    expect(fromDoc(games, teams, saved).ranking).toEqual(e.ranking);
    // A team the saved ranking lacks goes last.
    expect(fromDoc(games, teams, doc([], saved.playoff.slice(0, 2))).ranking).toEqual([103, 101, 102, 104]);
  });

  it("compares sets by value, rankings included", () => {
    const a = doc([{ game_id: 1, slot_id: 10, confidence: 2 }], [{ team_season_id: 101, rank: 1 }]);
    expect(sameDoc(a, { playoff: [{ rank: 1, team_season_id: 101 }], picks: [{ confidence: 2, game_id: 1, slot_id: 10 }], playoff_done: false })).toBe(true);
    expect(sameDoc(a, { ...a, playoff_done: true })).toBe(false);
    expect(sameDoc(a, doc(a.picks, [{ team_season_id: 101, rank: 2 }]))).toBe(false);
    expect(sameDoc(a, doc(a.picks))).toBe(false);
  });
});

it("compares rows by value, whatever order the server writes their keys", () => {
  const a = doc([{ game_id: 1, slot_id: 10, confidence: 2 }]);
  expect(sameDoc(a, doc([{ confidence: 2, game_id: 1, slot_id: 10 }]))).toBe(true);
  expect(sameDoc(a, doc([{ confidence: 1, game_id: 1, slot_id: 10 }]))).toBe(false);
});

describe("reconcile", () => {
  it.each([
    ["nothing changed", entry([1, 2], { 1: 10 }), [game(1), game(2)], [], entry([1, 2], { 1: 10 })],
    ["a ranked game is added at the bottom", entry([2, 1]), [game(1), game(2), game(3)], [], entry([2, 1, 3])],
    ["a playoff game is not ranked", entry([1]), [game(1), game(5, 4)], [], entry([1])],
    ["a game is removed, with its winner", entry([3, 1, 2], { 3: 30, 1: 10 }), [game(1), game(2)], [], entry([1, 2], { 1: 10 })],
    ["a slot is removed", entry([1], { 1: 10 }), [{ ...game(1), slots: [{ id: 11, label: "B" }] }], [], entry([1])],
    ["a playoff team is added at the bottom and one removed", entry([1], {}, [102, 101]), [game(1)], [101, 103], entry([1], {}, [101, 103])],
  ])("%s", (_, e, list, teams, want) => {
    expect(reconcile(list, teams, e)).toEqual(want);
  });
});

describe("save queue", () => {
  const rows = (n: number): PicksDoc => doc([{ game_id: 1, slot_id: null, confidence: n }]);
  let results: SaveResult[];
  let sent: PicksDoc[];
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
    results = [{ kind: "conflict", picks: [], playoff: [], playoff_done: false, version: "v9" }];
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
