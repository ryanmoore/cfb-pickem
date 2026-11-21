import type { ReactNode } from "react";
import type { ApiGame, PicksDoc, TeamLook } from "../api";

export type Slot = { id: number; label: string; record?: string; look?: TeamLook };
export type Game = {
  id: number;
  name: string;
  kickoffAt: string;
  /** Points of a playoff game, which is not ranked; null for a ranked game. */
  fixedWager: number | null;
  slots: Slot[];
  /** The winning slot, once the game is decided. */
  winner?: number;
  /** The team, for a row that is one. */
  look?: TeamLook;
  /** Betting line, shown when the data has one. */
  line?: string;
  /** Shown beside the team chips, for a row that is not a game. */
  badge?: string;
  /** Replaces the kickoff and team info in the details sheet. */
  details?: ReactNode;
};

/**
 * A player's entry: the ranked games best-first (the top one is worth the most),
 * the chosen slot per game, the playoff teams best-first when the season
 * ranks them (empty otherwise), and whether the player confirmed that ranking.
 */
export type Entry = { order: number[]; winners: Record<number, number>; ranking: number[]; done: boolean };

export function toGames(api: ApiGame[]): Game[] {
  const names = new Map(api.map((g) => [g.id, g.name]));
  return api.map((g) => ({
    id: g.id,
    name: g.name,
    kickoffAt: g.kickoff_at,
    fixedWager: g.fixed_wager,
    winner: g.winner_slot_id ?? undefined,
    slots: g.slots.map((s) => ({
      id: s.id,
      label: s.team
        ? (s.team.rank ? `#${s.team.rank} ` : "") + s.team.name
        : `Winner of ${names.get(s.winner_of ?? -1) ?? "an earlier game"}`,
      record: s.team?.record ?? undefined,
      look: s.team ?? undefined,
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

/** Both orders start shuffled, so players do not converge on the same list. */
export const freshEntry = (games: Game[], teams: number[], rand?: () => number): Entry => ({
  order: shuffle(rankedIds(games), rand),
  winners: {},
  ranking: shuffle(teams, rand),
  done: false,
});

/** `order` with `id` placed at index `idx` (clamped). */
export function moved(order: number[], id: number, idx: number) {
  const r = order.filter((x) => x !== id);
  r.splice(Math.max(0, Math.min(order.length - 1, idx)), 0, id);
  return r;
}

/** The complete set the API wants: confidences N..1 down the order, none on playoff games, and ranks N..1 down the ranking. */
export function toDoc(games: Game[], e: Entry): PicksDoc {
  const rank = new Map(e.order.map((id, k) => [id, e.order.length - k]));
  return {
    picks: games.map((g) => ({ game_id: g.id, slot_id: e.winners[g.id] ?? null, confidence: rank.get(g.id) ?? null })),
    playoff: e.ranking.map((team_season_id, k) => ({ team_season_id, rank: e.ranking.length - k })),
    playoff_done: e.done,
  };
}

/**
 * An entry read back from a saved set; games and teams without a confidence or
 * rank go last, and a set with no ranking at all starts the teams shuffled.
 */
export function fromDoc(games: Game[], teams: number[], doc: PicksDoc): Entry {
  const byGame = new Map(doc.picks.map((r) => [r.game_id, r]));
  const rank = (id: number) => byGame.get(id)?.confidence ?? 0;
  const order = rankedIds(games).sort((a, b) => rank(b) - rank(a));
  const teamRank = new Map(doc.playoff.map((r) => [r.team_season_id, r.rank]));
  const ranking = doc.playoff.length
    ? [...teams].sort((a, b) => (teamRank.get(b) ?? 0) - (teamRank.get(a) ?? 0))
    : shuffle(teams);
  const winners: Entry["winners"] = {};
  for (const g of games) {
    const slot = byGame.get(g.id)?.slot_id;
    if (slot != null && g.slots.some((s) => s.id === slot)) winners[g.id] = slot;
  }
  return { order, winners, ranking, done: doc.playoff_done };
}

/**
 * `e` fitted to the season's games and playoff teams: ids that no longer exist
 * are dropped, new ranked games and teams go last (the lowest confidence), and
 * winners survive only for slots that still exist. An entry with no ranking
 * starts the teams shuffled.
 */
export function reconcile(games: Game[], teams: number[], e: Entry): Entry {
  const ranked = rankedIds(games);
  const order = [...e.order.filter((id) => ranked.includes(id)), ...ranked.filter((id) => !e.order.includes(id))];
  const ranking = e.ranking.length
    ? [...e.ranking.filter((id) => teams.includes(id)), ...teams.filter((id) => !e.ranking.includes(id))]
    : shuffle(teams);
  const winners: Entry["winners"] = {};
  for (const g of games) {
    const slot = e.winners[g.id];
    if (slot !== undefined && g.slots.some((s) => s.id === slot)) winners[g.id] = slot;
  }
  return { order, winners, ranking, done: e.done };
}

export const sameDoc = (a: PicksDoc, b: PicksDoc) => {
  const key = (d: PicksDoc) =>
    JSON.stringify([
      [...d.picks].sort((x, y) => x.game_id - y.game_id).map((p) => [p.game_id, p.slot_id, p.confidence]),
      [...d.playoff].sort((x, y) => x.team_season_id - y.team_season_id).map((r) => [r.team_season_id, r.rank]),
      d.playoff_done,
    ]);
  return key(a) === key(b);
};
