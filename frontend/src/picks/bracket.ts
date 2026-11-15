import type { ApiPlayoff, ApiTeam } from "../api";

/** A game slot is a team (by id) or the winner of another game. */
export type Ref = { team: number } | { winner: number };
export type BGame = { id: number; round: number; name: string; kickoffAt: string; a: Ref; b: Ref; winner?: number };
export type Field = { teams: Map<number, ApiTeam>; games: BGame[]; rounds: string[] };

const ref = (s: { team_season_id: number | null; winner_of: number | null }): Ref =>
  s.team_season_id !== null ? { team: s.team_season_id } : { winner: s.winner_of! };

/** The bracket as the pick page reads it; the last round is the final. */
export function toField({ teams, games }: ApiPlayoff): Field {
  const last = Math.max(...games.map((g) => g.round!));
  const rounds = Array.from({ length: last + 1 }, (_, r) => {
    const left = last - r;
    return ["Final", "Semifinal", "Quarterfinal"][left] ?? ["First round", "Second round"][r] ?? `Round ${r + 1}`;
  });
  return {
    teams: new Map(teams.map((t) => [t.team_season_id, t])),
    games: games.map((g) => ({ id: g.id, round: g.round!, name: g.name, kickoffAt: g.kickoff_at, a: ref(g.slots[0]), b: ref(g.slots[1]), winner: g.winner })),
    rounds,
  };
}

const gameOf = (f: Field, id: number) => f.games.find((g) => g.id === id)!;

export type Step = { game: BGame; opponent: Ref };

/** The games a team plays if it keeps winning, first to last, each with the slot it would face. */
export function road(f: Field, team: number): Step[] {
  const out: Step[] = [];
  const holds = (r: Ref, mine: Ref) => JSON.stringify(r) === JSON.stringify(mine);
  let mine: Ref = { team };
  for (let g = f.games.find((x) => holds(x.a, mine) || holds(x.b, mine)); g; ) {
    out.push({ game: g, opponent: holds(g.a, mine) ? g.b : g.a });
    mine = { winner: g.id };
    g = f.games.find((x) => holds(x.a, mine) || holds(x.b, mine));
  }
  return out;
}

export const teamLabel = (f: Field, team: number) => {
  const t = f.teams.get(team)!;
  return t.seed ? `#${t.seed} ${t.name}` : t.name;
};

/** A readable name for a game: its bowl, else its round and place in the round. */
export function gameLabel(f: Field, g: BGame) {
  if (g.name) return g.name;
  const same = f.games.filter((x) => x.round === g.round);
  return `${f.rounds[g.round]} game ${same.indexOf(g) + 1}`;
}

/** Who fills a slot: the team, or "winner of ..." the two teams (or the game) that feed it. */
export function whoIn(f: Field, r: Ref): string {
  if ("team" in r) return teamLabel(f, r.team);
  const g = gameOf(f, r.winner);
  const both = [g.a, g.b].filter((x): x is { team: number } => "team" in x);
  return both.length === 2 ? `winner of ${both.map((x) => teamLabel(f, x.team)).join(" / ")}` : `winner of ${gameLabel(f, g)}`;
}

/** The team in a slot once its feeder is decided, else undefined. */
export const resolve = (f: Field, r: Ref): number | undefined => ("team" in r ? r.team : gameOf(f, r.winner).winner);

/** Rank times wins, scaled so the playoff weighs the same at any field size. */
export const earned = (size: number, rank: number, wins: number) => (rank * wins * 12) / size;
