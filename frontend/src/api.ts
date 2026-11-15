export type Season = { year: number; locked: boolean; locks_at: string };

export type Standing = {
  rank: number;
  display_name: string;
  bowls: number;
  playoff: number;
  total: number;
  remaining: number;
  max_possible: number;
};

export type Me =
  | { signed_in: false }
  | { signed_in: true; known: false }
  | { signed_in: true; known: true; display_name: string; is_admin: boolean };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const fetchMe = () => get<Me>("/api/me");
export const fetchSeasons = () =>
  get<{ seasons: Season[] }>("/api/seasons").then((r) => r.seasons);
export const fetchStandings = (year: number) =>
  get<{ standings: Standing[]; playoff_ranked: boolean }>(`/api/seasons/${year}/standings`);

export type ApiSlot = {
  id: number;
  team_season_id: number | null;
  team: { name: string; rank: number | null; record: string | null } | null;
  winner_of: number | null;
  seed: number | null;
};

export type ApiGame = {
  id: number;
  name: string;
  kickoff_at: string;
  fixed_wager: number | null;
  slots: ApiSlot[];
  winner_slot_id: number | null;
  /** Bracket games only: games before it, and the winning team once decided. */
  round?: number;
  winner?: number;
};

/** A playoff team and its run through the bracket. */
export type ApiTeam = {
  team_season_id: number;
  name: string;
  rank: number | null;
  record: string | null;
  seed: number | null;
  max_wins: number;
  wins: number;
  eliminated: boolean;
};

/** Present when the season ranks its playoff teams instead of picking its games. */
export type ApiPlayoff = { teams: ApiTeam[]; games: ApiGame[] };

export type PickRow = { game_id: number; slot_id: number | null; confidence: number | null };
/** One team of a playoff ranking, `rank` N for the most confident down to 1. */
export type RankRow = { team_season_id: number; rank: number };
/** What a player saves: every game's pick and the playoff ranking, as one set. */
export type PicksDoc = { picks: PickRow[]; playoff: RankRow[] };

export type PicksResponse = {
  year: number;
  locked: boolean;
  /** Version of the caller's own set; null when they have none. */
  version: string | null;
  players: ({ display_name: string; is_me: boolean } & PicksDoc)[];
};

/** `playoff_ranked` is present only in a season that ranks its playoff teams. */
export type Progress = { display_name: string; picked: number; total: number; playoff_ranked?: boolean };

export const fetchGames = (year: number) =>
  get<{ games: ApiGame[]; playoff?: ApiPlayoff }>(`/api/seasons/${year}/games`);
export const fetchPicks = (year: number) => get<PicksResponse>(`/api/seasons/${year}/picks`);
export const fetchProgress = (year: number) =>
  get<{ players: Progress[] }>(`/api/seasons/${year}/progress`).then((r) => r.players);

/** How a save attempt ended, as the save queue needs to decide what to do next. */
export type SaveResult =
  | { kind: "ok"; version: string }
  | ({ kind: "conflict"; version: string | null } & PicksDoc)
  | { kind: "retry" }
  | { kind: "locked" }
  | { kind: "signedout" }
  | { kind: "rejected"; message: string };

/** `base` is the version of the server set the picks were made from. */
export async function putPicks(year: number, doc: PicksDoc, base: string | null, keepalive = false): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch(`/api/seasons/${year}/picks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...doc, base_version: base }),
      redirect: "manual",
      keepalive,
    });
  } catch {
    return { kind: "retry" };
  }
  if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) return { kind: "signedout" };
  const body = await res.json().catch(() => null);
  if (res.ok) return { kind: "ok", version: body.version };
  if (res.status === 412) return { kind: "conflict", picks: body.picks, playoff: body.playoff, version: body.version };
  if (res.status === 409) return { kind: "locked" };
  if (res.status >= 500) return { kind: "retry" };
  const detail = body?.problems ? `: ${JSON.stringify(body.problems)}` : "";
  return { kind: "rejected", message: `${body?.error ?? `Request failed (${res.status})`}${detail}` };
}
