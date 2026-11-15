import { useQuery } from "@tanstack/react-query";
import { useState, type CSSProperties } from "react";
import { fetchGames, fetchPicks, type ApiGame, type ApiTeam } from "../api";
import { fmt, PanelError, Skeleton } from "../ui";
import { byDay, gameSides, gameState, maxPoints, teamRows, type GameState, type Players, type Row } from "./everyone";
import { formatDay, formatWhen } from "./kickoff";
import "./everyones.css";

/** One player per row, points shaded by how much of the most anyone staked; `flip` puts the points on the left. */
export function PickRows({ rows, max, flip }: { rows: Row[]; max: number; flip?: boolean }) {
  if (!rows.length) return <p className="nobody">Nobody</p>;
  return (
    <ul className={"pr" + (flip ? " flip" : "")}>
      {rows.map((r) => (
        <li key={r.name} className={r.me ? "mine" : undefined}>
          <span className="nm">{r.name}</span>
          {r.points !== null && (
            <b className={`pt ${r.status}`} style={{ "--t": r.points / max } as CSSProperties}>{r.points}</b>
          )}
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

/**
 * One playoff team: where it stands, the average rank players gave it and the
 * range of ranks as a bar (dot at the average). Opens to the per-player list.
 */
function TeamSummary({ team: t, rows, size, playing }: { team: ApiTeam; rows: Row[]; size: number; playing: boolean }) {
  const ranks = rows.map((r) => r.points ?? 0);
  const at = (rank: number) => `${((rank - 1) / Math.max(1, size - 1)) * 100}%`;
  const avg = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
  const lo = Math.min(...ranks);
  const hi = Math.max(...ranks);
  return (
    <details className={"tm" + (t.eliminated ? " out" : "")}>
      <summary>
        <span className="who">
          <b>{t.seed ? `#${t.seed} ` : ""}{t.name}</b>
          <small>{t.eliminated ? "Eliminated" : playing ? "Underway" : "Alive"} · {t.wins} {t.wins === 1 ? "win" : "wins"}</small>
        </span>
        {ranks.length > 0 && (
          <span className="avg" title={`Ranked ${lo} to ${hi}`}>
            <b>{fmt(Math.round(avg * 10) / 10)}</b>
            <i className="rng" aria-hidden>
              <i style={{ left: at(lo), right: `calc(100% - ${at(hi)})` }} />
              <em style={{ left: at(avg) }} />
            </i>
            <small>{lo}–{hi}</small>
          </span>
        )}
      </summary>
      <PickRows rows={rows} max={size} />
    </details>
  );
}

/** One row per playoff team, with a team in a game now marked as underway. */
export function PlayoffSummary({ teams, games, players }: { teams: ApiTeam[]; games: ApiGame[]; players: Players }) {
  const now = Date.now();
  const playing = new Set(games.filter((g) => gameState(g, now) === "live").flatMap((g) => g.slots.map((s) => s.team_season_id)));
  return (
    <div className="tsum">
      {teams.map((t) => (
        <TeamSummary key={t.team_season_id} team={t} rows={teamRows(t, players)} size={teams.length} playing={playing.has(t.team_season_id)} />
      ))}
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
          <PlayoffSummary teams={teams} games={games.data.playoff?.games ?? []} players={players} />
        </section>
      )}
      {section("final", "Final")}
    </>
  );
}
