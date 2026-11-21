import { describe, expect, it } from "vitest";
import { lookOf, pairLooks } from "./teamLook";

const T = (color: string | null, alt_color: string | null = null) => ({ mascot: null, color, alt_color });

describe("lookOf", () => {
  it.each([
    ["#4f2683", "#ffffff", false],
    ["#ffcc00", "#1b2a20", true],
    ["#ffffff", "#1b2a20", true],
    ["#000000", "#ffffff", false],
  ])("%s gets ink %s (edge %s)", (bg, ink, edge) => {
    expect(lookOf(bg)).toEqual({ bg, ink, edge });
  });
  it.each([[null], [undefined], [""], ["red"], ["#e03c31"]])("%s stays neutral", (c) => {
    // #e03c31 has 4.5:1 against neither ink.
    expect(lookOf(c)).toBeNull();
  });
});

describe("pairLooks", () => {
  const bgs = (teams: ReturnType<typeof T>[]) => pairLooks(teams).map((l) => l?.bg ?? null);
  it.each([
    ["distinct colors stay", [T("#4f2683"), T("#ffcc00")], ["#4f2683", "#ffcc00"]],
    ["a near twin takes its alternate", [T("#4f2683"), T("#552288", "#ffcc00")], ["#4f2683", "#ffcc00"]],
    ["a near twin with a near-twin alternate is neutral", [T("#4f2683"), T("#552288", "#4a2a80")], ["#4f2683", null]],
    ["a near twin with no alternate is neutral", [T("#4f2683"), T("#552288")], ["#4f2683", null]],
    ["a first team without a color takes its alternate", [T(null, "#cc0000"), T("#cc0000")], ["#cc0000", null]],
    ["unknown teams", [undefined, undefined], [null, null]],
  ])("%s", (_, teams, want) => {
    expect(bgs(teams as ReturnType<typeof T>[])).toEqual(want);
  });
});
