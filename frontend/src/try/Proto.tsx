// Throwaway prototype for choosing a pick-entry design. Delete this directory
// and the /try/picks branch in main.tsx once a design is chosen.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FIXED, FIXED_POINTS, GAMES, type Game, type Team } from "./fixtures";
import "./try.css";

type Pick = 0 | 1;
type S = { order: string[]; picks: Record<string, Pick> };
type Tier = "lock" | "lean" | "coin";

const KEY = "try-picks-v2";
const N = GAMES.length;
const BY_ID: Record<string, Game> = Object.fromEntries([...GAMES, ...FIXED].map((g) => [g.id, g]));

const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};
const fresh = (): S => ({ order: shuffle(GAMES.map((g) => g.id)), picks: {} });
const load = (): S => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "");
    if (Array.isArray(s.order) && s.order.length === N && s.order.every((id: string) => BY_ID[id])) return s;
  } catch {
    /* first visit */
  }
  return fresh();
};
const moved = (order: string[], id: string, idx: number) => {
  const r = order.filter((x) => x !== id);
  r.splice(Math.max(0, Math.min(N - 1, idx)), 0, id);
  return r;
};
const rankOf = (s: S, id: string) => N - s.order.indexOf(id);
const inkOn = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? "#111" : "#fff";
};
const tl = (t: Team) => (t.rank ? `#${t.rank} ` : "") + t.name;
const lineText = (g: Game) => (g.line.pts ? `${g.teams[g.line.fav].name} favored by ${g.line.pts}` : "Even");
const tint = (t: Team, on: boolean) => ({ "--c": t.color, "--ink": on ? inkOn(t.color) : undefined }) as React.CSSProperties;

// Without onPick the chip is a plain span (the dimmed rows in the spotlight).
function Chip({ g, i, pick, onPick }: { g: Game; i: 0 | 1; pick?: Pick; onPick?: (p: Pick) => void }) {
  const t = g.teams[i];
  const on = pick === i;
  const Tag = onPick ? "button" : "span";
  return (
    <Tag
      className={"chip" + (on ? " on" : "")}
      style={tint(t, on)}
      {...(onPick && {
        "aria-pressed": on,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onPick(i);
        },
      })}
    >
      <span className="nm">{tl(t)}</span>
      <span className="rec">{t.record}</span>
    </Tag>
  );
}

// Mascot, conference, date and the fact: what the card does not already show.
function Info({ g }: { g: Game }) {
  return (
    <>
      <div className="teams">
        {g.teams.map((t, i) => (
          <div key={i} className="tinfo">
            <div>{t.mascot}</div>
            <small>{t.conf}</small>
          </div>
        ))}
      </div>
      <p className="meta">{g.date}</p>
      {g.fact && <p className="fact">{g.fact}</p>}
    </>
  );
}

function Picks({ g, pick, onPick }: { g: Game; pick?: Pick; onPick: (p: Pick) => void }) {
  return (
    <div className="pickbtns">
      <Chip g={g} i={0} pick={pick} onPick={onPick} />
      <Chip g={g} i={1} pick={pick} onPick={onPick} />
    </div>
  );
}

// The row both lists share: points, the bowl and line as a title with a
// chevron when the row opens the spotlight, and the two team chips (the card's
// chips) beneath. Without onPick the chips are plain (the dimmed rows in the
// spotlight). A ranked row is exactly `ROW` tall including its gap, so the two
// lists line up.
function Cells({ g, pts, pick, onPick, open, end }: { g: Game; pts: number; pick?: Pick; onPick?: (p: Pick) => void; open?: boolean; end?: React.ReactNode }) {
  const unpicked = pick === undefined;
  return (
    <>
      <span className={"rk" + (unpicked ? " un" : "")} aria-label={`${pts} points${unpicked ? ", no pick yet" : ""}`}>
        {pts}
        <i>pts</i>
      </span>
      <div className="mu">
        <div className="hd">
          <div className="tt">
            <b className="bt">{g.bowl}</b>
            <span className="ml">{lineText(g)}</span>
          </div>
          {end ?? (
            <span className="chev" aria-hidden>
              {open && "›"}
            </span>
          )}
        </div>
        <div className="mt">
          <Chip g={g} i={0} pick={pick} onPick={onPick} />
          <Chip g={g} i={1} pick={pick} onPick={onPick} />
        </div>
      </div>
    </>
  );
}

