import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe, fetchStandings } from "./api";
import { Deadline } from "./Progress";
import { fmt, PanelError, SeasonPage, Skeleton, useSeason } from "./ui";

type Sort = "total" | "reach";

function StandingsList({ year }: { year: number }) {
  const [sort, setSort] = useState<Sort>("total");
  const [detail, setDetail] = useState(() => localStorage.getItem("standings-breakdown") === "1");
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
  const rows = sort === "reach"
    ? [...standings].sort((a, b) => b.max_possible - a.max_possible || b.total - a.total)
    : standings;
  const mine = me?.signed_in && me.known ? me.display_name : null;
  const hasPlayoff = standings.some((s) => s.playoff > 0 || s.remaining_playoff > 0);
  const showDetail = hasPlayoff && detail;
  const pct = (n: number) => `${(n / scale) * 100}%`;
  const head = (key: Sort, label: string) => (
    <th aria-sort={sort === key ? "descending" : undefined}>
      <button type="button" onClick={() => setSort(key)}>{label}{sort === key && " ▾"}</button>
    </th>
  );
  return (
    <>
      <div className="legend-row">
        <ul className="legend" aria-hidden>
          {showDetail ? (
            <>
              <li><i className="bw" />Bowls won</li>
              <li><i className="bl" />Bowls pending</li>
              <li><i className="pw" />Playoff won</li>
              <li><i className="pl" />Playoff pending</li>
            </>
          ) : (
            <>
              <li><i className="bw" />Won</li>
              <li><i className="bl" />Still possible</li>
            </>
          )}
        </ul>
        {hasPlayoff && (
          <label className="breakdown">
            <input
              type="checkbox"
              checked={detail}
              onChange={(e) => {
                setDetail(e.target.checked);
                localStorage.setItem("standings-breakdown", e.target.checked ? "1" : "0");
              }}
            />
            Show breakdown
          </label>
        )}
      </div>
      <table className={`stt${split ? " split" : ""}`} aria-label={`${year} standings`}>
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            {split && <th className="opt">Bowls</th>}
            {split && <th className="opt">Playoff</th>}
            {head("total", "Total")}
            {head("reach", "Could reach")}
            <th className="bar-h"><span className="sr-only">Points</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const you = s.display_name === mine;
            return (
              <tr key={s.display_name} className={`r${s.rank}${you ? " me-row" : ""}`}>
                <td><span className="rank">{s.rank}</span></td>
                <td className="who">
                  {s.display_name}
                  {you && <small>You</small>}
                  {split && <small className="bp">bowls {fmt(s.bowls)} · playoff {fmt(s.playoff)}</small>}
                </td>
                {split && <td className="num opt">{fmt(s.bowls)}</td>}
                {split && <td className="num opt">{fmt(s.playoff)}</td>}
                <td className="num tot">{fmt(s.total)}</td>
                <td className="num">{fmt(s.max_possible)}</td>
                <td className="barc">
                  <div className="split-bar">
                    {showDetail ? (
                      <>
                        <i className="bw" style={{ width: pct(s.bowls) }} />
                        <i className="bl" style={{ width: pct(s.remaining_bowls) }} />
                        <i className="pw" style={{ width: pct(s.playoff) }} />
                        <i className="pl" style={{ width: pct(s.remaining_playoff) }} />
                      </>
                    ) : (
                      <>
                        <i className="bw" style={{ width: pct(s.total) }} />
                        <i className="bl" style={{ width: pct(s.max_possible - s.total) }} />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
