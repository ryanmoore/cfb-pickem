import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchProgress, type Progress } from "./api";
import { EveryonesPicks } from "./picks/EveryonesPicks";
import { PanelError, SeasonPage, Skeleton, useSeason } from "./ui";

/** Time left as the two largest units, or "Locked" once it has passed. */
export function timeLeft(ms: number) {
  if (ms <= 0) return "Locked";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** The lock deadline and how long is left; `more` adds a link to the Picks tab. */
export function Deadline({ locksAt, more }: { locksAt: string; more?: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const at = new Date(locksAt);
  return (
    <div className="deadline">
      <span aria-hidden>⏰</span>
      <div>
        <b>Picks lock {at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</b>
        <small>
          {at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          {more && (
            <>
              {" · "}
              <a href={"/picks" + location.search}>See who's done</a>
            </>
          )}
        </small>
      </div>
      <div className="tick">
        {timeLeft(+at - now)}
        <small>to go</small>
      </div>
    </div>
  );
}

// Share of the strip before the end zone, and the least the ball is drawn in from the left edge.
const FIELD = 86;
const MIN_BALL = 4;

/** A player is in the end zone with every bowl picked and, where the playoff is ranked, that ranking made. */
const finished = (p: Progress) => p.picked >= p.total && p.playoff_ranked !== false;

function Drive({ p }: { p: Progress }) {
  const x = p.total ? (p.picked / p.total) * FIELD : FIELD;
  return (
    <li className="drive">
      <div className="nm">
        {p.display_name}
        <small>{p.picked < p.total ? `${p.picked} of ${p.total} picked` : "Playoff still to rank"}</small>
      </div>
      <div className={"field" + (p.picked ? "" : " zero")} aria-hidden>
        <span className="trail" style={{ width: `${x}%` }} />
        <span className="ez" />
        <span className="ball" style={{ left: `${Math.max(x, MIN_BALL)}%` }} />
        {!p.picked && <span className="cnt">Hasn't started</span>}
      </div>
    </li>
  );
}

/** How far each player has got: a drive down the field while picking, a chip once done. */
function PickProgress({ year }: { year: number }) {
  const { data, error } = useQuery({ queryKey: ["progress", year], queryFn: () => fetchProgress(year) });
  if (error) return <PanelError error={error} />;
  if (!data) return <Skeleton lines={4} />;
  const done = data.filter(finished);
  const driving = data.filter((p) => !finished(p)).sort((a, b) => a.picked - b.picked);
  return (
    <>
      {driving.length > 0 && (
        <>
          <h3 className="groupt">Still driving <span className="pill">{driving.length} {driving.length === 1 ? "player" : "players"}</span></h3>
          <ul className="drives">
            {driving.map((p) => <Drive key={p.display_name} p={p} />)}
          </ul>
        </>
      )}
      {done.length > 0 && (
        <>
          <h3 className="groupt">In the end zone <span className="pill">{done.length} of {data.length}</span></h3>
          <ul className="allin">
            {done.map((p) => <li key={p.display_name}>{p.display_name}</li>)}
          </ul>
        </>
      )}
    </>
  );
}

function Season({ year }: { year: number }) {
  const { seasons } = useSeason();
  const season = seasons?.find((s) => s.year === year);
  if (!season) return <Skeleton lines={4} />;
  return (
    <section>
      {season.locked ? (
        <EveryonesPicks year={year} />
      ) : (
        <div className="panel">
          <Deadline locksAt={season.locks_at} />
          <PickProgress year={year} />
        </div>
      )}
    </section>
  );
}

/** The Picks tab: pick progress until the season locks, then everyone's picks. */
export function PicksPage() {
  return (
    <>
      <h2 className="label">Picks</h2>
      <SeasonPage>{(year) => <Season year={year} />}</SeasonPage>
    </>
  );
}
