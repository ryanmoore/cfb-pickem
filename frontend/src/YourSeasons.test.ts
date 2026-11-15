import { expect, test } from "vitest";
import { ordinal } from "./YourSeasons";

test("ordinal suffixes, including the teens", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 112].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "112th"]);
});
