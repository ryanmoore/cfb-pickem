import { useCallback, useMemo, useState } from "react";
import { Bracket } from "./Bracket";
import { Cells } from "./Cells";
import { CoachMarks, HINT_PLAYOFF } from "./CoachMarks";
import { gameLabel, road, whoIn, type Field } from "./bracket";
import type { Game } from "./model";
import { Spotlight } from "./Spotlight";
import { useSpotlightFlow } from "./useSpotlightFlow";
import "./playoff.css";

const COACH: [string, string] = [
  "The badge is the most wins this team can earn; the line under the name is its path.",
  "Tap a team to move it up or down. The top team is worth the most points.",
];

/** A playoff team as a row of the shared list: seed and path as the line, its most wins as the badge, its road in the details. */
function teamGame(f: Field, id: number): Game {
  const t = f.teams.get(id)!;
  const steps = road(f, id);
  const first = steps[0];
  return {
    id,
    name: t.name,
    kickoffAt: "",
    fixedWager: null,
    slots: [],
    line: `${t.seed ? `#${t.seed} · ` : ""}${first.game.round > 0 ? "bye" : `plays ${whoIn(f, first.opponent)}`}`,
    badge: `up to ${t.max_wins} wins`,
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

/**
 * The Playoff section of a season that ranks its teams: the team list on the
 * shared rows and spotlight, or the bracket. Without `move` the ranking is
 * read-only. `hold` keeps the first-visit coach marks back while another set
 * is showing.
 */
export function PlayoffRanking({ field, ranking, move, hold }: {
  field: Field;
  ranking: number[];
  move?: (team: number, idx: number) => void;
  hold: boolean;
}) {
  const games = useMemo(() => new Map(ranking.map((id) => [id, teamGame(field, id)])), [field, ranking]);
  const [bracket, setBracket] = useState(false);
  const [coach, setCoach] = useState(() => !localStorage.getItem(HINT_PLAYOFF));
  const closeCoach = useCallback(() => {
    localStorage.setItem(HINT_PLAYOFF, "1");
    setCoach(false);
  }, []);
  const { spot, closing, flash, from, open, close, closed } = useSpotlightFlow(ranking, move ?? (() => {}), "t-");
  const hl = (id: number) => flash?.id === id && <span key={flash.n} className={"hl" + (flash.cancel ? " cancel" : "")} aria-hidden />;
  const size = field.teams.size;

  return (
    <>
      <div className="sechead">
        <h2>Playoff</h2>
        <button className="ghost" onClick={() => setBracket(!bracket)}>
          {bracket ? "Back to list" : "Bracket"}
        </button>
        {move && !bracket && (
          <button className="ghost helpbtn" aria-label="Help on playoff teams" onClick={() => setCoach(true)}>
            ?
          </button>
        )}
      </div>
      {move && <p className="how">Rank the playoff teams. Each win scores your rank for that team.</p>}
      {bracket ? (
        <Bracket field={field} ranking={ranking} />
      ) : (
        <div className="list">
          {ranking.map((id, k) => (
            <div key={id} id={"t-" + id} className={"row team" + (move ? " tap" : "")} onClick={move && (() => open(id))}>
              {hl(id)}
              <Cells game={games.get(id)!} pts={ranking.length - k} open={!!move} />
            </div>
          ))}
        </div>
      )}
      <p className="how">Points are scaled by 12/{size}, so the playoff weighs the same at any field size.</p>
      {move && spot !== undefined && (
        <Spotlight
          key={spot}
          entry={{ order: ranking, winners: {} }}
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
          noun="team"
          rowPrefix="t-"
        />
      )}
      {move && coach && !hold && spot === undefined && !bracket && (
        <CoachMarks onClose={closeCoach} texts={COACH} anchor=".badge" row=".picks .row.team.tap" />
      )}
    </>
  );
}
