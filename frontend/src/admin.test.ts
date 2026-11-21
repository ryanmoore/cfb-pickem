import { expect, test } from "vitest";
import { adminResult } from "./api";
import { documentYear } from "./admin";

test("a document's year, or what is wrong with it", () => {
  expect(documentYear('{"year": 2025, "games": []}')).toBe(2025);
  for (const text of ["", "{", "[]", "null", '{"year": "2025"}', '{"year": 2025.5}', "{}"]) {
    expect(typeof documentYear(text), text).toBe("string");
  }
});

test("admin replies map to what the page shows", () => {
  const problems = ["game 1: unknown team", "game 2: unknown bowl"];
  expect(adminResult(200, { summary: 1 })).toEqual({ kind: "ok", body: { summary: 1 } });
  expect(adminResult(422, { error: "invalid season document", problems })).toEqual({ kind: "problems", problems });
  expect(adminResult(409, { error: "that season is published" })).toEqual({ kind: "failed", message: "that season is published" });
  expect(adminResult(401, null)).toEqual({ kind: "signedout" });
  expect(adminResult(502, null)).toEqual({ kind: "failed", message: "Request failed (502)" });
});
