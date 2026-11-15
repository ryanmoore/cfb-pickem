import { describe, expect, it } from "vitest";
import type { ApiGame } from "../api";
import { byDay, gameSides, gameState, type Players } from "./everyone";

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
