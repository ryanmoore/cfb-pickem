import type { ReactNode } from "react";
import { formatKickoff } from "./kickoff";
import type { Game, Slot } from "./model";

type Result = "won" | "lost";

// Without onPick the chip is a plain span (read-only rows and the dimmed rows in the spotlight).
function Chip({ slot, on, result, onPick }: { slot: Slot; on: boolean; result?: Result; onPick?: () => void }) {
  const Tag = onPick ? "button" : "span";
  return (
    <Tag
      className={"chip" + (on ? " on" : "") + (on && result ? " " + result : "")}
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
  // A row with no sides (a team in a ranking) has nothing to pick.
  const result: Result | undefined = pick !== undefined && game.winner !== undefined ? (pick === game.winner ? "won" : "lost") : undefined;
  const unpicked = pick === undefined && game.slots.length > 0;
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
            {(game.kickoffAt || game.line) && (
              <span className="ml">{[game.kickoffAt && formatKickoff(game.kickoffAt), game.line].filter(Boolean).join(" · ")}</span>
            )}
          </div>
          {end ??
            (result ? (
              <span className={"res " + result}>{result === "won" ? "✓ Won" : "✗ Lost"}</span>
            ) : (
              <span className="chev" aria-hidden>
                {open && "›"}
              </span>
            ))}
        </div>
        <div className="mt">
          {game.badge && <span className="badge">{game.badge}</span>}
          {game.slots.map((s) => (
            <Chip key={s.id} slot={s} on={pick === s.id} result={result} onPick={onPick && (() => onPick(s.id))} />
          ))}
        </div>
      </div>
    </>
  );
}

/** What the card does not already show: kickoff and each side's rank and record. */
export function Details({ game }: { game: Game }) {
  if (game.details) return <>{game.details}</>;
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
      <p className="meta">{formatKickoff(game.kickoffAt)}</p>
    </>
  );
}
