export type Season = {
  year: number;
  locked: boolean;
  locks_at: string;
  practice: boolean;
  /** Present only for admins, who alone are told of a draft. */
  draft?: boolean;
};

export type Standing = {
  rank: number;
  display_name: string;
  bowls: number;
  playoff: number;
  total: number;
  remaining_bowls: number;
  remaining_playoff: number;
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

/** Mascot and `#rrggbb` colors; null when unknown. */
export type TeamLook = { mascot: string | null; color: string | null; alt_color: string | null };

export type ApiSlot = {
  id: number;
  team_season_id: number | null;
  team: (TeamLook & { name: string; rank: number | null; record: string | null }) | null;
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
export type ApiTeam = TeamLook & {
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
/** What a player saves: every game's pick and the playoff ranking (and whether they confirmed it), as one set. */
export type PicksDoc = { picks: PickRow[]; playoff: RankRow[]; playoff_done: boolean };

export type PicksResponse = {
  year: number;
  locked: boolean;
  /** Version of the caller's own set; null when they have none. */
  version: string | null;
  playoff_done: boolean;
  players: ({ display_name: string; is_me: boolean } & PicksDoc)[];
};

/** `playoff_state` is present only in a season that ranks its playoff teams: left as shuffled, changed a few times, or confirmed. */
export type Progress = { display_name: string; picked: number; total: number; playoff_state?: "untouched" | "started" | "done" };

export type History = {
  /** Newest first. */
  seasons: {
    year: number;
    players: number;
    /** First to third; a tie shares its place. */
    podium: { rank: number; names: string[] }[];
    /** Points ahead of the runner-up; null when the title is shared. */
    margin: number | null;
    last: string[];
  }[];
  players: {
    name: string;
    results: { year: number; rank: number; field: number; points: number; winner: number }[];
  }[];
  medals: { name: string; gold: number; silver: number; bronze: number }[];
  coal_club: { name: string; coal: number; so_close: number; seasons: number; avg_rank: number }[];
};

export const fetchHistory = () => get<History>("/api/history");
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
  if (res.status === 412) return { kind: "conflict", picks: body.picks, playoff: body.playoff, playoff_done: body.playoff_done, version: body.version };
  if (res.status === 409) return { kind: "locked" };
  if (res.status >= 500) return { kind: "retry" };
  const detail = body?.problems ? `: ${JSON.stringify(body.problems)}` : "";
  return { kind: "rejected", message: `${body?.error ?? `Request failed (${res.status})`}${detail}` };
}

/** What loading a document creates, or for a dry run would create. */
export type LoadSummary = {
  year: number;
  locks_at: string;
  games: number;
  playoff_games: number;
  teams: number;
  new_bowls: Record<string, string>;
  new_teams: Record<string, string>;
  replaces_draft: boolean;
};

/** How an admin request ended, as the admin page needs to show it. */
export type AdminResult<T> =
  | { kind: "ok"; body: T }
  | { kind: "problems"; problems: string[] }
  | { kind: "failed"; message: string }
  /** No usable reply: a lapsed edge login answers with a redirect, which the browser reports as a network failure. */
  | { kind: "signedout" };

/** Maps an admin route's status and body to what the page shows. */
export function adminResult<T>(status: number, body: any): AdminResult<T> {
  if (status >= 200 && status < 300) return { kind: "ok", body };
  if (status === 401) return { kind: "signedout" };
  if (status === 422 && Array.isArray(body?.problems)) return { kind: "problems", problems: body.problems };
  const fallback = status === 403 ? "Your account isn't an admin." : `Request failed (${status})`;
  return { kind: "failed", message: body?.error ?? fallback };
}

async function adminCall<T>(method: string, path: string, doc?: string): Promise<AdminResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/seasons/${path}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: doc,
      redirect: "manual",
    });
  } catch {
    return { kind: "signedout" };
  }
  if (res.type === "opaqueredirect") return { kind: "signedout" };
  return adminResult(res.status, await res.json().catch(() => null));
}

export const dryRunDraft = (year: number, doc: string) => adminCall<{ summary: LoadSummary }>("POST", `${year}/draft/dry-run`, doc);
export const applyDraft = (year: number, doc: string) => adminCall<{ summary: LoadSummary }>("PUT", `${year}/draft`, doc);
export const publishDraft = (year: number) => adminCall<unknown>("POST", `${year}/publish`);
export const deleteDraft = (year: number) => adminCall<unknown>("DELETE", `${year}/draft`);
