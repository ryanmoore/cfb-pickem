import type { ReactNode } from "react";
import { Swatch } from "../ui";
import { pairLooks, type Look } from "../teamLook";
import { formatKickoff } from "./kickoff";
import type { Game, Slot } from "./model";

type Result = "won" | "lost";

const colors = (l: Look) => ({ "--tc": l.bg, "--tf": l.ink }) as React.CSSProperties;

// Without onPick the chip is a plain span (read-only rows and the dimmed rows in the spotlight).
// A team's color fills the chip (`tc`), or with `lite` only marks its left edge (`sw`) so a result's shading stays readable.
function Chip({ slot, look, lite, on, result, onPick }: { slot: Slot; look: Look | null; lite?: boolean; on: boolean; result?: Result; onPick?: () => void }) {
  const Tag = onPick ? "button" : "span";
  const sub = [slot.look?.mascot, slot.record].filter(Boolean).join(" · ");
  return (
    <Tag
      className={"chip" + (on ? " on" : "") + (on && result ? " " + result : "") + (look ? (lite ? " sw" : " tc") + (look.edge ? " edge" : "") : "")}
      style={look ? colors(look) : undefined}
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
      {sub && <span className="rec">{sub}</span>}
    </Tag>
  );
}

/**
 * The row both lists share: points, the bowl (and its line when there is one)
 * as a title with a chevron when the row opens the spotlight, and the team
 * chips beneath. A ranked row is exactly `ROW` tall including its gap, so the
 * page list and the spotlight's list line up.
 */
export function Cells({ game, pts, pick, onPick, open, end, lite }: {
  game: Game;
  pts: number;
  pick?: number;
  onPick?: (slotId: number) => void;
  open?: boolean;
  end?: ReactNode;
  lite?: boolean;
}) {
  // A row with no sides (a team in a ranking) has nothing to pick.
  const result: Result | undefined = pick !== undefined && game.winner !== undefined ? (pick === game.winner ? "won" : "lost") : undefined;
  const looks = pairLooks(game.slots.length ? game.slots.map((s) => s.look) : [game.look]);
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
            <b className="bt">
              {game.slots.length === 0 && <Swatch look={looks[0]} />}
              {game.name}
              {game.look?.mascot && <span className="mc"> {game.look.mascot}</span>}
            </b>
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
          {game.slots.map((s, i) => (
            <Chip key={s.id} slot={s} look={looks[i]} lite={lite} on={pick === s.id} result={result} onPick={onPick && (() => onPick(s.id))} />
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
