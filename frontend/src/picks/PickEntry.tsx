import { useCallback, useMemo, useRef, useState } from "react";
import type { PickRow } from "../api";
import { CoachMarks, HINT_MAIN, HINT_SPOT } from "./CoachMarks";
import { PickList } from "./PickList";
import { ROW, Spotlight } from "./Spotlight";
import type { Game } from "./model";
import { usePickEntry } from "./usePickEntry";
import { useSpotlightFlow } from "./useSpotlightFlow";
import type { Status } from "./saveQueue";
import "./picks.css";

const STATUS_TEXT: Record<Status["kind"], string> = {
  saved: "Saved ✓",
  saving: "Saving…",
  offline: "Offline — kept on this device, will send",
  locked: "Locked",
  rejected: "Not saved",
  signedout: "Signed out — sign in to send your picks",
};

type Props = { year: number; name: string; games: Game[]; server: PickRow[]; version: string | null };

export function PickEntry({ year, name, games, server, version }: Props) {
  const { entry, status, notice, setWinner, move, reset } = usePickEntry(year, name, games, server, version);
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const [coach, setCoach] = useState(() => !localStorage.getItem(HINT_MAIN));
  const closeCoach = useCallback(() => {
    localStorage.setItem(HINT_MAIN, "1");
    setCoach(false);
  }, []);
  const jumped = useRef(-1);
  const { spot, closing, flash, from, open, close, closed, show } = useSpotlightFlow(entry.order, move);

  const all = [...games.filter((g) => g.fixedWager !== null).map((g) => g.id), ...entry.order];
  const total = all.length;
  const unpicked = all.filter((id) => entry.winners[id] === undefined);
  const nextUnpicked = () => {
    for (let k = 1; k <= total; k++) {
      const j = (jumped.current + k) % total;
      if (entry.winners[all[j]] === undefined) {
        jumped.current = j;
        show(all[j]);
        return;
      }
    }
  };

  const locked = status.kind === "locked";
  // Once the queue stops, nothing more is sent, so nothing more can be edited.
  const frozen = locked || status.kind === "rejected" || status.kind === "signedout";
  return (
    <div className="picks" style={{ "--row": ROW + "px" } as React.CSSProperties}>
      <div className="head">
        <div className="status">
          <button className="ghost jump" disabled={!unpicked.length || frozen} onClick={nextUnpicked}>
            {unpicked.length ? `picked ${total - unpicked.length}/${total} · next ›` : `picked ${total}/${total} ✓`}
          </button>
          <span className={"saved " + status.kind} role="status">
            {STATUS_TEXT[status.kind]}
          </span>
          {status.kind === "signedout" && <a href="/login">Sign in</a>}
          {!frozen && (
            <button
              className="ghost helpbtn"
              aria-label="Help"
              onClick={() => {
                localStorage.removeItem(HINT_SPOT);
                setCoach(true);
              }}
            >
              ?
            </button>
          )}
        </div>
      </div>
      {locked && <p role="alert" className="error">Picks are now locked. Changes made since the lock were not saved.</p>}
      {status.kind === "rejected" && (
        <p role="alert" className="error">
          The server did not accept these picks ({status.message}). They are kept on this device.
        </p>
      )}
      {frozen && !locked && <p role="alert" className="error">New changes are not being sent. Reload the page to continue.</p>}
      {notice && <p role="status" className="how">{notice}</p>}
      {!frozen && <p className="how">Pick every game, then rank them: the top game is worth {entry.order.length} pts.</p>}

      <PickList
        games={games}
        byId={byId}
        entry={entry}
        flash={flash}
        onPick={frozen ? undefined : setWinner}
        onOpen={frozen ? undefined : open}
      />
      {!frozen && (
        <button
          className="danger"
          onClick={() => {
            if (confirm("Reshuffle and clear all picks?")) reset();
          }}
        >
          Reset all picks
        </button>
      )}

      {spot !== undefined && !frozen && (
        <Spotlight
          key={spot}
          entry={entry}
          games={byId}
          id={spot}
          from={from}
          closing={closing}
          onClosed={closed}
          setWinner={setWinner}
          move={(idx) => move(spot, idx)}
          active={!closing}
          onDone={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
      {coach && spot === undefined && !frozen && <CoachMarks onClose={closeCoach} />}
    </div>
  );
}
