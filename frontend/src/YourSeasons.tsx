import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe, type History } from "./api";
import { fmt, Skeleton } from "./ui";

type Player = History["players"][number];
type Result = Player["results"][number];

export function ordinal(n: number) {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10;
  return `${n}${["th", "st", "nd", "rd"][tail] ?? "th"}`;
}

const place = (r: Result) => `${ordinal(r.rank)} of ${r.field}`;
const share = (r: Result) => (r.winner > 0 ? Math.round((r.points / r.winner) * 100) : 100);
/** 0 for a win, approaching 1 for last: the chart's height read upside down. */
const depth = (r: Result) => (r.rank - 1) / r.field;
const describe = (r: Result) => `${r.year}: ${place(r)}, ${fmt(r.points)} pts, ${share(r)}% of the winner's ${fmt(r.winner)}`;

function tone(r: Result) {
  if (r.rank <= 3) return `m${r.rank}`;
  return r.rank === r.field ? "coal" : "";
}

/** Best first: finish position within the field, then share of the winner's score. */
const byFinish = (a: Result, b: Result) => depth(a) - depth(b) || share(b) - share(a);

function Chart({ years, results }: { years: number[]; results: Result[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const byYear = new Map(results.map((r) => [r.year, r]));
  const shown = byYear.get(picked ?? -1) ?? [...results].sort(byFinish)[0];
  return (
    <>
      <div className="yc">
        <div className="yc-axis" aria-hidden>
          <span>1st</span>
          <span>last</span>
        </div>
        <ol className="yc-cols">
          {years.map((y) => {
            const r = byYear.get(y);
            return (
              <li key={y}>
                {r ? (
                  <button
                    type="button"
                    className={`yc-col${r === shown ? " on" : ""}`}
                    aria-label={describe(r)}
                    aria-pressed={r === shown}
                    onClick={() => setPicked(y)}
                    onMouseEnter={() => setPicked(y)}
                  >
                    <span className="yc-track">
                      <i className={`yc-bar ${tone(r)}`} style={{ height: `${((r.field - r.rank + 1) / r.field) * 100}%` }} />
                    </span>
                    <b>{ordinal(r.rank)}</b>
                    <small>{y}</small>
                  </button>
                ) : (
                  <span className="yc-col gap">
                    <span className="yc-track" />
                    <b>–</b>
                    <small>{y}</small>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="yc-detail" aria-live="polite">
        <b>{shown.year}</b> · {place(shown)} · {fmt(shown.points)} pts · {share(shown)}% of the winner's score
      </p>
    </>
  );
}

function Stats({ results }: { results: Result[] }) {
  const sorted = [...results].sort(byFinish);
  const [best, worst] = [sorted[0], sorted[sorted.length - 1]];
  const avg = results.reduce((n, r) => n + r.rank, 0) / results.length;
  const stats: [string, string][] = [
    ["Best season", `${best.year} · ${place(best)}`],
    ["Worst season", `${worst.year} · ${place(worst)}`],
    ["Average rank", avg.toFixed(1)],
    ["Seasons played", String(results.length)],
  ];
  return (
    <dl className="yc-stats">
      {stats.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Defaults to the signed-in player, else the medal-table leader. */
export function YourSeasons({ data }: { data: History }) {
  const { data: me, isPending } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const [choice, setChoice] = useState<string | null>(null);
  const names = data.players.map((p) => p.name);
  const mine = me?.signed_in && me.known ? me.display_name : null;
  const name = [choice, mine, data.medals[0]?.name].find((n) => n && names.includes(n)) ?? names[0];
  const player = data.players.find((p) => p.name === name)!;
  const years = data.seasons.map((s) => s.year).reverse();
  return (
    <section className="panel yc-panel">
      <h3>Your seasons</h3>
      <p className="note">Taller is better: a win reaches the top. Gold, silver and bronze mark the podium; coal marks last place.</p>
      {isPending ? (
        <Skeleton lines={3} />
      ) : (
        <>
          <label className="season yc-pick">
            <span className="sr-only">Player</span>
            <select value={name} onChange={(e) => setChoice(e.target.value)}>
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <Chart key={name} years={years} results={player.results} />
          <Stats results={player.results} />
        </>
      )}
    </section>
  );
}
