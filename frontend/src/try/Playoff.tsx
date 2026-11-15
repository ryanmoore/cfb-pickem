import { useCallback, useMemo, useState } from "react";
import { Cells } from "../picks/Cells";
import { CoachMarks } from "../picks/CoachMarks";
import { moved, type Game } from "../picks/model";
import { ROW, Spotlight } from "../picks/Spotlight";
import { useSpotlightFlow } from "../picks/useSpotlightFlow";
import "../picks/picks.css";
import "./try.css";
import { Bracket } from "./Bracket";
import { FIELDS, gameLabel, maxWins, road, teamLabel, whoIn, type Field } from "./bracket";

const KEY = "pickem:try:playoff";
const HINT = "pickem:try:playoff-hint";
const COACH: [string, string] = [
  "The badge is the most wins this team can earn; the line under the name is its path.",
  "Tap a team to move it up or down. The top team is worth the most points.",
];

type Saved = { size: number; orders: Record<number, number[]> };

const load = (): Saved => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "");
    if (FIELDS[s.size]) return s;
  } catch {
    /* first visit or unreadable: start fresh */
  }
  return { size: 12, orders: {} };
};

const seedOrder = (f: Field) => Array.from({ length: f.size }, (_, k) => k + 1);

function teamGame(f: Field, seed: number): Game {
  const steps = road(f, seed);
  const first = steps[0];
  const wins = maxWins(f, seed);
  const rival = "team" in first.opponent ? first.opponent : undefined;
  return {
    id: seed,
    name: f.teams[seed - 1],
    kickoffAt: "",
    fixedWager: null,
    slots: [],
    line: `#${seed} · ${first.game.round > 0 ? "bye" : `plays ${rival ? teamLabel(f, rival.team) : "?"}`}`,
    badge: `up to ${wins} wins`,
    details: (
      <>
        {steps.map(({ game, opponent }, k) => (
          <p key={game.id} className="meta">
            {k > 0 && "→ "}
            <b>{f.rounds[game.round]}</b> vs {whoIn(f, opponent)}
            {game.bowl && f.rounds[game.round] !== "Final" ? ` (${gameLabel(f, game)})` : ""}
          </p>
        ))}
      </>
    ),
  };
}

export function Playoff() {
  const [saved, setSaved] = useState(load);
  const f = FIELDS[saved.size];
  const order = saved.orders[f.size] ?? seedOrder(f);
  const update = (next: Saved) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    setSaved(next);
  };
  const move = (id: number, idx: number) => update({ ...saved, orders: { ...saved.orders, [f.size]: moved(order, id, idx) } });

  const games = useMemo(() => new Map(order.map((s) => [s, teamGame(f, s)])), [f, order]);
  // A team has no winner to pick; any value keeps the points tile from showing "no pick yet".
  const entry = { order, winners: Object.fromEntries(order.map((s) => [s, 0])) };
  const [bracket, setBracket] = useState(false);
  const [coach, setCoach] = useState(() => !localStorage.getItem(HINT));
  const closeCoach = useCallback(() => {
    localStorage.setItem(HINT, "1");
    setCoach(false);
  }, []);
  const { spot, closing, flash, from, open, close, closed } = useSpotlightFlow(order, move);
  const hl = (id: number) => flash?.id === id && <span key={flash.n} className={"hl" + (flash.cancel ? " cancel" : "")} aria-hidden />;

  return (
    <div className="picks" style={{ "--row": ROW + "px" } as React.CSSProperties}>
      <h2>Playoff prototype</h2>
      <div className="fieldtoggle" role="group" aria-label="Field size">
        {[12, 24].map((n) => (
          <button key={n} className={n === f.size ? "primary" : ""} aria-pressed={n === f.size} onClick={() => update({ ...saved, size: n })}>
            {n} teams
          </button>
        ))}
      </div>
      <div className="sechead">
        <h2>Playoff</h2>
        <button className="ghost" onClick={() => setBracket(!bracket)}>
          {bracket ? "Back to list" : "Bracket"}
        </button>
        {!bracket && (
          <button className="ghost helpbtn" aria-label="Help" onClick={() => setCoach(true)}>
            ?
          </button>
        )}
      </div>
      <p className="how">Rank the playoff teams. Each win scores your rank for that team.</p>
      {bracket ? (
        <Bracket field={f} order={order} />
      ) : (
        <div className="list">
          {order.map((id, k) => (
            <div key={id} id={"g-" + id} className="row tap" onClick={() => open(id)}>
              {hl(id)}
              <Cells game={games.get(id)!} pts={order.length - k} pick={entry.winners[id]} open />
            </div>
          ))}
        </div>
      )}
      <p className="how">Points are scaled by 12/{f.size}, so the playoff weighs the same at any field size.</p>
      {spot !== undefined && (
        <Spotlight
          key={spot}
          entry={entry}
          games={games}
          id={spot}
          from={from}
          closing={closing}
          onClosed={closed}
          setWinner={() => {}}
          move={(idx) => move(spot, idx)}
          active={!closing}
          onDone={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
      {coach && spot === undefined && !bracket && <CoachMarks onClose={closeCoach} texts={COACH} anchor=".badge" />}
    </div>
  );
}
