import { useQuery } from "@tanstack/react-query";
import { fetchProgress, fetchStandings } from "./api";
import { fmt, PanelError, SeasonPage, Skeleton, useSeasons } from "./ui";

function StandingsTable({ year }: { year: number }) {
  const { data, error } = useQuery({
    queryKey: ["standings", year],
    queryFn: () => fetchStandings(year),
  });
  if (error) return <PanelError error={error} />;
  if (!data) return <Skeleton lines={6} />;
  const { standings, playoff_ranked: split } = data;
  if (standings.length === 0) return <p>No standings for {year} yet.</p>;
  const showMax = standings.some((s) => s.remaining > 0);
  return (
    <table>
      <caption className="sr-only">{year} standings</caption>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Player</th>
          {split && <th scope="col" className="num">Bowls</th>}
          {split && <th scope="col" className="num">Playoff</th>}
          <th scope="col" className="num">{split ? "Total" : "Points"}</th>
          {showMax && <th scope="col" className="num">Max possible</th>}
        </tr>
      </thead>
      <tbody>
        {standings.map((s) => (
          <tr key={s.display_name}>
            <td>{s.rank}</td>
            <th scope="row">{s.display_name}</th>
            {split && <td className="num">{fmt(s.bowls)}</td>}
            {split && <td className="num">{fmt(s.playoff)}</td>}
            <td className="num">{fmt(s.total)}</td>
            {showMax && <td className="num">{fmt(s.max_possible)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** How far each player has got, before the season locks; no picks are shown. */
function Progress({ year }: { year: number }) {
  const { data, error } = useQuery({
    queryKey: ["progress", year],
    queryFn: () => fetchProgress(year),
  });
  return (
    <section>
      <h2>Who's done</h2>
      {error ? (
        <PanelError error={error} />
      ) : !data ? (
        <Skeleton lines={3} />
      ) : (
        <ul className="progress">
          {data.map((p) => (
            <li key={p.display_name}>
              <span>{p.display_name}</span>
              <span className="num">
                picked {p.picked} of {p.total}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Season({ year }: { year: number }) {
  const { data: seasons } = useSeasons();
  const open = seasons?.some((s) => s.year === year && !s.locked);
  return (
    <>
      <StandingsTable year={year} />
      {open && <Progress year={year} />}
    </>
  );
}

export function Standings() {
  return (
    <>
      <h2>Standings</h2>
      <SeasonPage>{(year) => <Season year={year} />}</SeasonPage>
    </>
  );
}
