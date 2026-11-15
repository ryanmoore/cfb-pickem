export type Season = { year: number; locked: boolean };

export type Standing = {
  rank: number;
  display_name: string;
  scored: number;
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
  get<{ standings: Standing[] }>(`/api/seasons/${year}/standings`).then(
    (r) => r.standings,
  );

export type ApiSlot = {
  id: number;
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
};

export type PickRow = { game_id: number; slot_id: number | null; confidence: number | null };

export type PicksResponse = {
  year: number;
  locked: boolean;
  players: { display_name: string; is_me: boolean; picks: PickRow[] }[];
};

export type Progress = { display_name: string; picked: number; total: number };

export const fetchGames = (year: number) =>
  get<{ games: ApiGame[] }>(`/api/seasons/${year}/games`).then((r) => r.games);
export const fetchPicks = (year: number) => get<PicksResponse>(`/api/seasons/${year}/picks`);
export const fetchProgress = (year: number) =>
  get<{ players: Progress[] }>(`/api/seasons/${year}/progress`).then((r) => r.players);

/** How a save attempt ended, as the save queue needs to decide what to do next. */
export type SaveResult =
  | { kind: "ok" }
  | { kind: "retry" }
  | { kind: "locked" }
  | { kind: "rejected"; message: string };

export async function putPicks(year: number, picks: PickRow[]): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch(`/api/seasons/${year}/picks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks }),
    });
  } catch {
    return { kind: "retry" };
  }
  if (res.ok) return { kind: "ok" };
  if (res.status === 409) return { kind: "locked" };
  if (res.status >= 500) return { kind: "retry" };
  const body = await res.json().catch(() => null);
  const detail = body?.problems ? `: ${JSON.stringify(body.problems)}` : "";
  return { kind: "rejected", message: `${body?.error ?? `Request failed (${res.status})`}${detail}` };
}
