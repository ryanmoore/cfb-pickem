import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHistory, type History as Data } from "./api";
import { fmt, PanelError, Skeleton } from "./ui";
import { YourSeasons } from "./YourSeasons";

const pts = (n: number) => `${fmt(n)} ${n === 1 ? "pt" : "pts"}`;
const join = (names: string[]) => names.join(" & ");

function Banners({ seasons }: { seasons: Data["seasons"] }) {
  return (
    <ul className="rafters">
      {seasons.map((s, i) => (
        <li key={s.year}>
          <a className={`banner b${i % 3}`} href={`/?season=${s.year}`}>
            <span className="cloth">
              <span className="yr">{s.year}</span>
              <span className="ch">{s.podium[0].names.map((n) => <span key={n}>{n}</span>)}</span>
              <small>{s.margin === null ? "Shared title" : `by ${pts(s.margin)}`}</small>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function MedalTable({ medals }: { medals: Data["medals"] }) {
  return (
    <table className="medals">
      <thead>
        <tr>
          <th>Player</th>
          <th><span className="disc g" role="img" aria-label="Gold" /></th>
          <th><span className="disc s" role="img" aria-label="Silver" /></th>
          <th><span className="disc bz" role="img" aria-label="Bronze" /></th>
        </tr>
      </thead>
      <tbody>
        {medals.map((m) => (
          <tr key={m.name}>
            <td>{m.name}</td>
            {[m.gold, m.silver, m.bronze].map((n, i) => (
              <td key={i} className={n ? "" : "z"}>{n}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Award({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="award">
      <b>{title}</b>
      {children}
    </div>
  );
}

function CoalClub({ data }: { data: Data }) {
  const { coal_club: club, seasons } = data;
  const margins = seasons.filter((s) => s.margin !== null);
  const closest = margins.reduce<(typeof margins)[number] | null>((a, s) => (!a || s.margin! < a.margin! ? s : a), null);
  const topCoal = club.filter((c) => c.coal > 0 && c.coal === club[0].coal);
  const bridesmaid = [...club].sort((a, b) => b.so_close - a.so_close)[0];
  return (
    <>
      <div className="awards">
        {topCoal.length > 0 && (
          <Award title="Keeper of the coal">
            {join(topCoal.map((c) => c.name))} · {topCoal[0].coal} last-place {topCoal[0].coal === 1 ? "finish" : "finishes"}
          </Award>
        )}
        {bridesmaid && bridesmaid.so_close > 0 && (
          <Award title="Always the bridesmaid">
            {bridesmaid.name} · {bridesmaid.so_close} second {bridesmaid.so_close === 1 ? "place" : "places"}
          </Award>
        )}
        {closest && (
          <Award title="Closest title race">
            {closest.year} · {join(closest.podium[0].names)} won by {pts(closest.margin!)}
          </Award>
        )}
      </div>
      <table className="medals">
        <thead>
          <tr>
            <th>Player</th>
            <th>Coal<br /><small>last</small></th>
            <th>So close<br /><small>2nd</small></th>
            <th>Avg rank<br /><small>lower is better</small></th>
          </tr>
        </thead>
        <tbody>
          {club.map((c) => (
            <tr key={c.name}>
              <td>{c.name}</td>
              <td className={c.coal ? "" : "z"}>
                {c.coal ? <span className="coals" role="img" aria-label={String(c.coal)}>{Array.from({ length: c.coal }, (_, i) => <span key={i} className="coal" />)}</span> : 0}
              </td>
              <td className={c.so_close ? "" : "z"}>{c.so_close}</td>
              <td>{c.avg_rank.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Archive({ seasons }: { seasons: Data["seasons"] }) {
  return (
    <ul className="archive">
      {seasons.map((s) => (
        <li key={s.year}>
          <b>{s.year}</b>
          <span>{s.players} players{s.last.length > 0 && ` · coal to ${join(s.last)}`}</span>
          <a href={`/?season=${s.year}`}>Standings</a>
          <a href={`/picks?season=${s.year}`}>Picks</a>
        </li>
      ))}
    </ul>
  );
}

export function History() {
  const { data, error } = useQuery({ queryKey: ["history"], queryFn: fetchHistory });
  const body = (() => {
    if (error) return <PanelError error={error} />;
    if (!data) return <Skeleton lines={6} />;
    if (data.seasons.length === 0) return <p>No finished seasons yet.</p>;
    const years = data.seasons.map((s) => s.year);
    return (
      <div className="hist">
        <section className="panel">
          <h3>🏆 Champions</h3>
          <p className="note">Newest first. Tap a banner for that season's standings.</p>
          <Banners seasons={data.seasons} />
        </section>
        <YourSeasons data={data} />
        <section className="panel">
          <h3>Medal table</h3>
          <p className="note">Top-three finishes, {Math.min(...years)}–{Math.max(...years)}. Golds first, then silvers, then bronzes; a tie shares its medal.</p>
          <MedalTable medals={data.medals} />
        </section>
        <section className="panel coalpanel">
          <h3><span className="coal" aria-hidden /> The Lump of Coal Club</h3>
          <p className="note">Santa keeps a list too. Last place earns a lump of coal; second place is noted with love.</p>
          <CoalClub data={data} />
        </section>
        <section className="panel coalpanel">
          <h3>Past seasons</h3>
          <Archive seasons={data.seasons} />
        </section>
      </div>
    );
  })();
  return (
    <>
      <h2 className="label">History</h2>
      {body}
    </>
  );
}
