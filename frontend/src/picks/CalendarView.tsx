import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { fetchGames, fetchPicks, fetchStandings, type ApiGame, type Standing, type TeamLook } from "../api";
import { fillOf, outlineOf } from "../teamLook";
import { PanelError, Skeleton } from "../ui";
import { slotName } from "./model";
import { byDay, gameSides, gameState, maxPoints, type Players } from "./everyone";
import { PickRows, PlayoffSummary } from "./EveryonesPicks";
import { formatDay, formatTime, formatWeekday } from "./kickoff";
import "./calendar.css";

/** Players in standings order (leader first); anyone not ranked follows by name. */
function inStandingsOrder(players: Players, standings: Standing[]): Players {
  const rank = new Map(standings.map((s) => [s.display_name, s.rank]));
  return [...players].sort((a, b) => (rank.get(a.display_name) ?? 1e9) - (rank.get(b.display_name) ?? 1e9) || a.display_name.localeCompare(b.display_name));
}

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3);

/** Side A is filled in its team's color and side B outlined in it, so two similar teams stay apart by shape; a side with no usable color keeps its role's own look. */
function sideKey(team: TeamLook | null | undefined, b: boolean): { className: string; style?: CSSProperties } {
  const o = b ? outlineOf(team) : null;
  const f = b ? null : fillOf(team);
  if (o) return { className: "oc" + (o.edge ? " edge" : ""), style: { "--tc": o.color, "--tf": o.ink, "--tw": o.ink === o.color ? "2px" : "3px" } as CSSProperties };
  if (f) return { className: "tc" + (f.edge ? " edge" : ""), style: { "--tc": f.bg, "--tf": f.ink } as CSSProperties };
  return { className: "" };
}

function SideSwatch({ team, b }: { team: TeamLook | null | undefined; b: boolean }) {
  const { className, style } = sideKey(team, b);
  return <i className={`sw ${b ? "b" : "a"} ${className}`} style={style} />;
}

/** One game: when, teams, and a pick cell per player in standings order; opens to the two sorted lists. */
function GameRow({ game, games, players, max, now }: { game: ApiGame; games: ApiGame[]; players: Players; max: number; now: number }) {
  const state = gameState(game, now);
  const sides = gameSides(game, players);
  return (
    <details className={`cal-game ${state}`} id={`g-${game.id}`}>
      <summary>
        <div className="info">
          <div className="time">
            {state === "live" ? <span className="lv">● Underway</span> : state === "final" ? <span className="fn">Final</span> : formatTime(game.kickoff_at)}
          </div>
          <div>
            <div className="bowl">{game.name}{game.fixed_wager !== null && ` · worth ${game.fixed_wager}`}</div>
            {sides.map((s, i) => (
              <div key={s.slot.id} className={`team ${s.status}`}>
                <SideSwatch team={s.slot.team} b={!!i} />
                <span>{slotName(s.slot, games)}{s.status === "won" && " ✓"}</span>
                <small>{s.rows.length} picks</small>
              </div>
            ))}
          </div>
        </div>
        <div className="cells">
          {players.map((p) => {
            const pick = p.picks.find((k) => k.game_id === game.id && k.slot_id !== null);
            const side = sides.findIndex((s) => s.slot.id === pick?.slot_id);
            if (!pick || side < 0) return <span key={p.display_name} className="cell none" title={p.display_name}><small>{initials(p.display_name)}</small>–</span>;
            const status = sides[side].status;
            const key = status === "lost" ? { className: "" } : sideKey(sides[side].slot.team, !!side);
            return (
              <span
                key={p.display_name}
                className={`cell ${side ? "b" : "a"} ${status}${p.is_me ? " mine" : ""} ${key.className}`}
                style={key.style}
                title={`${p.display_name}: ${slotName(sides[side].slot, games)}, ${pick.confidence}`}
              >
                <small>{initials(p.display_name)}</small>
                <b>{pick.confidence}</b>
              </span>
            );
          })}
        </div>
      </summary>
      <div className="lists">
        {sides.map((s, i) => (
          <div key={s.slot.id}>
            <h4><SideSwatch team={s.slot.team} b={!!i} />{slotName(s.slot, games)}</h4>
            <PickRows rows={s.rows} max={max} />
          </div>
        ))}
      </div>
    </details>
  );
}

/** The alternative Picks page: every game in kickoff order by day, with everyone's pick in a row of cells. */
export function CalendarView({ year }: { year: number }) {
  const games = useQuery({ queryKey: ["games", year], queryFn: () => fetchGames(year) });
  const picks = useQuery({ queryKey: ["picks", year], queryFn: () => fetchPicks(year) });
  const standings = useQuery({ queryKey: ["standings", year], queryFn: () => fetchStandings(year) });
  const error = (!games.data && games.error) || (!picks.data && picks.error);
  if (error) return <PanelError error={error} />;
  if (!games.data || !picks.data) return <Skeleton lines={5} />;
  if (!picks.data.players.length) return <p>Nobody made picks this season.</p>;
  const players = inStandingsOrder(picks.data.players, standings.data?.standings ?? []);
  const now = Date.now();
  const days = byDay(games.data.games);
  const teams = games.data.playoff?.teams ?? [];
  const max = maxPoints(players);
  return (
    <div className="cal" style={{ "--n": players.length } as CSSProperties}>
      <nav className="strip" aria-label="Days">
        {days.map(({ key, games: gs }) => {
          const done = gs.every((g) => gameState(g, now) === "final");
          const live = gs.some((g) => gameState(g, now) === "live");
          return (
            <a key={key} href={`#d-${key}`} className={done ? "done" : live ? "today" : undefined}>
              <small>{formatWeekday(gs[0].kickoff_at)}</small>
              {new Date(gs[0].kickoff_at).getDate()}
              <i>{done ? "✓ final" : live ? "● live" : `${gs.length} ${gs.length === 1 ? "game" : "games"}`}</i>
            </a>
          );
        })}
        {teams.length > 0 && <a className="po" href="#cal-playoff"><small>Playoff</small>🏆</a>}
      </nav>
      <div className="phead" aria-hidden>
        <span>Columns in standings order</span>
        {players.map((p) => <span key={p.display_name} className={p.is_me ? "mine" : undefined}>{p.display_name}</span>)}
      </div>
      {days.map(({ key, games: gs }) => (
        <section key={key} className="day" id={`d-${key}`}>
          <h3>{formatDay(gs[0].kickoff_at)}</h3>
          {gs.map((g) => <GameRow key={g.id} game={g} games={games.data.games} players={players} max={max} now={now} />)}
        </section>
      ))}
      {teams.length > 0 && (
        <section className="day" id="cal-playoff">
          <h3>Playoff rankings</h3>
          <PlayoffSummary year={year} teams={teams} games={games.data.playoff?.games ?? []} players={players} />
        </section>
      )}
    </div>
  );
}
