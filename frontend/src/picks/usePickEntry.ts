import { useEffect, useRef, useState } from "react";
import { putPicks, type PickRow } from "../api";
import { freshEntry, fromRows, moved, reconcile, sameRows, toRows, type Entry, type Game } from "./model";
import { createSaveQueue, type Status } from "./saveQueue";

/** Picks the server has not acknowledged, and the server version they were made from. */
type Local = { entry: Entry; base: string | null };

export const STALE_NOTICE = "Your picks were changed on another device — showing the latest";

const parseLocal = (text: string | null): Local | undefined => {
  try {
    const local = JSON.parse(text ?? "");
    return local?.entry ? local : undefined;
  } catch {
    return undefined;
  }
};

const writeLocal = (key: string, entry: Entry, base: string | null) => {
  try {
    localStorage.setItem(key, JSON.stringify({ entry, base }));
  } catch {
    /* storage full or unavailable: the server copy still works */
  }
};

/**
 * Where to start: the device's copy if it holds changes the server never
 * acknowledged and was made from the server's current picks, else the
 * server's copy (a different base means another device saved since), else a
 * fresh random order. `send` says the server needs the result.
 */
function start(key: string, games: Game[], server: PickRow[], version: string | null) {
  const local = parseLocal(localStorage.getItem(key));
  const stale = !!local && local.base !== version;
  if (local && !stale) return { entry: reconcile(games, local.entry), send: true, stale };
  const entry = server.length ? fromRows(games, server) : freshEntry(games);
  return { entry, send: !sameRows(toRows(games, entry), server), stale };
}

/**
 * A player's entry, saved on every change: to this device at once, and to the
 * server through a queue that retries until it gets through. The device's
 * copy exists only while the server lacks it.
 */
export function usePickEntry(year: number, name: string, games: Game[], server: PickRow[], version: string | null) {
  const key = `pickem:picks:${year}:${name}`;
  const [init] = useState(() => start(key, games, server, version));
  const [entry, setEntry] = useState(init.entry);
  const [status, setStatus] = useState<Status>({ kind: init.send ? "saving" : "saved" });
  const [notice, setNotice] = useState(init.stale ? STALE_NOTICE : undefined);
  const current = useRef(entry);
  const base = useRef(version);
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const queue = useRef<ReturnType<typeof createSaveQueue>>(undefined);

  const adopt = (e: Entry) => {
    current.current = e;
    setEntry(e);
  };

  useEffect(() => {
    const q = createSaveQueue({
      send: (rows, keepalive) => putPicks(year, rows, base.current, keepalive),
      onStatus: setStatus,
      onAccepted: (v, isCurrent) => {
        base.current = v;
        if (isCurrent) localStorage.removeItem(key);
        else writeLocal(key, current.current, v);
      },
      onConflict: (c) => {
        base.current = c.version;
        localStorage.removeItem(key);
        adopt(fromRows(gamesRef.current, c.picks));
        setNotice(STALE_NOTICE);
      },
    });
    queue.current = q;
    const online = () => q.retryNow();
    const hidden = () => document.visibilityState === "hidden" && q.flush();
    // Another tab changed this entry: show its copy, which it will send.
    const otherTab = (ev: StorageEvent) => {
      const local = ev.key === key ? parseLocal(ev.newValue) : undefined;
      if (!local) return;
      q.drop();
      base.current = local.base;
      adopt(reconcile(gamesRef.current, local.entry));
    };
    addEventListener("online", online);
    addEventListener("pagehide", q.flush);
    addEventListener("storage", otherTab);
    document.addEventListener("visibilitychange", hidden);
    if (init.stale) localStorage.removeItem(key);
    if (init.send) {
      writeLocal(key, current.current, base.current);
      q.change(toRows(games, current.current));
      void q.sendNow();
    }
    return () => {
      removeEventListener("online", online);
      removeEventListener("pagehide", q.flush);
      removeEventListener("storage", otherTab);
      document.removeEventListener("visibilitychange", hidden);
      q.dispose();
    };
  }, []);

  const update = (f: (e: Entry) => Entry) => {
    const next = f(current.current);
    adopt(next);
    setNotice(undefined);
    writeLocal(key, next, base.current);
    queue.current?.change(toRows(games, next));
  };

  // The season's games changed under an open page: fit the entry to them.
  useEffect(() => {
    const next = reconcile(games, current.current);
    if (JSON.stringify(next) !== JSON.stringify(current.current)) update(() => next);
  }, [games]);

  return {
    entry,
    status,
    notice,
    /** Choose a side of a game; choosing the same side again clears it. */
    setWinner: (gameId: number, slotId: number) =>
      update((e) => {
        const winners = { ...e.winners, [gameId]: slotId };
        if (e.winners[gameId] === slotId) delete winners[gameId];
        return { ...e, winners };
      }),
    move: (gameId: number, idx: number) => update((e) => ({ ...e, order: moved(e.order, gameId, idx) })),
    reset: () => update(() => freshEntry(games)),
  };
}
