import { useState } from "react";
import { earned, gameLabel, resolve, simulate, teamLabel, winCounts, type BGame, type Field, type Ref } from "./bracket";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The playoff laid out by round: columns swiped on a phone, side by side on a desktop. */
export function Bracket({ field: f, order }: { field: Field; order: number[] }) {
  const [winners, setWinners] = useState<Record<string, number>>();
  const rank = (seed: number) => order.length - order.indexOf(seed);
  const wins = winners && winCounts(winners);

  const slot = (g: BGame, ref: Ref) => {
    const seed = resolve(ref, winners ?? {});
    if (seed === undefined) {
      const feeder = f.games.find((x) => "winner" in ref && x.id === ref.winner)!;
      return <div className="bslot tbd">winner of {gameLabel(f, feeder)}</div>;
    }
    const won = winners?.[g.id] === seed;
    const w = wins?.get(seed) ?? 0;
    return (
      <div className={"bslot" + (won ? " won" : "") + (winners && !won ? " lost" : "")}>
        <b>{won && "✓ "}{teamLabel(f, seed)}</b>
        <small>
          {g.round > 0 && "team" in ref && f.games.some((x) => x.round === 0) ? "bye · " : ""}
          {winners ? `rank ${rank(seed)} · ${w} win${w === 1 ? "" : "s"} · ${fmt(earned(f.size, rank(seed), w))} pts` : `your rank: ${rank(seed)}`}
        </small>
      </div>
    );
  };

  const scored = wins && [...wins].map(([seed, w]) => ({ seed, w, pts: earned(f.size, rank(seed), w) })).sort((a, b) => b.pts - a.pts);
  return (
    <div className="bracketwrap">
      <label className="sim">
        <input type="checkbox" checked={!!winners} onChange={(e) => setWinners(e.target.checked ? simulate(f) : undefined)} /> Simulate results
        {winners && (
          <button className="ghost" onClick={() => setWinners(simulate(f))}>
            Re-roll
          </button>
        )}
      </label>
      <div className="bracket" data-testid="bracket">
        {f.rounds.map((name, r) => (
          <section key={name} className="bcol" aria-label={name}>
            <h3>{name}</h3>
            <div className="bgames">
              {f.games
                .filter((g) => g.round === r)
                .map((g) => (
                  <div key={g.id} className="bgame">
                    {g.bowl && <small className="bowl">{g.bowl}</small>}
                    {slot(g, g.a)}
                    {slot(g, g.b)}
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
      {scored && (
        <div className="scored">
          <h3>Your points</h3>
          {scored.map(({ seed, w, pts }) => (
            <p key={seed}>
              {teamLabel(f, seed)}: {rank(seed)} × {w} × 12/{f.size} = <b>{fmt(pts)}</b>
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
