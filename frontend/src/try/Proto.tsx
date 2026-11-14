// Throwaway prototype for choosing a pick-entry design. Delete this directory
// and the /try/picks branch in main.tsx once a design is chosen.
import { useEffect, useRef, useState } from "react";
import { FIXED, FIXED_POINTS, GAMES, type Game, type Team } from "./fixtures";
import "./try.css";

type Pick = 0 | 1;
type Design = "A" | "F";
type S = { order: string[]; picks: Record<string, Pick>; design: Design };
type Tier = "lock" | "lean" | "coin";

const KEY = "try-picks-v1";
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
const fresh = (design: Design = "A"): S => ({ order: shuffle(GAMES.map((g) => g.id)), picks: {}, design });
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

function Chip({ g, i, pick, onPick }: { g: Game; i: 0 | 1; pick?: Pick; onPick: (p: Pick) => void }) {
  const t = g.teams[i];
  const on = pick === i;
  return (
    <button
      className={"chip" + (on ? " on" : "")}
      style={{ "--c": t.color, "--ink": on ? inkOn(t.color) : undefined } as React.CSSProperties}
      aria-pressed={on}
      onClick={() => onPick(i)}
    >
      <span className="nm">{tl(t)}</span>
      <span className="rec">{t.record}</span>
    </button>
  );
}

function TeamInfo({ t }: { t: Team }) {
  return (
    <div className="tinfo" style={{ "--c": t.color } as React.CSSProperties}>
      <b>{tl(t)}</b>
      <div>{t.mascot}</div>
      <small>
        {t.conf} · {t.record}
      </small>
    </div>
  );
}

