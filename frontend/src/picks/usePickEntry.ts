import { useEffect, useRef, useState } from "react";
import { putPicks, type PickRow } from "../api";
import { freshEntry, fits, fromRows, moved, sameRows, toRows, type Entry, type Game } from "./model";
import { createSaveQueue, type Status } from "./saveQueue";

type Local = { entry: Entry; dirty: boolean };

const readLocal = (key: string): Local | undefined => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "");
  } catch {
    return undefined;
  }
};

const writeLocal = (key: string, entry: Entry, dirty: boolean) => {
  try {
    localStorage.setItem(key, JSON.stringify({ entry, dirty }));
  } catch {
    /* storage full or unavailable: the server copy still works */
  }
};

/**
 * Where to start: the device's copy if it holds changes the server never
 * acknowledged, else the server's copy, else this device's older copy, else a
 * fresh random order. `send` says the server needs the result.
 */
function start(key: string, games: Game[], server: PickRow[]) {
  const local = readLocal(key);
  const usable = local?.entry && fits(games, local.entry) ? local : undefined;
  const entry = usable?.dirty
    ? usable.entry
    : server.length
      ? fromRows(games, server)
      : (usable?.entry ?? freshEntry(games));
  return { entry, send: !!usable?.dirty || !sameRows(toRows(games, entry), server) };
}

/**
 * A player's entry, saved on every change: to this device at once, and to the
 * server through a queue that retries until it gets through.
 */
export function usePickEntry(year: number, name: string, games: Game[], server: PickRow[]) {
  const key = `pickem:picks:${year}:${name}`;
  const [init] = useState(() => start(key, games, server));
  const [entry, setEntry] = useState(init.entry);
  const [status, setStatus] = useState<Status>({ kind: init.send ? "saving" : "saved" });
  const current = useRef(entry);
  const queue = useRef<ReturnType<typeof createSaveQueue>>(undefined);

  useEffect(() => {
    const q = createSaveQueue({
      send: (rows) => putPicks(year, rows),
      onStatus: setStatus,
      onSaved: () => writeLocal(key, current.current, false),
    });
    queue.current = q;
    const online = () => q.retryNow();
    addEventListener("online", online);
    if (init.send) {
      writeLocal(key, current.current, true);
      q.change(toRows(games, current.current));
      void q.sendNow();
    }
    return () => {
      removeEventListener("online", online);
      q.dispose();
    };
  }, []);

  const update = (f: (e: Entry) => Entry) => {
    const next = f(current.current);
    current.current = next;
    setEntry(next);
    writeLocal(key, next, true);
    queue.current?.change(toRows(games, next));
  };

  return {
    entry,
    status,
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
