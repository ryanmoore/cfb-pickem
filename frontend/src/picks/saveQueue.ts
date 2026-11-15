import type { PickRow, SaveResult } from "../api";

export type Status =
  | { kind: "saved" | "saving" | "offline" | "locked" }
  | { kind: "rejected"; message: string };

const BACKOFF_MS = [1000, 2000, 5000, 15000, 30000];

/**
 * Sends the latest set of picks, one request at a time. A change waits out a
 * quiet period so a burst becomes one request; a change made while a request
 * is in flight is sent as soon as that request ends. A failed send backs off
 * and tries again with whatever is latest by then, until the server accepts
 * it, the season locks, or the server refuses the set.
 */
export function createSaveQueue(o: {
  send: (rows: PickRow[]) => Promise<SaveResult>;
  onStatus: (s: Status) => void;
  /** Called when the server holds exactly the latest set. */
  onSaved: () => void;
}) {
  let latest: PickRow[] | undefined;
  let version = 0;
  let inFlight = false;
  let failures = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = (s: Status) => {
    stopped = true;
    o.onStatus(s);
  };

  async function sendNow() {
    clearTimeout(timer);
    if (stopped || inFlight || !latest) return;
    inFlight = true;
    const sent = version;
    const result = await o.send(latest);
    inFlight = false;
    if (stopped) return;
    if (result.kind === "ok") {
      failures = 0;
      if (version !== sent) return sendNow();
      o.onStatus({ kind: "saved" });
      o.onSaved();
    } else if (result.kind === "retry") {
      o.onStatus({ kind: "offline" });
      timer = setTimeout(sendNow, BACKOFF_MS[Math.min(failures++, BACKOFF_MS.length - 1)]);
    } else if (result.kind === "locked") {
      stop({ kind: "locked" });
    } else {
      stop(result);
    }
  }

  return {
    change(rows: PickRow[]) {
      if (stopped) return;
      latest = rows;
      version++;
      if (failures === 0) {
        o.onStatus({ kind: "saving" });
        if (!inFlight) {
          clearTimeout(timer);
          timer = setTimeout(sendNow, 800);
        }
      }
    },
    sendNow,
    /** The connection is back: do not wait out the backoff. */
    retryNow() {
      if (failures > 0) void sendNow();
    },
    dispose() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
