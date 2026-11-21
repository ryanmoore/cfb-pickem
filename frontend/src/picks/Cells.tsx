import type { ReactNode } from "react";
import { fillOf, markerOf } from "../teamLook";
import { Marker } from "../ui";
import { formatKickoff } from "./kickoff";
import type { Game, Slot } from "./model";

type Result = "won" | "lost";

// Every chip carries the team's two-tone marker on its leading edge. A chosen side is also filled in the team's
// colors (`tc`); with `lite` nothing is filled, so a result's shading stays readable. Once the game has a pick,
// the other side goes quiet (`off`).
function Chip({ slot, lite, on, off, result, onPick }: { slot: Slot; lite?: boolean; on: boolean; off: boolean; result?: Result; onPick?: () => void }) {
  const Tag = onPick ? "button" : "span";
  const sub = [slot.look?.mascot, slot.record].filter(Boolean).join(" · ");
  const fill = on && !lite ? fillOf(slot.look) : null;
  return (
    <Tag
      className={"chip" + (markerOf(slot.look) ? " mk" : "") + (on ? " on" : "") + (on && result ? " " + result : "") + (off && !lite ? " off" : "") + (fill ? " tc" + (fill.edge ? " edge" : "") : "")}
      style={fill ? ({ "--tc": fill.bg, "--tf": fill.ink } as React.CSSProperties) : undefined}
      title={slot.label}
      {...(onPick && {
        "aria-pressed": on,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onPick();
        },
      })}
    >
      <Marker team={slot.look} size="lead" />
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
  const unpicked = pick === undefined && game.slots.length > 0;
  return (
    <>
      <span className={"rk" + (unpicked ? " un" : "")} aria-label={`${pts} points${unpicked ? ", no pick yet" : ""}`}>
        {pts}
        <i>pts</i>
      </span>
      <div className="mu">
        <div className="hd">
          {game.slots.length === 0 && <Marker team={game.look} size="lg" />}
          <div className="tt">
            <b className="bt">
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
          {game.slots.map((s) => (
            <Chip key={s.id} slot={s} lite={lite} on={pick === s.id} off={pick !== undefined && pick !== s.id} result={result} onPick={onPick && (() => onPick(s.id))} />
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
