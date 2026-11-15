import { describe, expect, it } from "vitest";
import type { ApiGame, ApiPlayoff, ApiSlot } from "../api";
import { resolve, road, toField, whoIn } from "./bracket";

/**
 * A field of `size` teams (team id 100 + seed) where seeds 1..byes skip the
 * first round, as the API would describe it: the first round pairs the rest
 * best against worst, the next pairs its winners with the byes, and later
 * rounds pair the outermost games with each other.
 */
function api(size: number, byes: number): ApiPlayoff {
  type Side = { team: number } | { winner: number };
  const specs: { id: number; round: number; sides: [Side, Side] }[] = [];
  const add = (round: number, a: Side, b: Side) => {
    const id = 100 + specs.length;
    specs.push({ id, round, sides: [a, b] });
    return id;
  };
  const team = (seed: number): Side => ({ team: seed });
  const winners = Array.from({ length: (size - byes) / 2 }, (_, k) => add(0, team(byes + 1 + k), team(size - k)));
  let round = 1;
  let pairs: [Side, Side][] = Array.from({ length: byes }, (_, k) => [team(k + 1), { winner: winners[byes - 1 - k] }]);
  for (;;) {
    const ids = pairs.map(([a, b]) => add(round, a, b));
    if (ids.length === 1) break;
    pairs = ids.slice(0, ids.length / 2).map((id, k) => [{ winner: id }, { winner: ids[ids.length - 1 - k] }]);
    round++;
  }
  const slot = (s: Side, k: number): ApiSlot =>
    "team" in s
      ? { id: k, team_season_id: 100 + s.team, team: null, winner_of: null, seed: s.team }
      : { id: k, team_season_id: null, team: null, winner_of: s.winner, seed: null };
  const games: ApiGame[] = specs.map(({ id, round, sides }) => ({
    id,
    name: round === specs.at(-1)!.round ? "Championship" : "",
    kickoff_at: "",
    fixed_wager: null,
    slots: sides.map((s, k) => slot(s, id * 10 + k)),
    winner_slot_id: null,
    round,
  }));
  const teams = Array.from({ length: size }, (_, k) => ({
    team_season_id: 101 + k,
    name: `Team ${k + 1}`,
    rank: null,
    record: null,
    seed: k + 1,
    max_wins: 0,
    wins: 0,
    eliminated: false,
  }));
  return { teams, games };
}

describe("bracket", () => {
  it.each([
    [12, 4, 1, 3],
    [12, 4, 4, 3],
    [12, 4, 5, 4],
    [12, 4, 12, 4],
    [24, 8, 8, 4],
    [24, 8, 9, 5],
  ])("a %i-team field with %i byes gives seed %i a road of %i games", (size, byes, seed, wins) => {
    expect(road(toField(api(size, byes)), 100 + seed)).toHaveLength(wins);
  });

  it("names rounds from the final back", () => {
    expect(toField(api(12, 4)).rounds).toEqual(["First round", "Quarterfinal", "Semifinal", "Final"]);
    expect(toField(api(24, 8)).rounds).toEqual(["First round", "Second round", "Quarterfinal", "Semifinal", "Final"]);
  });

  it("pairs byes with first-round winners, best seed with the weakest", () => {
    const f12 = toField(api(12, 4));
    expect(whoIn(f12, road(f12, 101)[0].opponent)).toBe("winner of #8 Team 8 / #9 Team 9");
    const f24 = toField(api(24, 8));
    expect(whoIn(f24, road(f24, 101)[0].opponent)).toContain("#16");
    expect(road(f24, 109).map((s) => f24.rounds[s.game.round])).toEqual(["First round", "Second round", "Quarterfinal", "Semifinal", "Final"]);
  });

  it("resolves a slot to its team once the feeder game has a winner", () => {
    const p = api(12, 4);
    p.games[3].winner = 109;
    const f = toField(p);
    const quarter = f.games.find((g) => g.id === 104)!;
    expect(resolve(f, quarter.a)).toBe(101);
    expect(resolve(f, quarter.b)).toBe(109);
    expect(resolve(f, f.games.find((g) => g.id === 108)!.a)).toBeUndefined();
  });
});
