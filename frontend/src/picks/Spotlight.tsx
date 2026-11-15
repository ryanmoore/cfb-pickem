import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Cells, Details } from "./Cells";
import { HINT_SPOT } from "./CoachMarks";
import type { Entry, Game } from "./model";

/** Pitch of a game in both lists (a row plus a 4 px gap); exposed to the CSS as --row. */
export const ROW = 96;
const DUR = 230;
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const still = window.matchMedia("(prefers-reduced-motion: reduce)");
// From this width the controls sit under the card instead of along the bottom
// edge; keep in sync with the media query in picks.css.
const desk = window.matchMedia("(min-width: 700px)");
const DRAG_PX = 6;
const STOP_MS = 150;

// Vertical offset of rest[r] when the list is at scroll position p: rows above
// the game's slot go up and rows below go down. `closed` is the page layout,
// where the game's own row still occupies a pitch and nothing is gapped.
const shift = (r: number, p: number, half: number, closed: boolean) => {
  const v = Math.max(-1, Math.min(1, 2 * (r + 0.5 - p)));
  return v * (closed ? (v > 0 ? ROW : 0) : half);
};

// The list scrolls under a fixed card. The list holds every ranked game but the
// spotlighted one; scrollTop = j * ROW means the game sits between rest[j-1]
// and rest[j]. Rows above that point are translated up and rows below down by
// half the card's height (a transform, so snap points stay on the layout
// grid), which opens a card-sized gap and keeps both neighbours fully visible.
// Rows are keyed by position: the browser re-snaps to the same DOM node after
// a reorder, which would shift the list by a row on every commit.
//
// Opening and closing are presentation only. The list is first laid out as the
// page list is (the game's own row still in place, so rows below sit one
// pitch lower and nothing is gapped) and eased to the gapped layout, while the
// card grows from the game's page row. Closing runs that backwards into the
// page row's final position, then calls onClosed.
export function Spotlight({ entry, games, id, from, closing, setWinner, move, active, onDone, onCancel, onClosed, noun = "game", rowPrefix = "g-" }: {
  entry: Pick<Entry, "order" | "winners">;
  games: Map<number, Game>;
  id: number;
  from: DOMRect;
  closing: boolean;
  setWinner: (gameId: number, slotId: number) => void;
  move: (idx: number) => void;
  active: boolean;
  onDone: () => void;
  onCancel: () => void;
  onClosed: () => void;
  /** What the list holds, for the hint. */
  noun?: string;
  /** The page rows' id prefix; the card collapses back into row `rowPrefix + id`. */
  rowPrefix?: string;
}) {
  const N = entry.order.length;
  const clamp = (j: number) => Math.max(0, Math.min(N - 1, j));
  const g = games.get(id)!;
  const i = entry.order.indexOf(id);
  const rest = entry.order.filter((x) => x !== id);
  const [pos, setPos] = useState(i);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [hint, setHint] = useState(() => !localStorage.getItem(HINT_SPOT));
  const dragged = useRef(false);
  const stopping = useRef(false);
  const lastScroll = useRef(0);
  const spot = useRef<HTMLDivElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(undefined);
  const acc = useRef({ dy: 0, t: 0 });
  const committed = useRef(i);
  const cur = useRef(i);
  cur.current = i;

  const layout = () => {
    const w = wheel.current!;
    const p = w.scrollTop / ROW;
    const half = (desk.matches ? stack.current! : card.current!).offsetHeight / 2;
    spot.current!.style.setProperty("--half", half + "px");
    w.querySelectorAll<HTMLElement>(".dim").forEach((el, r) => {
      el.style.transform = `translateY(${shift(r, p, half, false)}px)`;
    });
  };
  // Plays the open (or, reversed, the close) transition from the page row
  // `rect` to the settled spotlight. Returns the animations' completion.
  const animate = (rect: DOMRect, out: boolean) => {
    const sp = spot.current!;
    const w = wheel.current!;
    // Opening hands back to the live styles when done; closing holds its end
    // state until the spotlight unmounts.
    const dir = { duration: out ? DUR - 30 : DUR, easing: EASE, fill: out ? "both" : "backwards" } as const;
    const run = (el: Element, a: Keyframe[], o: KeyframeAnimationOptions = {}) =>
      el.animate(out ? [...a].reverse() : a, { ...dir, ...o, delay: out ? 0 : o.delay });
    if (still.matches) return run(sp, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 }).finished;
    const p = w.scrollTop / ROW;
    const half = parseFloat(sp.style.getPropertyValue("--half"));
    const d = rect.top - 2 - (w.getBoundingClientRect().top + w.clientHeight / 2);
    const c = card.current!;
    const to = c.getBoundingClientRect();
    const anims = [
      // The backdrop covers the page list while the rows are still moving.
      sp.animate(
        out
          ? [{ backgroundColor: "#141828" }, { backgroundColor: "rgba(20, 24, 40, 0)" }]
          : [{ backgroundColor: "rgba(20, 24, 40, 0)" }, { backgroundColor: "#141828" }],
        { ...dir, duration: DUR / 2, delay: out ? dir.duration - DUR / 2 : 0 },
      ),
      run(w, [{ transform: `translateY(${d}px)` }, { transform: "none" }]),
      run(c, [
        { transform: `translate(${rect.left - to.left}px, ${rect.top - to.top}px) scale(${rect.width / to.width}, ${rect.height / to.height})`, borderColor: "#d5dbe5" },
        { transform: "none", borderColor: "#1a56c4" },
      ]),
      ...Array.from(c.children).map((k) => run(k, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR * 0.6, delay: DUR * 0.4 })),
      run(bar.current!, [{ transform: "translateY(40%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 180, delay: 50 }),
      ...Array.from(w.querySelectorAll<HTMLElement>(".dim")).map((el, r) =>
        run(el, [
          { transform: `translateY(${shift(r, p, half, true)}px)`, opacity: 1 },
          { transform: el.style.transform, opacity: 0.88 },
        ]),
      ),
    ];
    return Promise.all(anims.map((a) => a.finished));
  };
  const goto = (j: number) => {
    wheel.current!.scrollTop = j * ROW;
    layout();
  };
  const commit = () => {
    const j = clamp(Math.round((wheel.current?.scrollTop ?? 0) / ROW));
    if (j !== cur.current) {
      committed.current = j;
      move(j);
    }
  };
  const to = (idx: number) => {
    const j = clamp(idx);
    committed.current = j;
    setPos(j);
    goto(j);
    move(j);
  };
  const toRef = useRef(to);
  toRef.current = to;

  useLayoutEffect(() => {
    goto(i);
    animate(from, false);
  }, []);
  // The page has already scrolled the game's row into view and re-rendered in
  // its final order; collapse into that row.
  useEffect(() => {
    if (!closing) return;
    goto(cur.current);
    animate(document.getElementById(rowPrefix + id)!.getBoundingClientRect(), true).then(onClosed);
  }, [closing]);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(layout);
    ro.observe(card.current!);
    ro.observe(bar.current!);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = wheel.current!;
    el.addEventListener("scrollend", commit);
    return () => el.removeEventListener("scrollend", commit);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Wheel anywhere (card and bar included) moves the list by whole rows;
  // leftover delta carries over so a trackpad's small steps still add up.
  useEffect(() => {
    const el = spot.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const a = acc.current;
      a.dy += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const rows = Math.trunc(a.dy / ROW);
      a.dy -= rows * ROW;
      clearTimeout(a.t);
      a.t = window.setTimeout(() => (a.dy = 0), 200);
      if (rows) toRef.current(Math.round(wheel.current!.scrollTop / ROW) + rows);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // The hint shows on the first open and whenever the menu asks for it; any
  // pointer, wheel or key input dismisses it.
  useEffect(() => {
    if (!hint) return;
    localStorage.setItem(HINT_SPOT, "1");
    const off = () => setHint(false);
    const evs = ["pointerdown", "wheel", "keydown"] as const;
    evs.forEach((e) => window.addEventListener(e, off, { capture: true, passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, off, { capture: true }));
  }, [hint]);

  // A mouse cannot scroll the list by dragging natively, so dragging anywhere
  // but a button does it, once past a small threshold that leaves clicks alone.
  useEffect(() => {
    const el = spot.current!;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      const y0 = e.clientY;
      const top0 = wheel.current!.scrollTop;
      dragged.current = false;
      const move = (m: PointerEvent) => {
        if (Math.abs(m.clientY - y0) > DRAG_PX) dragged.current = true;
        if (dragged.current) wheel.current!.scrollTop = top0 - (m.clientY - y0);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setTimeout(() => (dragged.current = false));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    el.addEventListener("pointerdown", down);
    return () => el.removeEventListener("pointerdown", down);
  }, []);

  const choose = (f: () => void) => {
    setMenu(false);
    f();
  };
  // A tap outside the menu closes it.
  useEffect(() => {
    if (!menu) return;
    const off = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".menu, .more")) setMenu(false);
    };
    window.addEventListener("pointerdown", off, true);
    return () => window.removeEventListener("pointerdown", off, true);
  }, [menu]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (menu || sheet) {
        if (e.key === "Escape") {
          setMenu(false);
          setSheet(false);
        }
        return;
      }
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter" && !(t.tagName === "BUTTON" && spot.current!.contains(t))) onDone();
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        toRef.current(cur.current + (e.key === "ArrowUp" ? -1 : 1));
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        toRef.current(e.key === "Home" ? 0 : N - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, menu, sheet, onCancel, onDone]);

  // A press that lands on a list still coasting (recent scroll event, or off a
  // snap point) only stops it; the click that follows must not place the game.
  const onWheelDown = () => {
    const w = wheel.current!;
    const off = Math.abs(w.scrollTop - Math.round(w.scrollTop / ROW) * ROW);
    stopping.current = performance.now() - lastScroll.current < STOP_MS || off > 1;
  };
  // The card passes pointer events through to the list, so a still tap on it
  // arrives as a click on the list whose point lies inside the card's rect.
  const onWheelClick = (e: React.MouseEvent) => {
    const r = card.current!.getBoundingClientRect();
    const inCard = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inCard && !dragged.current && !stopping.current) onDone();
  };
  const onScroll = () => {
    lastScroll.current = performance.now();
    layout();
    setPos(clamp(Math.round(wheel.current!.scrollTop / ROW)));
    if (!("onscrollend" in window)) {
      clearTimeout(timer.current);
      timer.current = setTimeout(commit, 150);
    }
  };
  const top = pos === 0;
  const bottom = pos === N - 1;
  return (
    <div className={"spot" + (closing ? " closing" : "")} role="dialog" aria-label="Spotlight" ref={spot}>
      <div className="wheel" ref={wheel} onScroll={onScroll} onPointerDownCapture={onWheelDown} onClick={onWheelClick} data-testid="wheel">
        <div className="sp" />
        {rest.map((o, k) => (
          <div key={k} className="slot">
            <div className="dim" onClick={() => !dragged.current && !stopping.current && to(k < pos ? k : k + 1)}>
              <Cells game={games.get(o)!} pts={N - (k < pos ? k : k + 1)} pick={entry.winners[o]} />
            </div>
          </div>
        ))}
        <div className="snapend" />
        <div className="sp" />
      </div>
      <div className="hints left" aria-hidden>
        <p>Scroll or <kbd>↑</kbd> <kbd>↓</kbd> to move</p>
        <p><kbd>Home</kbd> / <kbd>End</kbd>: top / bottom</p>
      </div>
      <div className="hints right" aria-hidden>
        <p><kbd>Enter</kbd>: done</p>
        <p><kbd>Esc</kbd>: cancel</p>
      </div>
      {hint && (
        <div className="hint" role="note" aria-live="polite">
          Scroll the list to move this {noun}, or tap where it should go.
        </div>
      )}
      <div className="stack" ref={stack}>
        <div className="cw">
          <div className="card" ref={card}>
            <Cells
              game={g}
              pts={N - pos}
              pick={entry.winners[id]}
              onPick={(slotId) => setWinner(id, slotId)}
              end={
                <div className="cbtns">
                  <button className="cancel" aria-label="Cancel" onClick={onCancel}>
                    ✕
                  </button>
                  <button className="primary" onClick={onDone}>
                    ✓ Done
                  </button>
                </div>
              }
            />
          </div>
        </div>
        <div className="bar" ref={bar}>
          <div className="barin">
            {menu && (
              <div className="menu" role="menu">
                <button role="menuitem" onClick={() => choose(() => setSheet(true))}>
                  Details
                </button>
                <button role="menuitem" onClick={() => choose(() => setHint(true))}>
                  Show hint
                </button>
              </div>
            )}
            <div className="barrow">
              <button disabled={top} onClick={() => to(0)}>
                ⤒ Top
              </button>
              <button disabled={top} onClick={() => to(pos - 1)}>
                ▲ Surer
              </button>
              <button disabled={bottom} onClick={() => to(pos + 1)}>
                ▼ Less sure
              </button>
              <button disabled={bottom} onClick={() => to(N - 1)}>
                ⤓ Bottom
              </button>
              <button className="more" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                ⋯
              </button>
            </div>
          </div>
        </div>
      </div>
      {sheet && (
        <div className="modal" role="dialog" aria-label="Details">
          <div className="mbox">
            <h3>{g.name}</h3>
            <Details game={g} />
            <button onClick={() => setSheet(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