function Head2Head({ s, id, onPlace, onClose }: { s: S; id: string; onPlace: (idx: number) => void; onClose: () => void }) {
  const rest = s.order.filter((x) => x !== id);
  const [r, setR] = useState({ lo: 0, hi: rest.length, q: 1 });
  const mid = (r.lo + r.hi) >> 1;
  const a = BY_ID[id];
  const b = BY_ID[rest[mid]];
  const answer = (hi: number, lo: number) => {
    if (lo >= hi) onPlace(lo);
    else setR({ lo, hi, q: r.q + 1 });
  };
  const Card = ({ g }: { g: Game }) => (
    <div className="h2hcard">
      <b>{g.bowl}</b>
      <small>
        {tl(g.teams[0])} vs {tl(g.teams[1])} · {lineText(g)}
      </small>
      <small>{s.picks[g.id] === undefined ? "No pick yet" : `Pick: ${g.teams[s.picks[g.id]].name}`}</small>
      <small>Currently {rankOf(s, g.id)} pts</small>
    </div>
  );
  return (
    <div className="modal" role="dialog" aria-label="Help me place this">
      <div className="mbox">
        <h3>Which are you surer of?</h3>
        <small>
          Question {r.q} of about {Math.ceil(Math.log2(N))}
        </small>
        <button className="h2hbtn" onClick={() => answer(mid, r.lo)}>
          <Card g={a} />
          <em>Placing this one</em>
        </button>
        <button className="h2hbtn" onClick={() => answer(r.hi, mid + 1)}>
          <Card g={b} />
        </button>
        <button onClick={() => onPlace(mid)}>About the same</button>
        <button className="ghost" onClick={onClose}>
          Stop
        </button>
      </div>
    </div>
  );
}

function Tiers({ s, setS, onClose }: { s: S; setS: (f: (s: S) => S) => void; onClose: () => void }) {
  const [tiers, setTiers] = useState<Record<string, Tier>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const queue = s.order.filter((id) => !tiers[id] && !skipped.includes(id));
  const done = Object.keys(tiers).length;
  const g = BY_ID[queue[0]];
  const apply = () => {
    const of = (t: Tier) => shuffle(s.order.filter((id) => tiers[id] === t));
    setS((p) => ({ ...p, order: [...of("lock"), ...of("lean"), ...of("coin"), ...p.order.filter((id) => !tiers[id])] }));
    onClose();
  };
  const pick = (p: Pick) => setS((x) => ({ ...x, picks: { ...x.picks, [g.id]: x.picks[g.id] === p ? undefined! : p } }));
  const label: Record<Tier, string> = { lock: "Lock", lean: "Lean", coin: "Coin flip" };
  return (
    <div className="modal" role="dialog" aria-label="Sort into tiers">
      <div className="mbox">
        <h3>Sort into tiers</h3>
        <small>
          {done} sorted · {queue.length} left
        </small>
        {g ? (
          <>
            <b className="big">{g.bowl}</b>
            <p className="meta">{lineText(g)}</p>
            <Info g={g} />
            <Picks g={g} pick={s.picks[g.id]} onPick={pick} />
            <div className="tierbtns">
              {(["lock", "lean", "coin"] as Tier[]).map((t) => (
                <button key={t} className={"tier " + t} onClick={() => setTiers({ ...tiers, [g.id]: t })}>
                  {label[t]}
                </button>
              ))}
            </div>
            <button className="ghost" onClick={() => setSkipped([...skipped, g.id])}>
              Skip this one
            </button>
          </>
        ) : (
          <p>All games sorted.</p>
        )}
        <button className="primary" onClick={apply}>
          {g ? "Finish now and apply" : "Apply order"}
        </button>
        <button className="ghost" onClick={onClose}>
          Cancel (keep current order)
        </button>
      </div>
    </div>
  );
}

