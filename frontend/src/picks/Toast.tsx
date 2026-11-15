import { useEffect } from "react";

/** A brief notice fixed to the viewport, gone after a few seconds or on tap. */
export function Toast({ text, raised, onDone }: { text: string; raised: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <div className={"toast" + (raised ? " raised" : "")} role="status" aria-live="polite" onClick={onDone}>
      {text}
    </div>
  );
}
