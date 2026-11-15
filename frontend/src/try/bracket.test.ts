import { describe, expect, it } from "vitest";
import { earned, FIELDS, maxWins, road, simulate, whoIn, winCounts } from "./bracket";

describe("bracket", () => {
  it.each([
    [12, 1, 3],
    [12, 4, 3],
    [12, 5, 4],
    [12, 12, 4],
    [24, 8, 4],
    [24, 9, 5],
  ])("a %i-team field gives seed %i up to %i wins", (size, seed, wins) => {
    expect(maxWins(FIELDS[size], seed)).toBe(wins);
  });

  it("pairs byes with first-round winners, best seed with the weakest", () => {
    const f12 = FIELDS[12];
    expect(road(f12, 1)[0].opponent).toEqual({ winner: "r0g3" });
    expect(whoIn(f12, road(f12, 1)[0].opponent)).toBe("winner of #8 Saltmarsh Badgers / #9 Copperkeep Stags");
    const f24 = FIELDS[24];
    expect(whoIn(f24, road(f24, 1)[0].opponent)).toContain("#16");
    expect(road(f24, 9).map((s) => f24.rounds[s.game.round])).toEqual(["First round", "Second round", "Quarterfinal", "Semifinal", "Final"]);
  });

  it("simulates one winner per game and scores wins", () => {
    for (const f of Object.values(FIELDS)) {
      const w = simulate(f);
      expect(Object.keys(w)).toHaveLength(f.games.length);
      expect([...winCounts(w).values()].reduce((a, b) => a + b)).toBe(f.games.length);
    }
    expect(earned(24, 20, 2)).toBe(20);
    expect(earned(12, 9, 3)).toBe(27);
  });
});
