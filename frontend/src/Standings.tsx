import { useQuery } from "@tanstack/react-query";
import { fetchMe, fetchStandings } from "./api";
import { Deadline } from "./Progress";
import { fmt, PanelError, SeasonPage, Skeleton, useSeason } from "./ui";

function StandingsList({ year }: { year: number }) {
  const { data, error } = useQuery({
    queryKey: ["standings", year],
    queryFn: () => fetchStandings(year),
  });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  if (error) return <PanelError error={error} />;
  if (!data) return <Skeleton lines={6} />;
  const { standings, playoff_ranked: split } = data;
  if (standings.length === 0) return <p>No standings for {year} yet.</p>;
  const scale = Math.max(1, ...standings.map((s) => s.max_possible));
  const lead = standings[0].total;
  const mine = me?.signed_in && me.known ? me.display_name : null;
  return (
    <>
      <ul className="legend" aria-hidden>
        <li><i className="b" />{split ? "Bowl points" : "Points"}</li>
        {standings.some((s) => s.playoff > 0) && <li><i className="p" />Playoff points</li>}
        {standings.some((s) => s.remaining > 0) && <li><i className="h" />Still up for grabs (max possible)</li>}
      </ul>
      <ol className="st" aria-label={`${year} standings`}>
        {standings.map((s) => {
          const you = s.display_name === mine;
          return (
            <li key={s.display_name} className={`st-row r${s.rank}${you ? " me-row" : ""}`}>
              <span className="rank">{s.rank}</span>
              <div className="who">
                {s.display_name}
                <small>
                  {you && "You · "}
                  {s.rank === 1 ? "Leading" : `${fmt(lead - s.total)} back`}
                  {s.remaining > 0 && ` · could reach ${fmt(s.max_possible)}`}
                </small>
              </div>
              <div className="pts">
                {fmt(s.total)}
                {split && <small>bowl {fmt(s.bowls)} · playoff {fmt(s.playoff)}</small>}
              </div>
              {s.max_possible > 0 && (
                <div className="split" style={{ width: `${(s.max_possible / scale) * 100}%` }}>
                  <i className="b" style={{ width: `${(s.bowls / s.max_possible) * 100}%` }} />
                  <i className="p" style={{ width: `${(s.playoff / s.max_possible) * 100}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Season({ year }: { year: number }) {
  const { seasons } = useSeason();
  const open = seasons?.find((s) => s.year === year && !s.locked);
  return (
    <>
      {open && <Deadline locksAt={open.locks_at} more />}
      <StandingsList year={year} />
    </>
  );
}

export function Standings() {
  return (
    <>
      <h2 className="label">Standings</h2>
      <SeasonPage>{(year) => <Season year={year} />}</SeasonPage>
    </>
  );
}
