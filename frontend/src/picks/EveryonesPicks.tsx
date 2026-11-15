import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { fetchGames, fetchPicks, type ApiGame, type ApiSlot, type ApiTeam, type PicksResponse } from "../api";
import { fmt, PanelError, Skeleton } from "../ui";
import { formatKickoff } from "./kickoff";

type Players = PicksResponse["players"];
type Status = "won" | "lost" | "open";
type Row = { name: string; me: boolean; points: number | null; team?: string; status: Status };

/** Highest points first, then by name. */
const byPoints = (a: Row, b: Row) => (b.points ?? 0) - (a.points ?? 0) || a.name.localeCompare(b.name);

/** One player per row, with the points shaded by how many of the section's most they stake. */
function PickRows({ rows, max }: { rows: Row[]; max: number }) {
  if (!rows.length) return <p className="nobody">Nobody</p>;
  return (
    <ul className="pr">
      {rows.sort(byPoints).map((r) => (
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

const teamName = (s: ApiSlot) => (s.team ? s.team.name : "To be decided");

/** A game as two columns, one per team, each listing the players who picked it. */
function GameCard({ game, players, max }: { game: ApiGame; players: Players; max: number }) {
  return (
    <article className="gc">
      <header>
        <b>{game.name}</b>
        {game.fixed_wager !== null && <small>worth {game.fixed_wager}</small>}
      </header>
      <p className="when">{formatKickoff(game.kickoff_at)}</p>
      <div className="sides">
        {game.slots.map((s) => {
          const status: Status = game.winner_slot_id === null ? "open" : game.winner_slot_id === s.id ? "won" : "lost";
          const rows = players.flatMap((p) => {
            const pick = p.picks.find((k) => k.game_id === game.id && k.slot_id === s.id);
            return pick ? [{ name: p.display_name, me: p.is_me, points: pick.confidence, status }] : [];
          });
          return (
            <div key={s.id}>
              <h4 className={status === "won" ? "won" : undefined}>
                {s.team?.rank ? `#${s.team.rank} ` : ""}{teamName(s)}
              </h4>
              <PickRows rows={rows} max={max} />
            </div>
          );
        })}
      </div>
    </article>
  );
}

/**
 * One playoff team: where it stands, the average rank players gave it and the
 * range of ranks as a bar (dot at the average). Opens to the per-player list.
 */
function TeamSummary({ team: t, rows, size }: { team: ApiTeam; rows: Row[]; size: number }) {
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
          <small>{t.eliminated ? "Eliminated" : "Alive"} · {t.wins} {t.wins === 1 ? "win" : "wins"}</small>
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

/** Every player's picks once the season has locked: a card per game listing each player's pick, open games first. */
export function EveryonesPicks({ year }: { year: number }) {
  const games = useQuery({ queryKey: ["games", year], queryFn: () => fetchGames(year) });
  const picks = useQuery({ queryKey: ["picks", year], queryFn: () => fetchPicks(year) });
  const error = (!games.data && games.error) || (!picks.data && picks.error);
  if (error) return <PanelError error={error} />;
  if (!games.data || !picks.data) return <Skeleton lines={5} />;
  const { players } = picks.data;
  if (!players.length) return <p>Nobody made picks this season.</p>;
  const open = games.data.games.filter((g) => g.winner_slot_id === null);
  const done = games.data.games.filter((g) => g.winner_slot_id !== null);
  const ranked = open.filter((g) => g.fixed_wager === null);
  const fixed = open.filter((g) => g.fixed_wager !== null);
  const teams = games.data.playoff?.teams ?? [];
  const max = Math.max(1, ...players.flatMap((p) => p.picks.map((k) => k.confidence ?? 0)));
  const cards = (title: string, list: ApiGame[], id?: string) =>
    list.length > 0 && (
      <>
        <h3 className="groupt" id={id}>{title} <span className="pill">{list.length}</span></h3>
        <div className="gcs">
          {list.map((g) => <GameCard key={g.id} game={g} players={players} max={max} />)}
        </div>
      </>
    );
  return (
    <>
      <nav className="onpage" aria-label="On this page">
        {open.length > 0 && <a href="#open">Open games</a>}
        {teams.length > 0 && <a href="#playoff">Playoff rankings</a>}
        {done.length > 0 && <a href="#completed">Completed ({done.length})</a>}
      </nav>
      <ul className="legend" aria-hidden>
        <li><i className="pt won" />Won</li>
        <li><i className="pt lost" />Lost</li>
        <li><i className="pt open" />Still open</li>
        <li>Darker means more points</li>
      </ul>
      {cards("Bowl games", ranked, "open")}
      {cards("Fixed-value games", fixed, ranked.length ? undefined : "open")}
      {teams.length > 0 && (
        <>
          <h3 className="groupt" id="playoff">Playoff rankings <span className="pill">{teams.length} teams</span></h3>
          <div className="tsum">
            {teams.map((t) => {
              const rows = players.flatMap((p) => {
                const r = p.playoff.find((k) => k.team_season_id === t.team_season_id);
                return r ? [{ name: p.display_name, me: p.is_me, points: r.rank, status: (t.eliminated ? "lost" : "open") as Status }] : [];
              });
              return <TeamSummary key={t.team_season_id} team={t} rows={rows} size={teams.length} />;
            })}
          </div>
        </>
      )}
      {cards("Completed games", done, "completed")}
    </>
  );
}
