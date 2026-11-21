import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSeasons, type Season } from "./api";
import { fillOf, markerOf } from "./teamLook";
import type { TeamLook } from "./api";

/** The team's two color bands, the wider its primary; nothing for a team with no color. */
export function Marker({ team }: { team?: TeamLook | null }) {
  const c = markerOf(team);
  return c && <i className="duo" style={{ "--c1": c[0], "--c2": c[1] } as React.CSSProperties} />;
}

/** `children` as a label that truncates with an ellipsis, filled in the team's colors (text and accent band per `fillOf`) when it has any. */
export function TeamTag({ team, children }: { team?: TeamLook | null; children: ReactNode }) {
  const f = fillOf(team);
  return (
    <span
      className={"tn" + (f ? " tc" : "") + (f?.edge ? " edge" : "")}
      style={f ? ({ "--tc": f.bg, "--tf": f.ink, "--ta": f.accent ?? f.bg } as React.CSSProperties) : undefined}
    >
      {children}
    </span>
  );
}

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
  /** The season the player chose, which links carry to other tabs; null until they choose one. */
  chosen: number | null;
  setYear: (year: number) => void;
  seasons?: Season[];
  error: Error | null;
}>({ year: null, chosen: null, setYear: () => {}, error: null });

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
  const chosen = year === requested ? requested : null;
  return <SeasonContext value={{ year, chosen, setYear, seasons, error }}>{children}</SeasonContext>;
}

/** A link to `path` for the chosen season; without a choice the page defaults to the newest. */
export const seasonHref = (path: string, chosen: number | null) => (chosen === null ? path : `${path}?season=${chosen}`);

const seasonLabel = (s: Season) => [s.year, s.practice && "Practice", s.draft && "Draft"].filter(Boolean).join(" · ");

/**
 * The season switcher shown in the header. The pill shows the current label
 * itself, so it is as wide as that and not the longest option; the native
 * select lies transparent over it to keep the platform picker.
 */
export function SeasonPill() {
  const { year, setYear, seasons } = useSeason();
  if (!seasons) return <div className="skeleton skeleton-pill" aria-busy="true" />;
  if (!seasons.length) return null;
  const current = seasons.find((s) => s.year === year);
  return (
    <label className="season fit">
      <span className="sr-only">Season</span>
      <span className="val" aria-hidden>
        {current && seasonLabel(current)}
      </span>
      <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))}>
        {seasons.map((s) => (
          <option key={s.year} value={s.year}>
            {seasonLabel(s)}
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
