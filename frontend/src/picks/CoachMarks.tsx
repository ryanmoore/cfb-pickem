import { useLayoutEffect, useState } from "react";

export const HINT_MAIN = "pickem:hint-main";
export const HINT_SPOT = "pickem:hint-spot";
export const HINT_PLAYOFF = "pickem:hint-playoff";

const DEFAULT_TEXTS: [string, string] = [
  "Tap a team to pick the winner.",
  "Tap the game to move it up or down. The top game is worth the most points.",
];

type Pt = { x: number; y: number };

// Coach marks over the first ranked row, one callout at a time: first at its
// first team button, then at its title. Any tap outside "Next", and any scroll,
// dismisses.
export function CoachMarks({ onClose, texts = DEFAULT_TEXTS, anchor = ".chip", row: rowSelector = ".picks .row.tap:not(.team)" }: {
  onClose: () => void;
  /** The two callouts: the first points at `anchor` inside the row, the second at its title. */
  texts?: [string, string];
  anchor?: string;
  /** The row the callouts point at: the first match. */
  row?: string;
}) {
  const [step, setStep] = useState(1);
  const [m, setM] = useState<{ row: DOMRect; chip: Pt; title: Pt; w: number }>();
  useLayoutEffect(() => {
    const row = document.querySelector<HTMLElement>(rowSelector);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    const measure = () => {
      const r = row.getBoundingClientRect();
      const c = row.querySelector(anchor)!.getBoundingClientRect();
      const t = row.querySelector(".tt")!.getBoundingClientRect();
      setM({
        row: r,
        chip: { x: c.left + c.width / 2, y: c.bottom },
        title: { x: t.left + Math.min(40, t.width / 2), y: r.top },
        w: Math.min(288, innerWidth - 16),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    // The scroll above fires its event after this effect; only a later one is the user's.
    let t2 = 0;
    const t1 = requestAnimationFrame(() => (t2 = requestAnimationFrame(() => addEventListener("scroll", onClose, { once: true }))));
    return () => {
      cancelAnimationFrame(t1);
      cancelAnimationFrame(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onClose);
    };
  }, [onClose, anchor, rowSelector]);
  if (!m) return null;
  const left = (p: Pt) => Math.max(8, Math.min(p.x - m.w / 2, innerWidth - 8 - m.w));
  const arrow = (p: Pt) => ({ left: p.x - left(p) - 9 });
  return (
    <div className="coach" onClick={onClose}>
      <div className="cut" style={{ left: m.row.left, top: m.row.top, width: m.row.width, height: m.row.height }} />
      {step === 1 ? (
        <div key={1} className="callout down" role="note" style={{ left: left(m.chip), width: m.w, top: m.chip.y + 12 }}>
          <i style={arrow(m.chip)} />
          <b>{texts[0]}</b>
          <footer>
            <small>1 of 2</small>
            <button
              className="primary"
              onClick={(e) => {
                e.stopPropagation();
                setStep(2);
              }}
            >
              Next
            </button>
          </footer>
        </div>
      ) : (
        <div key={2} className="callout up" role="note" style={{ left: left(m.title), width: m.w, bottom: innerHeight - m.row.top + 12 }}>
          <b>{texts[1]}</b>
          <footer>
            <small>2 of 2</small>
            <button className="primary" onClick={onClose}>
              Got it
            </button>
          </footer>
          <i style={arrow(m.title)} />
        </div>
      )}
    </div>
  );
}
