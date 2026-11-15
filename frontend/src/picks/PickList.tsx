import { Cells } from "./Cells";
import type { Entry, Game } from "./model";

export type Flash = { id: number; n: number; cancel: boolean };

/**
 * The player's games: playoff games at their fixed points, then the ranked
 * games best-first. Without `onPick` and `onOpen` the list is read-only.
 */
export function PickList({ games, byId, entry, flash, onPick, onOpen }: {
  games: Game[];
  byId: Map<number, Game>;
  entry: Entry;
  flash?: Flash;
  onPick?: (gameId: number, slotId: number) => void;
  onOpen?: (gameId: number) => void;
}) {
  const fixed = games.filter((g) => g.fixedWager !== null);
  // The overlay is re-keyed per flash so a second one restarts its CSS animation.
  const hl = (id: number) => flash?.id === id && <span key={flash.n} className={"hl" + (flash.cancel ? " cancel" : "")} aria-hidden />;
  const pick = (id: number) => onPick && ((slotId: number) => onPick(id, slotId));
  return (
    <>
      {fixed.length > 0 && (
        <>
          <h2>Playoff</h2>
          <div className="list">
            {fixed.map((g) => (
              <div key={g.id} id={"g-" + g.id} className="row">
                {hl(g.id)}
                <Cells game={g} pts={g.fixedWager!} pick={entry.winners[g.id]} onPick={pick(g.id)} />
              </div>
            ))}
          </div>
        </>
      )}
      <h2>Ranked games · {entry.order.length} to 1 pts</h2>
      <div className="list">
        {entry.order.map((id, k) => (
          <div key={id} id={"g-" + id} className={"row" + (onOpen ? " tap" : "")} onClick={onOpen && (() => onOpen(id))}>
            {hl(id)}
            <Cells game={byId.get(id)!} pts={entry.order.length - k} pick={entry.winners[id]} onPick={pick(id)} open={!!onOpen} />
          </div>
        ))}
      </div>
    </>
  );
}
