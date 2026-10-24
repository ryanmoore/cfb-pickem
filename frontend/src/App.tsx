import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe, fetchSeasons, fetchStandings } from "./api";

function Skeleton({ lines = 1 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

function PanelError({ error }: { error: Error }) {
  return (
    <p role="alert" className="error">
      {error.message}
    </p>
  );
}

function MeStatus() {
  const { data: me, error } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  if (error) return <PanelError error={error} />;
  if (!me) return <div className="skeleton skeleton-inline" aria-busy="true" />;
  if (!me.signed_in) return <a href="/login">Sign in</a>;
  if (!me.known)
    return <span>Signed in, but this email isn't linked to a player yet</span>;
  return <span>Signed in as {me.display_name}</span>;
}

function useSeasonParam() {
  const [param, setParam] = useState(() =>
    new URLSearchParams(location.search).get("season"),
  );
  const set = (year: number) => {
    history.replaceState(null, "", `?season=${year}`);
    setParam(String(year));
  };
  return [param, set] as const;
}

function Standings({ year }: { year: number }) {
  const { data, error } = useQuery({
    queryKey: ["standings", year],
    queryFn: () => fetchStandings(year),
  });
  if (error) return <PanelError error={error} />;
  if (!data) return <Skeleton lines={6} />;
  if (data.length === 0) return <p>No standings for {year} yet.</p>;
  const showMax = data.some((s) => s.remaining > 0);
  return (
    <table>
      <caption className="sr-only">{year} standings</caption>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Player</th>
          <th scope="col" className="num">Points</th>
          {showMax && <th scope="col" className="num">Max possible</th>}
        </tr>
      </thead>
      <tbody>
        {data.map((s) => (
          <tr key={s.display_name}>
            <td>{s.rank}</td>
            <th scope="row">{s.display_name}</th>
            <td className="num">{s.scored}</td>
            {showMax && <td className="num">{s.max_possible}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeasonStandings() {
  const [param, setParam] = useSeasonParam();
  const { data: seasons, error } = useQuery({
    queryKey: ["seasons"],
    queryFn: fetchSeasons,
  });
  const requested = param && /^\d+$/.test(param) ? Number(param) : null;
  const year = seasons
    ? seasons.some((s) => s.year === requested)
      ? requested!
      : seasons[0]?.year
    : requested;

  let picker;
  if (error) picker = <PanelError error={error} />;
  else if (!seasons) picker = <div className="skeleton skeleton-inline" aria-busy="true" />;
  else
    picker = (
      <select
        id="season"
        value={year ?? ""}
        onChange={(e) => setParam(Number(e.target.value))}
      >
        {seasons.map((s) => (
          <option key={s.year} value={s.year}>
            {s.year}
          </option>
        ))}
      </select>
    );

  return (
    <>
      <div className="picker">
        <label htmlFor="season">Season</label>
        {picker}
      </div>
      {year != null ? (
        <Standings year={year} />
      ) : seasons ? (
        <p>No seasons yet.</p>
      ) : (
        !error && <Skeleton lines={6} />
      )}
    </>
  );
}

export function App() {
  return (
    <>
      <header>
        <h1>Bowl Pick'em</h1>
        <div className="me">
          <MeStatus />
        </div>
      </header>
      <main>
        <h2>Standings</h2>
        <SeasonStandings />
      </main>
    </>
  );
}
