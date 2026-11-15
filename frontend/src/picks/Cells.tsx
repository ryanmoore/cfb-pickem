import type { ReactNode } from "react";
import type { Game, Slot } from "./model";

// Without onPick the chip is a plain span (read-only rows and the dimmed rows in the spotlight).
function Chip({ slot, on, onPick }: { slot: Slot; on: boolean; onPick?: () => void }) {
  const Tag = onPick ? "button" : "span";
  return (
    <Tag
      className={"chip" + (on ? " on" : "")}
      title={slot.label}
      {...(onPick && {
        "aria-pressed": on,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onPick();
        },
      })}
    >
      <span className="nm">{slot.label}</span>
      {slot.record && <span className="rec">{slot.record}</span>}
    </Tag>
  );
}

/**
 * The row both lists share: points, the bowl (and its line when there is one)
 * as a title with a chevron when the row opens the spotlight, and the team
 * chips beneath. A ranked row is exactly `ROW` tall including its gap, so the
 * page list and the spotlight's list line up.
 */
export function Cells({ game, pts, pick, onPick, open, end }: {
  game: Game;
  pts: number;
  pick?: number;
  onPick?: (slotId: number) => void;
  open?: boolean;
  end?: ReactNode;
}) {
  const unpicked = pick === undefined;
  return (
    <>
      <span className={"rk" + (unpicked ? " un" : "")} aria-label={`${pts} points${unpicked ? ", no pick yet" : ""}`}>
        {pts}
        <i>pts</i>
      </span>
      <div className="mu">
        <div className="hd">
          <div className="tt">
            <b className="bt">{game.name}</b>
            {game.line && <span className="ml">{game.line}</span>}
          </div>
          {end ?? (
            <span className="chev" aria-hidden>
              {open && "›"}
            </span>
          )}
        </div>
        <div className="mt">
          {game.badge && <span className="badge">{game.badge}</span>}
          {game.slots.map((s) => (
            <Chip key={s.id} slot={s} on={pick === s.id} onPick={onPick && (() => onPick(s.id))} />
          ))}
        </div>
      </div>
    </>
  );
}

/** What the card does not already show: kickoff and each side's rank and record. */
export function Details({ game }: { game: Game }) {
  if (game.details) return <>{game.details}</>;
  const kickoff = new Date(game.kickoffAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <>
      <div className="teams">
        {game.slots.map((s) => (
          <div key={s.id} className="tinfo">
            <div>{s.label}</div>
            {s.record && <small>Record {s.record}</small>}
          </div>
        ))}
      </div>
      <p className="meta">{kickoff}</p>
    </>
  );
}
