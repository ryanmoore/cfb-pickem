import { describe, expect, it } from "vitest";
import type { ApiGame, Standing } from "../api";
import { byDay, gameSides, gameState, livePicks, placeBlock, playoffBoard, type Players } from "./everyone";

const game = (id: number, kickoff_at: string, winner_slot_id: number | null = null): ApiGame => ({
  id, name: `G${id}`, kickoff_at, fixed_wager: null, winner_slot_id,
  slots: [{ id: id * 10, team_season_id: 1, team: null, winner_of: null, seed: null }, { id: id * 10 + 1, team_season_id: 2, team: null, winner_of: null, seed: null }],
});
const now = Date.parse("2030-12-20T12:00:00Z");

describe("gameState", () => {
  it.each([
    ["future kickoff", game(1, "2030-12-20T18:00:00Z"), "next"],
    ["kickoff now", game(1, "2030-12-20T12:00:00Z"), "live"],
    ["past kickoff, no result", game(1, "2030-12-20T09:00:00Z"), "live"],
    ["result, past kickoff", game(1, "2030-12-20T09:00:00Z", 10), "final"],
    ["result recorded before kickoff", game(1, "2030-12-20T18:00:00Z", 10), "final"],
  ])("%s", (_, g, state) => expect(gameState(g, now)).toBe(state));
});

it("sides list each team's pickers by points and shade by the game's result", () => {
  const pick = (name: string, slot_id: number, confidence: number): Players[number] =>
    ({ display_name: name, is_me: false, picks: [{ game_id: 1, slot_id, confidence }], playoff: [], playoff_done: true });
  const [a, b] = gameSides(game(1, "2030-12-20T09:00:00Z", 10), [pick("Bo", 10, 3), pick("Al", 10, 3), pick("Cy", 11, 9), pick("Di", 10, 7)]);
  expect(a.rows.map((r) => r.name)).toEqual(["Di", "Al", "Bo"]);
  expect([a.status, a.total, b.status, b.total]).toEqual(["won", 13, "lost", 9]);
});

it("byDay orders games by kickoff and groups them by calendar day", () => {
  const days = byDay([game(3, "2030-12-22T12:00:00Z"), game(1, "2030-12-20T12:00:00Z"), game(2, "2030-12-20T13:00:00Z")]);
  expect(days.map((d) => d.games.map((g) => g.id))).toEqual([[1, 2], [3]]);
});

it("playoff places tie on equal points and order the rest by points then name", () => {
  const s = (display_name: string, playoff: number) => ({ display_name, playoff }) as Standing;
  expect(playoffBoard([s("Cy", 5), s("Bo", 9), s("Al", 5), s("Di", 1)]).map((r) => [r.name, r.place])).toEqual([["Bo", 1], ["Al", 2], ["Cy", 2], ["Di", 4]]);
});

describe("placeBlock", () => {
  const st = (display_name: string, rank: number, total: number) => ({ display_name, rank, total }) as Standing;
  const board = [st("Ann", 1, 30), st("Bo", 2, 20), st("Cy", 2, 20), st("Di", 4, 5)];
  it.each([
    ["first: only a neighbour below", "Ann", undefined, "Bo"],
    ["tied: neighbours on either side, tie order by name", "Cy", "Bo", "Di"],
    ["last: only a neighbour above", "Di", "Cy", undefined],
    ["no row", "Ed", undefined, undefined],
  ])("%s", (_, name, above, below) => {
    const b = placeBlock(board, name);
    expect([b?.above?.display_name, b?.below?.display_name]).toEqual([above, below]);
    expect(b === null).toBe(name === "Ed");
  });
});

it("livePicks lists underway games with the viewer's side, or none when they skipped it", () => {
  const me = { display_name: "Ann", is_me: true, picks: [{ game_id: 1, slot_id: 11, confidence: 7 }], playoff: [], playoff_done: true } as Players[number];
  const games = [game(1, "2030-12-20T09:00:00Z"), game(2, "2030-12-20T09:00:00Z"), game(3, "2030-12-20T18:00:00Z"), game(4, "2030-12-20T09:00:00Z", 40)];
  expect(livePicks(games, me, now).map((l) => [l.game.id, l.side?.id ?? null, l.points])).toEqual([[1, 11, 7], [2, null, null]]);
});
