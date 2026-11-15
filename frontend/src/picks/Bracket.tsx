import { fmt } from "../ui";
import { formatKickoff } from "./kickoff";
import { earned, gameLabel, resolve, teamLabel, type BGame, type Field, type Ref } from "./bracket";

/**
 * The playoff laid out by round: columns swiped on a phone, side by side on a
 * desktop. It shows the player's rank for each team until results come in,
 * then the winners and the points each team has earned them.
 */
export function Bracket({ field: f, ranking }: { field: Field; ranking: number[] }) {
  const rank = (team: number) => ranking.length - ranking.indexOf(team);
  const decided = f.games.some((g) => g.winner !== undefined);
  const size = f.teams.size;

  const slot = (g: BGame, r: Ref) => {
    const team = resolve(f, r);
    if (team === undefined) {
      const feeder = f.games.find((x) => "winner" in r && x.id === r.winner)!;
      return <div className="bslot tbd">winner of {gameLabel(f, feeder)}</div>;
    }
    const won = g.winner === team;
    const { wins } = f.teams.get(team)!;
    return (
      <div className={"bslot" + (won ? " won" : "") + (g.winner !== undefined && !won ? " lost" : "")}>
        <b>{won && "✓ "}{teamLabel(f, team)}</b>
        <small>
          {g.round > 0 && "team" in r && f.games.some((x) => x.round === 0) ? "bye · " : ""}
          {decided ? `rank ${rank(team)} · ${wins} win${wins === 1 ? "" : "s"} · ${fmt(earned(size, rank(team), wins))} pts` : `your rank: ${rank(team)}`}
        </small>
      </div>
    );
  };

  const scored = [...f.teams.values()]
    .filter((t) => t.wins > 0)
    .map((t) => ({ t, pts: earned(size, rank(t.team_season_id), t.wins) }))
    .sort((a, b) => b.pts - a.pts);
  return (
    <div className="bracketwrap">
      <div className="bracket" data-testid="bracket">
        {f.rounds.map((name, r) => (
          <section key={name} className="bcol" aria-label={name}>
            <h3>{name}</h3>
            <div className="bgames">
              {f.games
                .filter((g) => g.round === r)
                .map((g) => (
                  <div key={g.id} className="bgame">
                    <small className="bowl">
                      {g.name && <b>{g.name}</b>}
                      <span>{formatKickoff(g.kickoffAt)}</span>
                    </small>
                    {slot(g, g.a)}
                    {slot(g, g.b)}
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
      {decided && (
        <div className="scored">
          <h3>Your points</h3>
          {scored.map(({ t, pts }) => (
            <p key={t.team_season_id}>
              {teamLabel(f, t.team_season_id)}: {rank(t.team_season_id)} × {t.wins} × 12/{size} = <b>{fmt(pts)}</b>
            </p>
          ))}
          <p className="total">
            Total <b>{fmt(scored.reduce((a, s) => a + s.pts, 0))}</b>
          </p>
        </div>
      )}
    </div>
  );
}
