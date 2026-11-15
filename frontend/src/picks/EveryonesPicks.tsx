import { useQuery } from "@tanstack/react-query";
import { useState, type CSSProperties } from "react";
import { fetchGames, fetchPicks, fetchStandings, type ApiGame, type ApiTeam } from "../api";
import { fmt, PanelError, Skeleton } from "../ui";
import { ordinal } from "../YourSeasons";
import { byDay, byPoints, gameSides, gameState, maxPoints, playoffBoard, teamRows, type GameState, type Players, type Row } from "./everyone";
import { formatDay, formatWhen } from "./kickoff";
import "./everyones.css";

/**
 * One player per row, points shaded by how much of the most anyone staked; `flip` puts the points on the left.
 * With `earn`, each row also shows its points times that many wins.
 */
export function PickRows({ rows, max, flip, earn }: { rows: Row[]; max: number; flip?: boolean; earn?: number }) {
  if (!rows.length) return <p className="nobody">Nobody</p>;
  return (
    <ul className={"pr" + (flip ? " flip" : "")}>
      {rows.map((r) => (
        <li key={r.name} className={r.me ? "mine" : undefined}>
          <span className="nm">{r.name}</span>
          {r.points !== null && (
            <b className={`pt ${r.status}`} style={{ "--t": r.points / max } as CSSProperties}>{r.points}</b>
          )}
          {earn !== undefined && r.points !== null && <small className="ep">{r.points * earn} pts</small>}
        </li>
      ))}
    </ul>
  );
}

/** A game as a one-line header over two team columns, each listing who picked it. */
function Tile({ game, state, players, max }: { game: ApiGame; state: GameState; players: Players; max: number }) {
  return (
    <article className={`ep-tile ${state}`} id={`g-${game.id}`}>
      <div className="ep-info">
        <b className="bowl" title={game.name}>{game.name}</b>
        {state === "live" && <span className="ep-state live">● Underway</span>}
        {state === "final" && <span className="ep-state final">Final</span>}
        {state === "next" && (
          <span className="when">{formatWhen(game.kickoff_at)}{game.fixed_wager !== null && ` · worth ${game.fixed_wager}`}</span>
        )}
      </div>
      {gameSides(game, players).map(({ slot, status, rows, total }, i) => {
        const name = slot.team ? `${slot.team.rank ? `#${slot.team.rank} ` : ""}${slot.team.name}` : "To be decided";
        return (
          <div key={slot.id} className={`ep-side ${i ? "b" : "a"} ${status}`}>
            <h4 className="ep-th" title={name}>{status === "won" && "✓ "}{name}</h4>
            <small className="ep-sub">
              {slot.team?.record && `${slot.team.record} · `}{rows.length} {rows.length === 1 ? "pick" : "picks"} · {total} pts
            </small>
            <PickRows rows={rows} max={max} flip={i === 1} />
          </div>
        );
      })}
    </article>
  );
}

/** One playoff team: seed, win dots, the viewer's rank and what it has earned them, and the players' average rank. Opens to everyone's. */
function TeamSummary({ team: t, rows, playing }: { team: ApiTeam; rows: Row[]; playing: boolean }) {
  const avg = rows.length ? rows.reduce((n, r) => n + (r.points ?? 0), 0) / rows.length : null;
  const mine = rows.find((r) => r.me);
  const earned = (mine?.points ?? 0) * t.wins;
  const note = [t.eliminated ? "Out" : playing ? "Underway" : null, avg !== null && `avg ${fmt(Math.round(avg * 10) / 10)}`].filter(Boolean).join(" · ");
  return (
    <details className={"tm" + (t.eliminated ? " out" : "")}>
      <summary>
        <span className="sd">{t.seed}</span>
        <span className="who">
          <b>{t.name}</b>
          <small>{note}</small>
        </span>
        <span className="wins" role="img" aria-label={`${t.wins} of ${t.max_wins} wins`}>
          {Array.from({ length: t.max_wins }, (_, i) => <i key={i} className={i < t.wins ? "on" : undefined} />)}
        </span>
        {mine && (
          <span className="yr">
            <b>{mine.points}</b>
            <small>{earned} pts</small>
          </span>
        )}
      </summary>
      <PickRows rows={rows} max={rows.length} earn={t.wins} />
    </details>
  );
}

