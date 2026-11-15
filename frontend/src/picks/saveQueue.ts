import type { PicksDoc, SaveResult } from "../api";

export type Status =
  | { kind: "saved" | "saving" | "offline" | "locked" | "signedout" }
  | { kind: "rejected"; message: string };

export type Conflict = Extract<SaveResult, { kind: "conflict" }>;

const BACKOFF_MS = [1000, 2000, 5000, 15000, 30000];

/**
 * Sends the latest set of picks, one request at a time. A change waits out a
 * quiet period so a burst becomes one request; a change made while a request
 * is in flight is sent as soon as that request ends. A failed send backs off
 * and tries again with whatever is latest by then, until the server accepts
 * it, the season locks, the player is signed out, or the server refuses the
 * set. A set based on a stale server copy is not sent again: the queue hands
 * over the server's copy and goes quiet until the next change.
 */
export function createSaveQueue(o: {
  send: (doc: PicksDoc, keepalive: boolean) => Promise<SaveResult>;
  onStatus: (s: Status) => void;
  /** The server took a set and now has this version; `current` when it is the latest set. */
  onAccepted: (version: string, current: boolean) => void;
  onConflict: (c: Conflict) => void;
}) {
  let latest: PicksDoc = { picks: [], playoff: [] };
  let dirty = false;
  let version = 0;
  let inFlight = false;
  let failures = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = (s: Status) => {
    stopped = true;
    o.onStatus(s);
  };

  async function sendNow(keepalive = false) {
    clearTimeout(timer);
    if (stopped || inFlight || !dirty) return;
    inFlight = true;
    const sent = version;
    const result = await o.send(latest, keepalive);
    inFlight = false;
    if (stopped) return;
    if (result.kind === "ok") {
      failures = 0;
      const current = version === sent;
      o.onAccepted(result.version, current);
      if (!current) return sendNow();
      dirty = false;
      o.onStatus({ kind: "saved" });
    } else if (result.kind === "conflict") {
      failures = 0;
      dirty = false;
      o.onStatus({ kind: "saved" });
      o.onConflict(result);
    } else if (result.kind === "signedout") {
      stop({ kind: "signedout" });
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
    change(doc: PicksDoc) {
      if (stopped) return;
      latest = doc;
      dirty = true;
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
    /** Forget the unsent set, because the caller replaced it with a newer one. */
    drop() {
      clearTimeout(timer);
      dirty = false;
      failures = 0;
      o.onStatus({ kind: "saved" });
    },
    /** The page is going away: send what is unsent now, in a request that outlives it. */
    flush() {
      void sendNow(true);
    },
    dispose() {
      void sendNow(true);
      stopped = true;
      clearTimeout(timer);
    },
  };
}
