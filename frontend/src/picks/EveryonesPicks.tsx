import { useQuery } from "@tanstack/react-query";
import { fetchGames, fetchPicks, type ApiGame, type PicksResponse } from "../api";
import { PanelError, Skeleton } from "../ui";

type Players = PicksResponse["players"];
type Chip = { name: string; me: boolean; points: number | null };

/** Highest points first, then by name. */
const byPoints = (a: Chip, b: Chip) => (b.points ?? 0) - (a.points ?? 0) || a.name.localeCompare(b.name);

function Chips({ chips }: { chips: Chip[] }) {
  if (!chips.length) return <p className="nobody">Nobody</p>;
  return (
    <ul className="chips">
      {chips.sort(byPoints).map((c) => (
        <li key={c.name} className={"pk" + (c.me ? " mine" : "")}>
          <span>{c.name}</span>
          {c.points !== null && <i>{c.points}</i>}
        </li>
      ))}
    </ul>
  );
}

function GameCard({ game, players }: { game: ApiGame; players: Players }) {
  const kickoff = new Date(game.kickoff_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <article className="gc">
      <header>
        <b>{game.name}</b>
        <small>
          {kickoff}
          {game.fixed_wager !== null && ` · worth ${game.fixed_wager}`}
        </small>
      </header>
      <div className="sides">
        {game.slots.map((s) => {
          const chips = players.flatMap((p) => {
            const pick = p.picks.find((k) => k.game_id === game.id && k.slot_id === s.id);
            return pick ? [{ name: p.display_name, me: p.is_me, points: pick.confidence }] : [];
          });
          const state = game.winner_slot_id === null ? "" : game.winner_slot_id === s.id ? " won" : " lost";
          return (
            <div key={s.id} className={"side" + state}>
              <div className="tm">
                {s.team ? `${s.team.rank ? `#${s.team.rank} ` : ""}${s.team.name}` : "To be decided"}
                {s.team?.record && <small>{s.team.record}</small>}
              </div>
              <Chips chips={chips} />
            </div>
          );
        })}
      </div>
    </article>
  );
}

/** Every player's picks once the season has locked: a card per game with each team's backers beneath it. */
export function EveryonesPicks({ year }: { year: number }) {
  const games = useQuery({ queryKey: ["games", year], queryFn: () => fetchGames(year) });
  const picks = useQuery({ queryKey: ["picks", year], queryFn: () => fetchPicks(year) });
  const error = (!games.data && games.error) || (!picks.data && picks.error);
  if (error) return <PanelError error={error} />;
  if (!games.data || !picks.data) return <Skeleton lines={5} />;
  const { players } = picks.data;
  if (!players.length) return <p>Nobody made picks this season.</p>;
  const ranked = games.data.games.filter((g) => g.fixed_wager === null);
  const fixed = games.data.games.filter((g) => g.fixed_wager !== null);
  const teams = games.data.playoff?.teams ?? [];
  return (
    <>
      <p className="note">
        {players.length} players. Each chip is a pick, with the points riding on it.
      </p>
      <h3 className="groupt">Bowl games <span className="pill">{ranked.length}</span></h3>
      <div className="gcs">
        {ranked.map((g) => <GameCard key={g.id} game={g} players={players} />)}
      </div>
      {fixed.length > 0 && (
        <>
          <h3 className="groupt">Fixed-value games <span className="pill">{fixed.length}</span></h3>
          <div className="gcs">
            {fixed.map((g) => <GameCard key={g.id} game={g} players={players} />)}
          </div>
        </>
      )}
      {teams.length > 0 && (
        <>
          <h3 className="groupt">Playoff rankings <span className="pill">{teams.length} teams</span></h3>
          <div className="gcs">
            {teams.map((t) => {
              const chips = players.flatMap((p) => {
                const r = p.playoff.find((k) => k.team_season_id === t.team_season_id);
                return r ? [{ name: p.display_name, me: p.is_me, points: r.rank }] : [];
              });
              return (
                <article key={t.team_season_id} className={"gc" + (t.eliminated ? " out" : "")}>
                  <header>
                    <b>{t.seed ? `#${t.seed} ` : ""}{t.name}</b>
                    <small>{t.wins} {t.wins === 1 ? "win" : "wins"}{t.eliminated && " · out"}</small>
                  </header>
                  <Chips chips={chips} />
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
