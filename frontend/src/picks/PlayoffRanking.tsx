import { useEffect, useMemo, useState } from "react";
import { Bracket } from "./Bracket";
import { Cells } from "./Cells";
import { earned, gameLabel, road, whoIn, type Field } from "./bracket";
import type { Game } from "./model";
import { fmt } from "../ui";
import { Spotlight } from "./Spotlight";
import { useSpotlightFlow } from "./useSpotlightFlow";
import "./playoff.css";

/** The callouts for the first team's row: its badge, then its title. */
export const PLAYOFF_COACH: [string, string] = [
  "The badge is the most wins this team can earn; the line under the name is its path.",
  "Tap a team to move it up or down. The higher you rank it, the more each of its wins is worth.",
];

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** A playoff team as a row of the shared list: seed and path as the line, its most wins (or, once locked, its status) as the badge, its road in the details. */
function teamGame(f: Field, id: number, decided: boolean): Game {
  const t = f.teams.get(id)!;
  const steps = road(f, id);
  const first = steps[0];
  return {
    id,
    name: t.name,
    look: t,
    kickoffAt: "",
    fixedWager: null,
    slots: [],
    line: `${t.seed ? `#${t.seed} · ` : ""}${first.game.round > 0 ? "bye" : `plays ${whoIn(f, first.opponent)}`}`,
    badge: decided ? `${t.eliminated ? "Eliminated" : "Alive"} · ${plural(t.wins, "win")}` : `up to ${t.max_wins} wins`,
    details: (
      <>
        {steps.map(({ game, opponent }, k) => (
          <p key={game.id} className="meta">
            {k > 0 && "→ "}
            <b>{f.rounds[game.round]}</b> vs {whoIn(f, opponent)}
            {game.name && f.rounds[game.round] !== "Final" ? ` (${gameLabel(f, game)})` : ""}
          </p>
        ))}
      </>
    ),
  };
}

/** What ranking is for, with a worked example sized to this field. */
function Instructions({ field }: { field: Field }) {
  const size = field.teams.size;
  const maxWins = Math.max(...[...field.teams.values()].map((t) => t.max_wins));
  const byeWins = [...field.teams.keys()].flatMap((id) => (road(field, id)[0].game.round > 0 ? [field.teams.get(id)!.max_wins] : []));
  const wins = Math.min(3, maxWins);
  return (
    <div className="how">
      <p>
        <b>Rank {size} is your surest team.</b> A team scores its rank for every game it wins. Rank a team {size}th and it wins {plural(wins, "game")}:{" "}
        {fmt(earned(size, size, wins))} points{size === 12 && ` (${size} × ${wins})`}.
      </p>
      {byeWins.length > 0 && (
        <p>
          Teams with a bye can win at most {Math.max(...byeWins)} games; the rest can win up to {maxWins}.
        </p>
      )}
    </div>
  );
}

function ScoringDetails({ size, open }: { size: number; open: boolean }) {
  return (
    <details className="scoring">
      <summary>How scoring works</summary>
      <ul>
        <li>Each team scores its rank times the games it wins; your playoff points are the sum over all {size} teams.</li>
        <li>The team that goes furthest wins the most games, so the higher it is ranked, the more it earns.</li>
        {size !== 12 && <li>Points are scaled by 12/{size}, so the playoff weighs the same as it would with 12 teams.</li>}
        {open && <li>You can change your ranking until picks lock, even after you say you're done.</li>}
      </ul>
    </details>
  );
}

/**
 * The Playoff tab of a season that ranks its teams: the team list on the
 * shared rows and spotlight, or the bracket. Without `onDone` the ranking is
 * read-only. Once `done`, the list stays read-only until the player asks to
 * keep editing; editing does not undo the confirmation. `onSpot` reports
 * whether the spotlight is open.
 */
export function PlayoffRanking({ field, ranking, move, done = false, onDone, onSpot }: {
  field: Field;
  ranking: number[];
  move?: (team: number, idx: number) => void;
  done?: boolean;
  onDone?: (done: boolean) => void;
  onSpot?: (open: boolean) => void;
}) {
  const games = useMemo(() => new Map(ranking.map((id) => [id, teamGame(field, id, !move)])), [field, ranking, move]);
  const [bracket, setBracket] = useState(false);
  const [editing, setEditing] = useState(false);
  const edit = !done || editing ? move : undefined;
  const { spot, closing, flash, from, open, close, closed } = useSpotlightFlow(ranking, edit ?? (() => {}), "t-");
  useEffect(() => onSpot?.(spot !== undefined), [spot]);
  const hl = (id: number) => flash?.id === id && <span key={flash.n} className={"hl" + (flash.cancel ? " cancel" : "")} aria-hidden />;
  const size = field.teams.size;

  return (
    <>
      <div className="sechead">
        <h2>Playoff</h2>
        <button className="ghost" onClick={() => setBracket(!bracket)}>
          {bracket ? "Back to list" : "Bracket"}
        </button>
      </div>
      {move && <Instructions field={field} />}
      <ScoringDetails size={size} open={!!move} />
      {move && done && (
        <div className="confirmed" role="status">
          <b>✓ Ranking confirmed</b>
          <span>You can still change it until picks lock.</span>
          {!editing && <button onClick={() => setEditing(true)}>Keep editing</button>}
        </div>
      )}
      {bracket ? (
        <Bracket field={field} ranking={ranking} />
      ) : (
        <div className="list">
          {ranking.map((id, k) => (
            <div key={id} id={"t-" + id} className={"row team" + (edit ? " tap" : "") + (!move && field.teams.get(id)!.eliminated ? " out" : "")} onClick={edit && (() => open(id))}>
              {hl(id)}
              <Cells game={games.get(id)!} pts={ranking.length - k} open={!!edit} />
            </div>
          ))}
        </div>
      )}
      {onDone && !done && (
        <button className="primary imdone" onClick={() => onDone(true)}>
          I'm done ranking
        </button>
      )}
      {edit && spot !== undefined && (
        <Spotlight
          key={spot}
          entry={{ order: ranking, winners: {} }}
          games={games}
          id={spot}
          from={from}
          closing={closing}
          onClosed={closed}
          setWinner={() => {}}
          move={(idx) => move!(spot, idx)}
          active={!closing}
          onDone={() => close(true)}
          onCancel={() => close(false)}
          noun="team"
          rowPrefix="t-"
        />
      )}
    </>
  );
}
