import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Flash } from "./PickList";

/**
 * Opening and closing the spotlight over a ranked list whose rows have id
 * "g-<id>": the page scroll, the flash on the row it lands in, and the history
 * entry that makes the back button cancel. `move` puts an id at an index.
 */
export function useSpotlightFlow(order: number[], move: (id: number, idx: number) => void) {
  const [spot, setSpot] = useState<number>();
  const [closing, setClosing] = useState(false);
  const [flash, setFlash] = useState<Flash>();
  const origin = useRef(0);
  const keep = useRef(false);
  const pushed = useRef(false);
  const from = useRef<DOMRect>(undefined!);
  const cancelled = useRef(false);

  // Going back would otherwise restore the scroll position from before the
  // spotlight opened, after the scroll to the game's row has already run.
  useEffect(() => {
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = "auto";
    };
  }, []);

  // Scroll the page to a game and flash it.
  const show = (id: number, cancel = false) => setFlash((f) => ({ id, n: (f?.n ?? 0) + 1, cancel }));
  useLayoutEffect(() => {
    if (flash) document.getElementById("g-" + flash.id)?.scrollIntoView({ block: "center" });
  }, [flash]);

  const open = (id: number) => {
    origin.current = order.indexOf(id);
    from.current = document.getElementById("g-" + id)!.getBoundingClientRect();
    setSpot(id);
  };
  // The page scrolls to the game's final row while the spotlight still covers
  // it; the spotlight then collapses into that row and the flash plays.
  useLayoutEffect(() => {
    if (closing) document.getElementById("g-" + spot)?.scrollIntoView({ block: "center" });
  }, [closing]);
  const closed = () => {
    setSpot(undefined);
    setClosing(false);
    show(spot!, cancelled.current);
  };
  // The spotlight owns one history entry, so the back button cancels it; the
  // buttons close it by going back too, and the popstate handler does the work.
  const close = (done: boolean) => {
    keep.current = done;
    history.back();
  };
  useEffect(() => {
    if (spot === undefined) return;
    if (!pushed.current) {
      history.pushState({ spot: true }, "");
      pushed.current = true;
    }
    const onPop = () => {
      pushed.current = false;
      const done = keep.current;
      if (!done) move(spot, origin.current);
      keep.current = false;
      cancelled.current = !done;
      setClosing(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [spot]);

  return { spot, closing, flash, from: from.current, open, close, closed, show };
}
