import { expect, test } from "vitest";
import { seasonHref } from "./ui";

test("tab links carry the chosen season and leave the rest to the newest", () => {
  expect(seasonHref("/picks", 2021)).toBe("/picks?season=2021");
  expect(seasonHref("/picks", null)).toBe("/picks");
});
