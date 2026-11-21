import { describe, expect, it } from "vitest";
import { fillOf, markerOf, outlineOf } from "./teamLook";

const T = (color: string | null, alt_color: string | null = null) => ({ mascot: null, color, alt_color });

describe("fillOf", () => {
  it.each([
    ["alternate that reads is the text", T("#4f2683", "#ffcc00"), { bg: "#4f2683", ink: "#ffcc00", accent: "#ffcc00", edge: false }],
    ["alternate that does not read: better ink", T("#ffcc00", "#fff0b0"), { bg: "#ffcc00", ink: "#1b2a20", accent: "#fff0b0", edge: true }],
    ["no alternate: better ink", T("#4f2683"), { bg: "#4f2683", ink: "#ffffff", accent: null, edge: false }],
    ["white primary needs an edge", T("#ffffff", "#00274c"), { bg: "#ffffff", ink: "#00274c", accent: "#00274c", edge: true }],
    ["no ink reaches 4.5 on the primary: fill with the alternate", T("#e03c31", "#ffffff"), { bg: "#ffffff", ink: "#1b2a20", accent: "#e03c31", edge: true }],
    ["no color: the alternate fills", T(null, "#4f2683"), { bg: "#4f2683", ink: "#ffffff", accent: null, edge: false }],
    ["neither color usable", T("#e03c31", "#e8503f"), null],
    ["none", T(null), null],
  ])("%s", (_, team, want) => {
    expect(fillOf(team)).toEqual(want);
  });
});

describe("markerOf", () => {
  it.each([
    ["both colors", T("#4f2683", "#ffcc00"), ["#4f2683", "#ffcc00"]],
    ["one color is one band", T("#4f2683"), ["#4f2683", "#4f2683"]],
    ["none", T(null), null],
  ])("%s", (_, team, want) => {
    expect(markerOf(team)).toEqual(want);
  });
});

describe("outlineOf", () => {
  it.each([
    ["a color that reads on paper is the text too", T("#4f2683"), { color: "#4f2683", ink: "#4f2683", edge: false }],
    ["a light color: ink text, needs an edge", T("#ffcc00"), { color: "#ffcc00", ink: "#1b2a20", edge: true }],
    ["the alternate stands in for a missing color", T(null, "#4f2683"), { color: "#4f2683", ink: "#4f2683", edge: false }],
    ["none", T(null), null],
  ])("%s", (_, team, want) => {
    expect(outlineOf(team)).toEqual(want);
  });
});
