import type { TeamLook } from "./api";

/** The `--ink` and `--paper` tokens of styles.css, which text on a team color is chosen from. */
const INK = "#1b2a20";
const PAPER = "#ffffff";
/** WCAG AA for body text. */
const MIN_TEXT = 4.5;
/** Below this contrast against the paper a team color needs a visible border. */
const MIN_EDGE = 2;

/** A team color to fill with, the text on it, and the other color as an accent; `edge` when the fill is too close to the paper to stand without a border. */
export type Fill = { bg: string; ink: string; accent: string | null; edge: boolean };

const hex = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : null);

function luminance(c: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(c.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text is the other color when it reaches `MIN_TEXT` on `bg`, else the better of white and the ink; null when none does. */
function fillWith(bg: string | null, other: string | null): Fill | null {
  if (!bg) return null;
  const ink = other && contrast(bg, other) >= MIN_TEXT ? other : contrast(bg, PAPER) >= contrast(bg, INK) ? PAPER : INK;
  return contrast(bg, ink) < MIN_TEXT ? null : { bg, ink, accent: other, edge: contrast(bg, PAPER) < MIN_EDGE };
}

/** How to fill a chosen team: its color, else its alternate; null leaves the team neutral. */
export function fillOf(t?: TeamLook | null): Fill | null {
  const [a, b] = [hex(t?.color), hex(t?.alt_color)];
  return fillWith(a, b) ?? fillWith(b, a);
}

/** A team color to outline with and the text beside it: the color itself when it reads on paper, else the ink. */
export type Outline = { color: string; ink: string; edge: boolean };

export function outlineOf(t?: TeamLook | null): Outline | null {
  const color = hex(t?.color) ?? hex(t?.alt_color);
  if (!color) return null;
  const onPaper = contrast(color, PAPER);
  return { color, ink: onPaper >= MIN_TEXT ? color : INK, edge: onPaper < MIN_EDGE };
}

/** The team's marker bands, widest first: both colors, one when it has one, null when it has none. */
export function markerOf(t?: TeamLook | null): [string, string] | null {
  const [a, b] = [hex(t?.color), hex(t?.alt_color)];
  const first = a ?? b;
  return first ? [first, b ?? first] : null;
}
