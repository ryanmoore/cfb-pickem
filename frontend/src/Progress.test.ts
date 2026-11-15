import { expect, test } from "vitest";
import { timeLeft } from "./Progress";

const MIN = 60000;

test("time left shows the two largest units, and Locked once past", () => {
  const cases: [number, string][] = [
    [-1, "Locked"],
    [0, "Locked"],
    [59 * MIN, "59m"],
    [61 * MIN, "1h 1m"],
    [(2 * 24 * 60 + 14 * 60 + 5) * MIN, "2d 14h"],
  ];
  for (const [ms, text] of cases) expect(timeLeft(ms)).toBe(text);
});
