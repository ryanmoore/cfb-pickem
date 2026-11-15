import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSeasons } from "./api";

export function Skeleton({ lines = 1 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

export function PanelError({ error }: { error: Error }) {
  return (
    <p role="alert" className="error">
      {error.message}
    </p>
  );
}

export const useSeasons = () => useQuery({ queryKey: ["seasons"], queryFn: fetchSeasons });

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

/** The season picker over a page of per-season panels; defaults to the newest season. */
export function SeasonPage({ children }: { children: (year: number) => ReactNode }) {
  const [param, setParam] = useSeasonParam();
  const { data: seasons, error } = useSeasons();
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
        children(year)
      ) : seasons ? (
        <p>No seasons yet.</p>
      ) : (
        !error && <Skeleton lines={6} />
      )}
    </>
  );
}

/** Points as shown: whole numbers plain, fractions to two places. */
export const fmt = (n: number) => String(+n.toFixed(2));
