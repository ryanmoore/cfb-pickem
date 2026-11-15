import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { fetchGames, fetchPicks, type ApiGame, type ApiSlot, type PicksResponse } from "../api";
import { PanelError, Skeleton } from "../ui";
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
          {r.team !== undefined && <span className="tn">{r.team}</span>}
          {r.points !== null && (
            <b className={`pt ${r.status}`} style={{ "--t": r.points / max } as CSSProperties}>{r.points}</b>
          )}
        </li>
      ))}
    </ul>
  );
}

const teamName = (s: ApiSlot) => (s.team ? s.team.name : "To be decided");

function GameCard({ game, players, max }: { game: ApiGame; players: Players; max: number }) {
  const rows = game.slots.flatMap((s) =>
    players.flatMap((p) => {
      const pick = p.picks.find((k) => k.game_id === game.id && k.slot_id === s.id);
      const status: Status = game.winner_slot_id === null ? "open" : game.winner_slot_id === s.id ? "won" : "lost";
      return pick ? [{ name: p.display_name, me: p.is_me, points: pick.confidence, team: teamName(s), status }] : [];
    }),
  );
  return (
    <article className="gc">
      <header>
        <b>{game.name}</b>
        {game.fixed_wager !== null && <small>worth {game.fixed_wager}</small>}
      </header>
      <p className="when">{formatKickoff(game.kickoff_at)}</p>
      <p className="vs">
        {game.slots.map((s) => (
          <span key={s.id} className={game.winner_slot_id === s.id ? "won" : undefined}>
            {s.team?.rank ? `#${s.team.rank} ` : ""}{teamName(s)}
          </span>
        ))}
      </p>
      <PickRows rows={rows} max={max} />
    </article>
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
      <p className="note">
        {players.length} players, one row per pick with the points riding on it.
        {done.length > 0 && <> <a href="#completed">Jump to {done.length} completed {done.length === 1 ? "game" : "games"}</a></>}
      </p>
      <ul className="legend" aria-hidden>
        <li><i className="pt won" />Won</li>
        <li><i className="pt lost" />Lost</li>
        <li><i className="pt open" />Still open</li>
        <li>Darker means more points</li>
      </ul>
      {cards("Bowl games", ranked)}
      {cards("Fixed-value games", fixed)}
      {teams.length > 0 && (
        <>
          <h3 className="groupt">Playoff rankings <span className="pill">{teams.length} teams</span></h3>
          <div className="gcs teams">
            {teams.map((t) => {
              const rows = players.flatMap((p) => {
                const r = p.playoff.find((k) => k.team_season_id === t.team_season_id);
                const status: Status = t.eliminated ? "lost" : "open";
                return r ? [{ name: p.display_name, me: p.is_me, points: r.rank, status }] : [];
              });
              return (
                <article key={t.team_season_id} className={"gc" + (t.eliminated ? " out" : "")}>
                  <header>
                    <b>{t.seed ? `#${t.seed} ` : ""}{t.name}</b>
                    <small>{t.wins} {t.wins === 1 ? "win" : "wins"}{t.eliminated && " · out"}</small>
                  </header>
                  <PickRows rows={rows} max={teams.length} />
                </article>
              );
            })}
          </div>
        </>
      )}
      {cards("Completed games", done, "completed")}
    </>
  );
}
