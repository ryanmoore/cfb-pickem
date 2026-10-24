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
