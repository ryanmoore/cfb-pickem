// Throwaway prototype for choosing a pick-entry design. Delete this directory
// and the /try/picks branch in main.tsx once a design is chosen.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

function Chip({ g, i, pick, onPick }: { g: Game; i: 0 | 1; pick?: Pick; onPick: (p: Pick) => void }) {
  const t = g.teams[i];
  const on = pick === i;
  return (
    <button className={"chip" + (on ? " on" : "")} style={tint(t, on)} aria-pressed={on} onClick={() => onPick(i)}>
      <span className="nm">{tl(t)}</span>
      <span className="rec">{t.record}</span>
    </button>
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

const NoPick = () => <b className="np">no pick</b>;

// Bowl name (secondary), the line, and a marker when nothing is picked yet.
function Top({ g, pick, onOpen }: { g: Game; pick?: Pick; onOpen?: () => void }) {
  return (
    <>
      <div className="top">
        {onOpen ? (
          <button className="bowl" onClick={onOpen}>
            {g.bowl}
          </button>
        ) : (
          <span className="bowl">{g.bowl}</span>
        )}
        {pick === undefined && <NoPick />}
      </div>
      <small className="ln">{lineText(g)}</small>
    </>
  );
}

// Compact two-line matchup for the dimmed list: teams with the picked one
// filled, then the line and a no-pick marker.
function Matchup({ g, pick }: { g: Game; pick?: Pick }) {
  return (
    <div className="mu">
      <div className="mt">
        {[0, 1].map((i) => (
          <span key={i} className="tg-wrap">
            {i === 1 && <span className="vs">vs</span>}
            <span className={"tg" + (pick === i ? " on" : "")} style={tint(g.teams[i], pick === i)}>
              {pick === i && "✓ "}
              {g.teams[i].name}
            </span>
          </span>
        ))}
      </div>
      <div className="ml">
        {lineText(g)}
        {pick === undefined && (
          <>
            {" · "}
            <NoPick />
          </>
        )}
      </div>
    </div>
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

const ROW = 44;
// From this width the controls sit under the card instead of along the bottom
// edge; keep in sync with the media query in try.css.
const desk = window.matchMedia("(min-width: 700px)");
const clamp = (j: number) => Math.max(0, Math.min(N - 1, j));
const HINT_KEY = "try-spot-hint-v1";
const DRAG_PX = 6;

// The list scrolls under a fixed card. The list holds every game but the
// spotlighted one; scrollTop = j * ROW means the game sits between rest[j-1]
// and rest[j]. Rows above that point are translated up and rows below down by
// half the card's height (a transform, so snap points stay on the layout
// grid), which opens a card-sized gap and keeps both neighbours fully visible.
// Rows are keyed by position: the browser re-snaps to the same DOM node after
// a reorder, which would shift the list by a row on every commit.
function Spotlight({ s, id, setS, move, active, onHelp, onDone, onCancel }: {
  s: S;
  id: string;
  setS: (f: (s: S) => S) => void;
  move: (idx: number) => void;
  active: boolean;
  onHelp: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const g = BY_ID[id];
  const i = s.order.indexOf(id);
  const rest = s.order.filter((x) => x !== id);
  const [pos, setPos] = useState(i);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [hint, setHint] = useState(() => !localStorage.getItem(HINT_KEY));
  const dragged = useRef(false);
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
      el.style.transform = `translateY(${half * Math.max(-1, Math.min(1, 2 * (r + 0.5 - p)))}px)`;
    });
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

  useLayoutEffect(() => goto(i), []);
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

  const onScroll = () => {
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
    <div className="spot" role="dialog" aria-label="Spotlight" ref={spot}>
      <div className="wheel" ref={wheel} onScroll={onScroll} data-testid="wheel">
        <div className="sp" />
        {rest.map((o, k) => (
          <div key={k} className="slot">
            <div className="dim" onClick={() => !dragged.current && to(k < pos ? k : k + 1)}>
              <b className="pts">
                {N - (k < pos ? k : k + 1)}
                <i>pts</i>
              </b>
              <Matchup g={BY_ID[o]} pick={s.picks[o]} />
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
      <div className="card" ref={card}>
        <div className="chead">
          <div className="ctitle">
            <h3>{N - pos} pts</h3>
            <span className="cbowl">{g.bowl}</span>
            <small className="ln">{lineText(g)}</small>
          </div>
          <div className="cbtns">
            <button className="cancel" aria-label="Cancel" onClick={onCancel}>
              ✕
            </button>
            <button className="primary" onClick={onDone}>
              ✓ Done
            </button>
          </div>
        </div>
        <Picks g={g} pick={s.picks[id]} onPick={pick} />
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

export function Proto() {
  const [s, setS] = useState<S>(load);
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
    setSpot(id);
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
      show(spot, !done);
      setH2h(undefined);
      setSpot(undefined);
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
    <div className="try">
      <div className="head">
        <div className="status">
          <button className="ghost jump" disabled={!unpicked.length} onClick={nextUnpicked}>
            {unpicked.length ? `picked ${total - unpicked.length}/${total} · next unpicked` : `picked ${total}/${total} ✓`}
          </button>
          <span className="saved">{saved ? "Saved ✓" : "Saving…"}</span>
          <button className="ghost" onClick={() => setTiers(true)}>
            Sort into tiers
          </button>
        </div>
      </div>
      <p className="how">
        Pick a winner in every game. Then put the games you are surest of at the top: the top game is worth {N} pts, the
        next {N - 1}, and so on down to 1.
      </p>

      <h2>Fixed wager · {FIXED_POINTS} pts each</h2>
      {FIXED.map((g) => (
        <div key={g.id} id={"g-" + g.id} className={"row fixed" + (s.picks[g.id] === undefined ? " nopick" : "")}>
          {hl(g.id)}
          <span className="rk">
            {FIXED_POINTS}
            <i>pts</i>
          </span>
          <div className="mid">
            <Top g={g} pick={s.picks[g.id]} />
            <Picks g={g} pick={s.picks[g.id]} onPick={togglePick(g.id)} />
          </div>
        </div>
      ))}
      <h2>Ranked games · {N} to 1 pts</h2>
      {s.order.map((id, k) => {
        const g = BY_ID[id];
        return (
          <div key={id} id={"g-" + id} className={"row" + (s.picks[id] === undefined ? " nopick" : "")}>
            {hl(id)}
            <button className="rk" onClick={() => open(id)} aria-label={`${N - k} points, open`}>
              {N - k}
              <i>pts</i>
            </button>
            <div className="mid">
              <Top g={g} pick={s.picks[id]} onOpen={() => open(id)} />
              <Picks g={g} pick={s.picks[id]} onPick={togglePick(id)} />
            </div>
          </div>
        );
      })}
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
          setS={setS}
          move={(idx) => place(spot, idx)}
          active={!h2h}
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
      {tiers && <Tiers s={s} setS={setS} onClose={() => setTiers(false)} />}
    </div>
  );
}
