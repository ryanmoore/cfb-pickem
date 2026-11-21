import { describe, expect, it } from "vitest";
import type { ApiGame, ApiSlot } from "../api";
import { slotName } from "./model";

const team = (name: string, rank: number | null = null) => ({ name, rank, record: null, mascot: null, color: null, alt_color: null });
const side = (id: number, t: ReturnType<typeof team> | null, winner_of: number | null = null): ApiSlot => ({ id, team_season_id: t && id, team: t, winner_of, seed: null });
const game = (id: number, name: string, slots: ApiSlot[]): ApiGame => ({ id, name, kickoff_at: "", fixed_wager: null, slots, winner_slot_id: null });

const semi = game(1, "Orange Bowl", [side(10, team("Ohio State")), side(11, team("Alabama"))]);
const open = game(2, "Rose Bowl", [side(20, team("Utah")), side(21, null, 9)]);

describe("slotName", () => {
  it.each([
    ["a team, with its rank", side(30, team("Texas", 3)), "#3 Texas"],
    ["fed by a game between two teams", side(30, null, 1), "Ohio State / Alabama"],
    ["fed by a game with an undecided side", side(30, null, 2), "Winner of Rose Bowl"],
    ["fed by a game that is not in the list", side(30, null, 99), "To be decided"],
  ])("%s", (_, slot, want) => {
    expect(slotName(slot, [semi, open])).toBe(want);
  });
});