function Info({ g }: { g: Game }) {
  return (
    <>
      <div className="teams">
        <TeamInfo t={g.teams[0]} />
        <span className="vs">vs</span>
        <TeamInfo t={g.teams[1]} />
      </div>
      <p className="meta">
        {g.date} · {g.line}
      </p>
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

function Num({ label, onGo, max = N }: { label: string; onGo: (n: number) => void; max?: number }) {
  const [v, setV] = useState("");
  const go = () => {
    const n = parseInt(v, 10);
    if (n >= 1 && n <= max) {
      onGo(n);
      setV("");
    }
  };
  return (
    <span className="num">
      <label>
        {label}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={v}
          aria-label={label}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
      </label>
      <button onClick={go}>Go</button>
    </span>
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
        {g.teams[0].abbr} vs {g.teams[1].abbr} · {g.line}
      </small>
      <small>Currently #{rankOf(s, g.id)}</small>
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

function Spotlight({ s, id, setS, move, onHelp, onClose }: {
  s: S;
  id: string;
  setS: (f: (s: S) => S) => void;
  move: (idx: number) => void;
  onHelp: () => void;
  onClose: () => void;
}) {
  const g = BY_ID[id];
  const i = s.order.indexOf(id);
  const slot = (j: number) => {
    const o = s.order[j];
    return o ? (
      <div key={j} className="dim" onClick={onClose}>
        <b>{N - j}</b> {BY_ID[o].bowl}
      </div>
    ) : (
      <div key={j} className="dim empty" onClick={onClose} />
    );
  };
  const pick = (p: Pick) => setS((x) => ({ ...x, picks: { ...x.picks, [id]: x.picks[id] === p ? undefined! : p } }));
  return (
    <div className="spot" role="dialog" aria-label="Spotlight" onClick={onClose}>
      {[i - 3, i - 2, i - 1].map(slot)}
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h3>
          #{N - i} · {g.bowl}
        </h3>
        <Info g={g} />
        <Picks g={g} pick={s.picks[id]} onPick={pick} />
        <div className="arrows">
          <button className="big" aria-label="Up one" onClick={() => move(i - 1)}>
            ▲
          </button>
          <button className="big" aria-label="Down one" onClick={() => move(i + 1)}>
            ▼
          </button>
        </div>
        <div className="row5">
          <button onClick={() => move(i - 5)}>+5</button>
          <button onClick={() => move(i + 5)}>−5</button>
          <button onClick={() => move(0)}>Top</button>
          <button onClick={() => move(N - 1)}>Bottom</button>
        </div>
        <Num label="Move to #" onGo={(n) => move(N - n)} />
        <div className="row5">
          <button onClick={onHelp}>Help me place this</button>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
      {[i + 1, i + 2, i + 3].map(slot)}
    </div>
  );
}

export function Proto() {
  const [s, setS0] = useState<S>(load);
  const [saved, setSaved] = useState(true);
  const [spot, setSpot] = useState<string>();
  const [sheet, setSheet] = useState<string>();
  const [lift, setLift] = useState<{ id: string; from: number }>();
  const [h2h, setH2h] = useState<string>();
  const [tiers, setTiers] = useState(false);
  const first = useRef(true);
  const setS = (f: (s: S) => S) => setS0(f);

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

  const picked = Object.values(s.picks).filter((v) => v !== undefined).length;
  const total = N + FIXED.length;
  const place = (id: string, idx: number) => {
    setS((p) => ({ ...p, order: moved(p.order, id, idx) }));
    if (lift) setTimeout(() => document.getElementById("g-" + id)?.scrollIntoView({ block: "center" }), 0);
  };
  const togglePick = (id: string) => (p: Pick) =>
    setS((x) => ({ ...x, picks: { ...x.picks, [id]: x.picks[id] === p ? undefined! : p } }));
  const startMove = (id: string) => {
    setSheet(undefined);
    setLift({ id, from: s.order.indexOf(id) });
  };
  const jump = (rank: number) =>
    document.getElementById("g-" + s.order[N - rank])?.scrollIntoView({ block: "start", behavior: "smooth" });
  const liftIdx = lift ? s.order.indexOf(lift.id) : -1;

  const rowFor = (id: string, k: number) => {
    const g = BY_ID[id];
    const lifted = lift?.id === id;
    const openSpot = () => s.design === "A" && setSpot(id);
    return (
      <div key={id}>
        {lift && !lifted && k !== liftIdx + 1 && (
          <button className="slot" onClick={() => { place(lift.id, k > liftIdx ? k - 1 : k); setLift(undefined); }}>
            place here: {N - (k > liftIdx ? k - 1 : k)}
          </button>
        )}
        <div id={"g-" + id} className={"row" + (lifted ? " lifted" : "")}>
          <button className="rk" onClick={openSpot} aria-label={`Rank ${N - k}`}>
            {N - k}
          </button>
          <div className="mid">
            <div className="top">
              <button className="bowl" onClick={openSpot}>
                {g.bowl}
              </button>
              <span className="badge">{g.line}</span>
              {s.design === "F" && (
                <button className="i" aria-label={`Info: ${g.bowl}`} onClick={() => setSheet(id)}>
                  i
                </button>
              )}
            </div>
            <div className="pickbtns">
              <Chip g={g} i={0} pick={s.picks[id]} onPick={togglePick(id)} />
              <Chip g={g} i={1} pick={s.picks[id]} onPick={togglePick(id)} />
              {s.design === "F" && (
                <button className="mv" disabled={!!lift} onClick={() => startMove(id)}>
                  Move
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const lg = lift && BY_ID[lift.id];
  const sg = sheet ? BY_ID[sheet] : undefined;
  return (
    <div className="try">
      <div className="head">
        <div className="seg" role="tablist">
          {(["A", "F"] as Design[]).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={s.design === d}
              className={s.design === d ? "sel" : ""}
              onClick={() => {
                setLift(undefined);
                setSpot(undefined);
                setS((p) => ({ ...p, design: d }));
              }}
            >
              {d === "A" ? "A · Spotlight" : "F · Ladder"}
            </button>
          ))}
        </div>
        <div className="status">
          <b>
            picked {picked}/{total}
          </b>
          <span className="saved">{saved ? "Saved ✓" : "Saving…"}</span>
          <button className="ghost" onClick={() => setTiers(true)}>
            Sort into tiers
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (confirm("Reshuffle and clear all picks?")) {
                setLift(undefined);
                setS((p) => fresh(p.design));
              }
            }}
          >
            Reset
          </button>
        </div>
        {lg && (
          <div className="liftbar">
            <div className="lt">
              <b>
                Moving: {lg.bowl} (now #{N - liftIdx})
              </b>
              <button
                className="cancel"
                aria-label="Cancel move"
                onClick={() => {
                  place(lift.id, lift.from);
                  setLift(undefined);
                }}
              >
                ✕ Cancel
              </button>
            </div>
            <Num label="Put at #" onGo={(n) => place(lift.id, N - n)} />
            <div className="row5">
              {[
                ["Top", N],
                ["30", 30],
                ["20", 20],
                ["10", 10],
                ["Bottom", 1],
              ].map(([l, r]) => (
                <button key={l} onClick={() => jump(r as number)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="row5">
              <button onClick={() => place(lift.id, liftIdx - 1)}>▲ up one</button>
              <button onClick={() => place(lift.id, liftIdx + 1)}>▼ down one</button>
              <button onClick={() => setH2h(lift.id)}>Help me place this</button>
              <button className="primary" onClick={() => setLift(undefined)}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      <h2>Fixed wager · {FIXED_POINTS} pts each</h2>
      {FIXED.map((g) => (
        <div key={g.id} className="row fixed">
          <span className="rk">{FIXED_POINTS}</span>
          <div className="mid">
            <div className="top">
              <span className="bowl">{g.bowl}</span>
              <span className="badge">{g.line}</span>
            </div>
            <Picks g={g} pick={s.picks[g.id]} onPick={togglePick(g.id)} />
          </div>
        </div>
      ))}
      <h2>Ranked games · {N} to 1</h2>
      {s.order.map(rowFor)}

      {spot && (
        <Spotlight s={s} id={spot} setS={setS} move={(idx) => place(spot, idx)} onHelp={() => setH2h(spot)} onClose={() => setSpot(undefined)} />
      )}
      {sg && (
        <div className="sheetbg" onClick={() => setSheet(undefined)}>
          <div className="sheet" role="dialog" aria-label="Game info" onClick={(e) => e.stopPropagation()}>
            <h3>
              #{rankOf(s, sg.id)} · {sg.bowl}
            </h3>
            <Info g={sg} />
            <Picks g={sg} pick={s.picks[sg.id]} onPick={togglePick(sg.id)} />
            <div className="row5">
              <button onClick={() => startMove(sg.id)}>Move</button>
              <button onClick={() => setSheet(undefined)}>Close</button>
            </div>
          </div>
        </div>
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
