import type { TeamLook } from "./api";

/** The `--ink` and `--paper` tokens of styles.css, which text on a team color is chosen from. */
const INK = "#1b2a20";
const PAPER = "#ffffff";
/** WCAG AA for body text. */
const MIN_TEXT = 4.5;
/** Below this contrast against the paper a team color needs a visible border. */
const MIN_EDGE = 2;
/** Redmean distance (0 to 765) under which two teams' colors read as the same. */
const MIN_APART = 160;

/** A usable team color: its text ink, and whether it is too close to the card to stand without a border. */
export type Look = { bg: string; ink: string; edge: boolean };

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Weighted RGB distance that leans on green and shifts weight with redness, close enough to what the eye does for telling two team colors apart. */
function distance(a: string, b: string) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const mean = (r1 + r2) / 2;
  const [dr, dg, db] = [r1 - r2, g1 - g2, b1 - b2];
  return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db);
}

/** The color with its better ink; null for a missing or malformed color, or one neither ink reaches `MIN_TEXT` on. */
export function lookOf(hex?: string | null): Look | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const ink = contrast(hex, PAPER) >= contrast(hex, INK) ? PAPER : INK;
  return contrast(hex, ink) < MIN_TEXT ? null : { bg: hex, ink, edge: contrast(hex, PAPER) < MIN_EDGE };
}

/**
 * One look per team of a game, null where the team stays neutral. A team takes
 * its color, else its alternate; a team after the first also skips any color
 * too close to one already taken.
 */
export function pairLooks(teams: (TeamLook | undefined)[]): (Look | null)[] {
  const taken: Look[] = [];
  return teams.map((t) => {
    const look = [t?.color, t?.alt_color].map(lookOf).find((l) => l && taken.every((o) => distance(l.bg, o.bg) >= MIN_APART)) ?? null;
    if (look) taken.push(look);
    return look;
  });
}