// Pitch of a game in both lists (a row plus a 4 px gap); exposed to the
// CSS as --row.
const ROW = 96;
const DUR = 230;
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const still = window.matchMedia("(prefers-reduced-motion: reduce)");
// From this width the controls sit under the card instead of along the bottom
// edge; keep in sync with the media query in try.css.
const desk = window.matchMedia("(min-width: 700px)");
const clamp = (j: number) => Math.max(0, Math.min(N - 1, j));
// Vertical offset of rest[r] when the list is at scroll position p: rows above
// the game's slot go up and rows below go down. `closed` is the page layout,
// where the game's own row still occupies a pitch and nothing is gapped.
const shift = (r: number, p: number, half: number, closed: boolean) => {
  const v = Math.max(-1, Math.min(1, 2 * (r + 0.5 - p)));
  return v * (closed ? (v > 0 ? ROW : 0) : half);
};
const HINT_KEY = "try-spot-hint-v1";
const DRAG_PX = 6;
const STOP_MS = 150;

// The list scrolls under a fixed card. The list holds every game but the
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
function Spotlight({ s, id, from, closing, setS, move, active, onHelp, onDone, onCancel, onClosed }: {
  s: S;
  id: string;
  from: DOMRect;
  closing: boolean;
  setS: (f: (s: S) => S) => void;
  move: (idx: number) => void;
  active: boolean;
  onHelp: () => void;
  onDone: () => void;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const g = BY_ID[id];
  const i = s.order.indexOf(id);
  const rest = s.order.filter((x) => x !== id);
  const [pos, setPos] = useState(i);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [hint, setHint] = useState(() => !localStorage.getItem(HINT_KEY));
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
      run(
        c,
        [
          { transform: `translate(${rect.left - to.left}px, ${rect.top - to.top}px) scale(${rect.width / to.width}, ${rect.height / to.height})`, borderColor: "#d5dbe5" },
          { transform: "none", borderColor: "#1a56c4" },
        ],
      ),
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
    animate(document.getElementById("g-" + id)!.getBoundingClientRect(), true).then(onClosed);
  }, [closing]);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(layout);
    ro.observe(card.current!);
    ro.observe(bar.current!);
    return () => ro.disconnect();
  }, []);
  // Placement made elsewhere (Help me place this) moves the list to match.
  useEffect(() => {
    if (i !== committed.current) {
      committed.current = i;
      setPos(i);
      goto(i);
    }
  }, [i]);
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
    localStorage.setItem(HINT_KEY, "1");
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
  const pick = (p: Pick) => setS((x) => ({ ...x, picks: { ...x.picks, [id]: x.picks[id] === p ? undefined! : p } }));
  const top = pos === 0;
  const bottom = pos === N - 1;
  return (
    <div className={"spot" + (closing ? " closing" : "")} role="dialog" aria-label="Spotlight" ref={spot}>
      <div className="wheel" ref={wheel} onScroll={onScroll} onPointerDownCapture={onWheelDown} onClick={onWheelClick} data-testid="wheel">
        <div className="sp" />
        {rest.map((o, k) => (
          <div key={k} className="slot">
            <div className="dim" onClick={() => !dragged.current && !stopping.current && to(k < pos ? k : k + 1)}>
              <Cells g={BY_ID[o]} pts={N - (k < pos ? k : k + 1)} pick={s.picks[o]} />
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
          Scroll the list to move this game, or tap where it should go.
        </div>
      )}
      <div className="stack" ref={stack}>
      <div className="cw">
      <div className="card" ref={card}>
        <Cells
          g={g}
          pts={N - pos}
          pick={s.picks[id]}
          onPick={pick}
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
              <button role="menuitem" onClick={() => choose(onHelp)}>
                Help me place
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
            <h3>{g.bowl}</h3>
            <Info g={g} />
            <button onClick={() => setSheet(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

const MAIN_HINT_KEY = "try-main-hint-v1";
type Pt = { x: number; y: number };

// Coach marks over the first ranked row, one callout at a time: first at its
// first team button, then at its title. Any tap outside "Next", and any scroll,
// dismisses.
function MainHint({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [m, setM] = useState<{ row: DOMRect; chip: Pt; title: Pt; w: number }>();
  useLayoutEffect(() => {
    const row = document.querySelector<HTMLElement>(".try .row.open");
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    const measure = () => {
      const r = row.getBoundingClientRect();
      const c = row.querySelector(".chip")!.getBoundingClientRect();
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
  }, [onClose]);
  if (!m) return null;
  const left = (p: Pt) => Math.max(8, Math.min(p.x - m.w / 2, innerWidth - 8 - m.w));
  const arrow = (p: Pt) => ({ left: p.x - left(p) - 9 });
  return (
    <div className="coach" onClick={onClose}>
      <div className="cut" style={{ left: m.row.left, top: m.row.top, width: m.row.width, height: m.row.height }} />
      {step === 1 ? (
        <div key={1} className="callout down" role="note" style={{ left: left(m.chip), width: m.w, top: m.chip.y + 12 }}>
          <i style={arrow(m.chip)} />
          <b>Tap a team to pick the winner.</b>
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
          <b>Tap the game to move it up or down. The top game is worth the most points.</b>
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

export function Proto() {
  const [s, setS] = useState<S>(load);
  const [coach, setCoach] = useState(() => !localStorage.getItem(MAIN_HINT_KEY));
  const closeCoach = useCallback(() => {
    localStorage.setItem(MAIN_HINT_KEY, "1");
    setCoach(false);
  }, []);
  const [saved, setSaved] = useState(true);
  const [spot, setSpot] = useState<string>();
  const [h2h, setH2h] = useState<string>();
  const [tiers, setTiers] = useState(false);
  const [flash, setFlash] = useState<{ id: string; n: number; cancel: boolean }>();
  const first = useRef(true);
  const origin = useRef(0);
  const keep = useRef(false);
  const pushed = useRef(false);
  const jumped = useRef(-1);
  const from = useRef<DOMRect>(undefined!);
  const cancelled = useRef(false);
  const [closing, setClosing] = useState(false);

  // Going back would otherwise restore the scroll position from before the
  // spotlight opened, after the scroll to the game's row has already run.
  useEffect(() => {
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = "auto";
    };
  }, []);

  // Scroll the page to a game and flash it. The highlight overlay is re-keyed
  // per call so a second flash restarts its CSS animation.
  const show = (id: string, cancel = false) => setFlash((f) => ({ id, n: (f?.n ?? 0) + 1, cancel }));
  useLayoutEffect(() => {
    if (flash) document.getElementById("g-" + flash.id)?.scrollIntoView({ block: "center" });
  }, [flash]);

  const place = (id: string, idx: number) => setS((p) => ({ ...p, order: moved(p.order, id, idx) }));
  const open = (id: string) => {
    origin.current = s.order.indexOf(id);
    from.current = document.getElementById("g-" + id)!.getBoundingClientRect();
    setSpot(id);
  };
  // The page scrolls to the game's final row while the spotlight still covers
  // it; the spotlight then collapses into that row and the flash plays.
  useLayoutEffect(() => {
    if (closing) document.getElementById("g-" + spot)?.scrollIntoView({ block: "center" });
  }, [closing]);
  const closed = () => {
    setSpot(undefined);
    setClosing(false);
    show(spot!, cancelled.current);
  };
  // The spotlight owns one history entry, so the back button cancels it; the
  // buttons close it by going back too, and the popstate handler does the work.
  const close = (done: boolean) => {
    keep.current = done;
    history.back();
  };
  useEffect(() => {
    if (!spot) return;
    if (!pushed.current) {
      history.pushState({ spot: true }, "");
      pushed.current = true;
    }
    const onPop = () => {
      pushed.current = false;
      const done = keep.current;
      if (!done) place(spot, origin.current);
      keep.current = false;
      cancelled.current = !done;
      setH2h(undefined);
      setClosing(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [spot]);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(s));
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved(false);
    const t = setTimeout(() => setSaved(true), 500);
    return () => clearTimeout(t);
  }, [s]);

  const all = [...FIXED.map((g) => g.id), ...s.order];
  const total = all.length;
  const unpicked = all.filter((id) => s.picks[id] === undefined);
  const nextUnpicked = () => {
    for (let k = 1; k <= total; k++) {
      const j = (jumped.current + k) % total;
      if (s.picks[all[j]] === undefined) {
        jumped.current = j;
        show(all[j]);
        return;
      }
    }
  };
  const togglePick = (id: string) => (p: Pick) =>
    setS((x) => ({ ...x, picks: { ...x.picks, [id]: x.picks[id] === p ? undefined! : p } }));
  const hl = (id: string) => flash?.id === id && <span key={flash.n} className={"hl" + (flash.cancel ? " cancel" : "")} aria-hidden />;

  return (
    <div className="try" style={{ "--row": ROW + "px" } as React.CSSProperties}>
      <div className="head">
        <div className="status">
          <button className="ghost jump" disabled={!unpicked.length} onClick={nextUnpicked}>
            {unpicked.length ? `picked ${total - unpicked.length}/${total} · next ›` : `picked ${total}/${total} ✓`}
          </button>
          <span className="saved">{saved ? "Saved ✓" : "Saving…"}</span>
          <button className="ghost" onClick={() => setTiers(true)}>
            Sort into tiers
          </button>
          <button
            className="ghost helpbtn"
            aria-label="Help"
            onClick={() => {
              localStorage.removeItem(HINT_KEY);
              setCoach(true);
            }}
          >
            ?
          </button>
        </div>
      </div>
      <p className="how">Pick every game, then rank them: the top game is worth {N} pts.</p>

      <h2>Playoff · {FIXED_POINTS} pts each</h2>
      <div className="list">
        {FIXED.map((g) => (
          <div key={g.id} id={"g-" + g.id} className="row">
            {hl(g.id)}
            <Cells g={g} pts={FIXED_POINTS} pick={s.picks[g.id]} onPick={togglePick(g.id)} />
          </div>
        ))}
      </div>
      <h2>Ranked games · {N} to 1 pts</h2>
      <div className="list">
        {s.order.map((id, k) => (
          <div key={id} id={"g-" + id} className="row open" onClick={() => open(id)}>
            {hl(id)}
            <Cells g={BY_ID[id]} pts={N - k} pick={s.picks[id]} onPick={togglePick(id)} open />
          </div>
        ))}
      </div>
      <button
        className="danger"
        onClick={() => {
          if (confirm("Reshuffle and clear all picks?")) setS(fresh());
        }}
      >
        Reset all picks
      </button>

      {spot && (
        <Spotlight
          key={spot}
          s={s}
          id={spot}
          from={from.current}
          closing={closing}
          onClosed={closed}
          setS={setS}
          move={(idx) => place(spot, idx)}
          active={!h2h && !closing}
          onHelp={() => setH2h(spot)}
          onDone={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
      {h2h && (
        <Head2Head
          s={s}
          id={h2h}
          onPlace={(idx) => {
            place(h2h, idx);
            setH2h(undefined);
          }}
          onClose={() => setH2h(undefined)}
        />
      )}
      {coach && !spot && <MainHint onClose={closeCoach} />}
      {tiers && <Tiers s={s} setS={setS} onClose={() => setTiers(false)} />}
    </div>
  );
}