/** Playoff standing at a glance, then one row per team (those still alive first), then the points table. */
export function PlayoffSummary({ year, teams, games, players }: { year: number; teams: ApiTeam[]; games: ApiGame[]; players: Players }) {
  const standings = useQuery({ queryKey: ["standings", year], queryFn: () => fetchStandings(year) });
  const now = Date.now();
  const playing = new Set(games.filter((g) => gameState(g, now) === "live").flatMap((g) => g.slots.map((s) => s.team_season_id)));
  const ordered = [...teams.filter((t) => !t.eliminated), ...teams.filter((t) => t.eliminated)];
  const alive = teams.filter((t) => !t.eliminated).length;
  const rowsOf = new Map(teams.map((t) => [t.team_season_id, teamRows(t, players).sort(byPoints)]));
  const avg = (t: ApiTeam) => rowsOf.get(t.team_season_id)!.reduce((n, r) => n + (r.points ?? 0), 0) / Math.max(1, rowsOf.get(t.team_season_id)!.length);
  const favourite = [...ordered.slice(0, alive || undefined)].sort((a, b) => avg(b) - avg(a))[0];
  const board = standings.data && playoffBoard(standings.data.standings);
  const me = board?.find((r) => r.name === players.find((p) => p.is_me)?.display_name);
  return (
    <div className="po">
      <div className="po-top">
        <span className="chip"><b>{alive} of {teams.length}</b>still alive</span>
        {me && <span className="chip"><b>{me.points} pts · {ordinal(me.place)}</b>your playoff points</span>}
        <span className="chip"><b>#{favourite.seed} {favourite.name}</b>pool favourite</span>
      </div>
      <div className="tsum">
        {ordered.map((t) => <TeamSummary key={t.team_season_id} team={t} rows={rowsOf.get(t.team_season_id)!} playing={playing.has(t.team_season_id)} />)}
      </div>
      {standings.error && !standings.data ? (
        <PanelError error={standings.error} />
      ) : (
        board && (
          <details className="board">
            <summary>Playoff points so far</summary>
            <ol>
              {board.map((r) => (
                <li key={r.name} className={r.name === me?.name ? "mine" : undefined}>
                  <span>{r.place}.</span>
                  <span className="nm">{r.name}</span>
                  <b>{fmt(r.points)}</b>
                </li>
              ))}
            </ol>
          </details>
        )
      )}
    </div>
  );
}

/** Every player's picks once the season has locked: games underway, up next, the playoff teams, then decided games. */
export function EveryonesPicks({ year }: { year: number }) {
  const [daysOpen, setDaysOpen] = useState(false);
  const games = useQuery({ queryKey: ["games", year], queryFn: () => fetchGames(year) });
  const picks = useQuery({ queryKey: ["picks", year], queryFn: () => fetchPicks(year) });
  const error = (!games.data && games.error) || (!picks.data && picks.error);
  if (error) return <PanelError error={error} />;
  if (!games.data || !picks.data) return <Skeleton lines={5} />;
  const { players } = picks.data;
  if (!players.length) return <p>Nobody made picks this season.</p>;
  const now = Date.now();
  const all = games.data.games;
  const chrono = [...all].sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
  const sections = {
    live: chrono.filter((g) => gameState(g, now) === "live"),
    next: chrono.filter((g) => gameState(g, now) === "next"),
    final: chrono.filter((g) => gameState(g, now) === "final").reverse(),
  };
  const teams = games.data.playoff?.teams ?? [];
  const max = maxPoints(players);
  const section = (state: GameState, title: string) =>
    sections[state].length > 0 && (
      <section className="ep-sec" id={state}>
        <h3 className="groupt">{title} <span className="pill">{sections[state].length}</span></h3>
        <div className="ep-games">
          {sections[state].map((g) => <Tile key={g.id} game={g} state={state} players={players} max={max} />)}
        </div>
      </section>
    );
  return (
    <>
      <nav className="ep-jump" aria-label="Jump to">
        <div className="row">
          {sections.live.length > 0 && <a className="live" href="#live">Live <b>{sections.live.length}</b></a>}
          {sections.next.length > 0 && <a href="#next">Next <b>{sections.next.length}</b></a>}
          {teams.length > 0 && <a className="po" href="#playoff">Playoff</a>}
          {sections.final.length > 0 && <a className="done" href="#final">Final <b>{sections.final.length}</b></a>}
          <button type="button" aria-expanded={daysOpen} aria-label="Jump to a date" title="Jump to a date" onClick={() => setDaysOpen(!daysOpen)}>📅</button>
        </div>
        {daysOpen && (
          <div className="days">
            {byDay(all).map(({ key, games: gs }) => {
              const done = gs.every((g) => gameState(g, now) === "final");
              return (
                <a key={key} className={done ? "done" : undefined} href={`#g-${gs[0].id}`}>
                  <small>{formatDay(gs[0].kickoff_at)}</small>
                  <i>{done ? "✓" : `${gs.length} ${gs.length === 1 ? "game" : "games"}`}</i>
                </a>
              );
            })}
          </div>
        )}
      </nav>
      <ul className="legend" aria-hidden>
        <li><i className="pt won" />Won</li>
        <li><i className="pt lost" />Lost</li>
        <li><i className="pt open" />Still open</li>
        <li>Darker means more points</li>
      </ul>
      {section("live", "On now")}
      {section("next", "Up next")}
      {teams.length > 0 && (
        <section className="ep-sec" id="playoff">
          <h3 className="groupt">Playoff rankings <span className="pill">{teams.length} teams</span></h3>
          <PlayoffSummary year={year} teams={teams} games={games.data.playoff?.games ?? []} players={players} />
        </section>
      )}
      {section("final", "Final")}
    </>
  );
}
