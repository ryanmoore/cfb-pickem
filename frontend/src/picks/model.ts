import type { ApiGame, PickRow } from "../api";

export type Slot = { id: number; label: string; record?: string };
export type Game = {
  id: number;
  name: string;
  kickoffAt: string;
  /** Points of a playoff game, which is not ranked; null for a ranked game. */
  fixedWager: number | null;
  slots: Slot[];
  /** Betting line, shown when the data has one. */
  line?: string;
};

/** A player's entry: the ranked games best-first (the top one is worth the most) and the chosen slot per game. */
export type Entry = { order: number[]; winners: Record<number, number> };

export function toGames(api: ApiGame[]): Game[] {
  const names = new Map(api.map((g) => [g.id, g.name]));
  return api.map((g) => ({
    id: g.id,
    name: g.name,
    kickoffAt: g.kickoff_at,
    fixedWager: g.fixed_wager,
    slots: g.slots.map((s) => ({
      id: s.id,
      label: s.team
        ? (s.team.rank ? `#${s.team.rank} ` : "") + s.team.name
        : `Winner of ${names.get(s.winner_of ?? -1) ?? "an earlier game"}`,
      record: s.team?.record ?? undefined,
    })),
  }));
}

export const rankedIds = (games: Game[]) => games.filter((g) => g.fixedWager === null).map((g) => g.id);

export function shuffle<T>(a: T[], rand = Math.random): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export const freshEntry = (games: Game[], rand?: () => number): Entry => ({
  order: shuffle(rankedIds(games), rand),
  winners: {},
});

/** `order` with `id` placed at index `idx` (clamped). */
export function moved(order: number[], id: number, idx: number) {
  const r = order.filter((x) => x !== id);
  r.splice(Math.max(0, Math.min(order.length - 1, idx)), 0, id);
  return r;
}

/** The complete set the API wants: confidences N..1 down the order, none on playoff games. */
export function toRows(games: Game[], e: Entry): PickRow[] {
  const rank = new Map(e.order.map((id, k) => [id, e.order.length - k]));
  return games.map((g) => ({ game_id: g.id, slot_id: e.winners[g.id] ?? null, confidence: rank.get(g.id) ?? null }));
}

/** An entry read back from saved rows; games without a confidence go last. */
export function fromRows(games: Game[], rows: PickRow[]): Entry {
  const byGame = new Map(rows.map((r) => [r.game_id, r]));
  const rank = (id: number) => byGame.get(id)?.confidence ?? 0;
  const order = rankedIds(games).sort((a, b) => rank(b) - rank(a));
  const winners: Entry["winners"] = {};
  for (const g of games) {
    const slot = byGame.get(g.id)?.slot_id;
    if (slot != null && g.slots.some((s) => s.id === slot)) winners[g.id] = slot;
  }
  return { order, winners };
}

/**
 * `e` fitted to the season's games: ids that no longer exist are dropped, new
 * ranked games go last (the lowest confidence), and winners survive only for
 * slots that still exist.
 */
export function reconcile(games: Game[], e: Entry): Entry {
  const ranked = rankedIds(games);
  const order = [...e.order.filter((id) => ranked.includes(id)), ...ranked.filter((id) => !e.order.includes(id))];
  const winners: Entry["winners"] = {};
  for (const g of games) {
    const slot = e.winners[g.id];
    if (slot !== undefined && g.slots.some((s) => s.id === slot)) winners[g.id] = slot;
  }
  return { order, winners };
}

export const sameRows = (a: PickRow[], b: PickRow[]) => {
  const key = (r: PickRow[]) =>
    JSON.stringify([...r].sort((x, y) => x.game_id - y.game_id).map((p) => [p.game_id, p.slot_id, p.confidence]));
  return key(a) === key(b);
};
