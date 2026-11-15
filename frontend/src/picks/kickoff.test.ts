import { expect, test, vi } from "vitest";
import { formatKickoff } from "./kickoff";

test("a kickoff reads as date, then time with its zone name, in the viewer's zone", () => {
  vi.stubEnv("TZ", "America/Chicago");
  expect(formatKickoff("2023-12-30T18:00:00Z")).toBe("Sat, Dec 30 · 12:00 PM CST");
  vi.stubEnv("TZ", "America/New_York");
  expect(formatKickoff("2023-12-30T18:00:00Z")).toBe("Sat, Dec 30 · 1:00 PM EST");
});
