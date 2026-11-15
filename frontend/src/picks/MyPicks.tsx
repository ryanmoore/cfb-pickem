import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGames, fetchMe, fetchPicks, type PicksDoc } from "../api";
import { PanelError, SeasonPage, Skeleton } from "../ui";
import { PickEntry } from "./PickEntry";
import { PickList } from "./PickList";
import { PickTabs, showTab, tabInUrl, type Tab } from "./PickTabs";
import { PlayoffRanking } from "./PlayoffRanking";
import { toField, type Field } from "./bracket";
import { fromDoc, toGames, type Game } from "./model";
import "./picks.css";

/** The player's own picks as the open view lays them out, read-only and with results where decided. */
function LockedPicks({ games, field, teams, doc }: { games: Game[]; field?: Field; teams: number[]; doc: PicksDoc }) {
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const [tab, setTab] = useState<Tab>(tabInUrl);
  if (!doc.picks.length && !doc.playoff.length) return <p>You made no picks this season.</p>;
  const entry = fromDoc(games, teams, doc);
  const decided = games.filter((g) => g.winner !== undefined).length;
  return (
    <div className="picks">
      <div className="head">
        {field && (
          <PickTabs
            tab={tab}
            onChoose={(t) => {
              showTab(t);
              setTab(t);
            }}
            labels={{ bowls: "Bowls", playoff: "Playoff" }}
          />
        )}
        <p className="lockbanner" role="status">
          🔒 Picks are locked{decided > 0 && ` · ${decided} of ${games.length} games decided`}
        </p>
      </div>
      {field && tab === "playoff" ? <PlayoffRanking field={field} ranking={entry.ranking} /> : <PickList games={games} byId={byId} entry={entry} />}
    </div>
  );
}

function SeasonPicks({ year, name }: { year: number; name: string }) {
  const games = useQuery({ queryKey: ["games", year], queryFn: () => fetchGames(year) });
  // Not cached after it unmounts: the entry starts from this response, so a
  // stale copy would hide picks saved since.
  const picks = useQuery({ queryKey: ["picks", year], queryFn: () => fetchPicks(year), gcTime: 0 });
  // A failed refetch must not replace what is already showing.
  const error = (!games.data && games.error) || (!picks.data && picks.error);
  const list = useMemo(() => games.data && toGames(games.data.games), [games.data]);
  const field = useMemo(() => games.data?.playoff && toField(games.data.playoff), [games.data]);
  const teams = useMemo(() => (field ? [...field.teams.keys()] : []), [field]);
  if (error) return <PanelError error={error} />;
  if (!list || !picks.data) return <Skeleton lines={8} />;
  const mine = picks.data.players.find((p) => p.is_me);
  const doc: PicksDoc = { picks: mine?.picks ?? [], playoff: mine?.playoff ?? [], playoff_done: picks.data.playoff_done };
  return picks.data.locked ? (
    <LockedPicks games={list} field={field} teams={teams} doc={doc} />
  ) : (
    <PickEntry key={`${year}:${name}`} year={year} name={name} games={list} field={field} teams={teams} server={doc} version={picks.data.version} />
  );
}

function SignedInPicks({ year }: { year: number }) {
  const { data: me, error } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  if (error) return <PanelError error={error} />;
  if (!me) return <Skeleton lines={8} />;
  if (!me.signed_in)
    return (
      <p>
        <a href="/login">Sign in</a> to make your picks.
      </p>
    );
  if (!me.known) return <p>You're signed in, but you're not on the player list for this pool.</p>;
  return <SeasonPicks year={year} name={me.display_name} />;
}

export function MyPicks() {
  return (
    <div className="narrow">
      <h2 className="label">My picks</h2>
      <SeasonPage>{(year) => <SignedInPicks year={year} />}</SeasonPage>
    </div>
  );
}
