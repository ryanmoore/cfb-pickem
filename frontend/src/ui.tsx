import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSeasons, type Season } from "./api";

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

const SeasonContext = createContext<{
  year: number | null;
  setYear: (year: number) => void;
  seasons?: Season[];
  error: Error | null;
}>({ year: null, setYear: () => {}, error: null });

export const useSeason = () => useContext(SeasonContext);

/** The chosen season, from `?season=` and defaulting to the newest; shared by the header pill and the page. */
export function SeasonProvider({ children }: { children: ReactNode }) {
  const [param, setParam] = useState(() => new URLSearchParams(location.search).get("season"));
  const { data: seasons, error } = useSeasons();
  const requested = param && /^\d+$/.test(param) ? Number(param) : null;
  const year = seasons ? (seasons.some((s) => s.year === requested) ? requested! : (seasons[0]?.year ?? null)) : requested;
  const setYear = (y: number) => {
    history.replaceState(null, "", `?season=${y}`);
    setParam(String(y));
  };
  return <SeasonContext value={{ year, setYear, seasons, error }}>{children}</SeasonContext>;
}

/** The season switcher shown in the header. */
export function SeasonPill() {
  const { year, setYear, seasons } = useSeason();
  if (!seasons) return <div className="skeleton skeleton-pill" aria-busy="true" />;
  if (!seasons.length) return null;
  return (
    <label className="season">
      <span className="sr-only">Season</span>
      <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))}>
        {seasons.map((s) => (
          <option key={s.year} value={s.year}>
            {s.practice ? `${s.year} · Practice` : s.year}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A page of per-season panels for the chosen season. */
export function SeasonPage({ children }: { children: (year: number) => ReactNode }) {
  const { year, seasons, error } = useSeason();
  if (year != null) return children(year);
  if (error) return <PanelError error={error} />;
  return seasons ? <p>No seasons yet.</p> : <Skeleton lines={6} />;
}

/** Points as shown: whole numbers plain, fractions to two places. */
export const fmt = (n: number) => String(+n.toFixed(2));
