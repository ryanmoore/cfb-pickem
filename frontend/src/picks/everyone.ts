import type { ApiGame, ApiSlot, ApiTeam, PicksResponse, Standing } from "../api";
import { dayKey } from "./kickoff";

export type Players = PicksResponse["players"];
export type Status = "won" | "lost" | "open";
/** One player's stake: confidence points on a game, or a rank on a playoff team. */
export type Row = { name: string; me: boolean; points: number | null; status: Status };
/** One team of a game with the players who picked it. */
export type Side = { slot: ApiSlot; status: Status; rows: Row[]; total: number };

export type GameState = "live" | "next" | "final";

/** Final once there is a result; otherwise underway from kickoff on (there are no live scores to say more). */
export const gameState = (g: ApiGame, now: number): GameState =>
  g.winner_slot_id !== null ? "final" : Date.parse(g.kickoff_at) <= now ? "live" : "next";

/** Highest points first, then by name. */
export const byPoints = (a: Row, b: Row) => (b.points ?? 0) - (a.points ?? 0) || a.name.localeCompare(b.name);

/** The most points anyone staked on one game, which the darkest shade stands for. */
export const maxPoints = (players: Players) => Math.max(1, ...players.flatMap((p) => p.picks.map((k) => k.confidence ?? 0)));

/** Both teams of a game, each with its pickers sorted by points. */
export function gameSides(game: ApiGame, players: Players): Side[] {
  return game.slots.map((slot) => {
    const status: Status = game.winner_slot_id === null ? "open" : game.winner_slot_id === slot.id ? "won" : "lost";
    const rows = players
      .flatMap((p) => {
        const pick = p.picks.find((k) => k.game_id === game.id && k.slot_id === slot.id);
        return pick ? [{ name: p.display_name, me: p.is_me, points: pick.confidence, status }] : [];
      })
      .sort(byPoints);
    return { slot, status, rows, total: rows.reduce((n, r) => n + (r.points ?? 0), 0) };
  });
}

/** Every player's rank for one playoff team. */
export function teamRows(team: ApiTeam, players: Players): Row[] {
  return players.flatMap((p) => {
    const r = p.playoff.find((k) => k.team_season_id === team.team_season_id);
    return r ? [{ name: p.display_name, me: p.is_me, points: r.rank, status: (team.eliminated ? "lost" : "open") as Status }] : [];
  });
}

/** Games in kickoff order, grouped by the viewer's calendar day. */
export function byDay(games: ApiGame[]): { key: string; games: ApiGame[] }[] {
  const days = new Map<string, ApiGame[]>();
  for (const g of [...games].sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))) {
    const key = dayKey(g.kickoff_at);
    days.set(key, [...(days.get(key) ?? []), g]);
  }
  return [...days].map(([key, games]) => ({ key, games }));
}

/** Players by playoff points, highest first; players on equal points share a place. */
export function playoffBoard(standings: Standing[]): { name: string; points: number; place: number }[] {
  return standings
    .map((s) => ({ name: s.display_name, points: s.playoff }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .map((r, _, all) => ({ ...r, place: 1 + all.filter((o) => o.points > r.points).length }));
}

/** A team's display name, with its ranking when it has one. */
export const slotName = (slot: ApiSlot) => (slot.team ? `${slot.team.rank ? `#${slot.team.rank} ` : ""}${slot.team.name}` : "To be decided");

/** The viewer's standing with the players directly above and below; a tie shares its rank. Null when they have no row. */
export function placeBlock(standings: Standing[], name: string): { me: Standing; above?: Standing; below?: Standing } | null {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank || a.display_name.localeCompare(b.display_name));
  const i = sorted.findIndex((s) => s.display_name === name);
  return i < 0 ? null : { me: sorted[i], above: sorted[i - 1], below: sorted[i + 1] };
}

/** For each underway game, the side the viewer picked and its points; null when they made no pick. */
export function livePicks(games: ApiGame[], me: Players[number], now: number): { game: ApiGame; side: ApiSlot | null; points: number | null }[] {
  return games
    .filter((g) => gameState(g, now) === "live")
    .map((game) => {
      const pick = me.picks.find((k) => k.game_id === game.id);
      return { game, side: game.slots.find((s) => s.id === pick?.slot_id) ?? null, points: pick?.confidence ?? null };
    });
}
