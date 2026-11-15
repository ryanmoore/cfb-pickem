/** A game slot is a team (by seed) or the winner of another game. */
export type Ref = { team: number } | { winner: string };
export type BGame = { id: string; round: number; a: Ref; b: Ref; bowl?: string };
export type Field = { size: number; teams: string[]; games: BGame[]; rounds: string[] };

const PLACES = [
  "Northshore", "Emberfall", "Quillhaven", "Stonewick", "Marrowdale", "Thistlemoor",
  "Ravenhollow", "Saltmarsh", "Copperkeep", "Lindenfold", "Wyndmere", "Fernbridge",
  "Tidewater", "Cragmoor", "Hollowpine", "Starling Ridge", "Brindle Cove", "Mistral Bay",
  "Driftmere", "Foxglove", "Amberwood", "Gullrock Point", "Lowmarsh", "Birchfold",
];
const MASCOTS = [
  "Pelicans", "Herons", "Lynxes", "Otters", "Falcons", "Marmots", "Merlins", "Badgers",
  "Stags", "Ospreys", "Wolverines", "Bobcats", "Cormorants", "Harriers", "Ibex", "Plovers",
  "Salamanders", "Tamarins", "Voles", "Wrens", "Yaks", "Egrets", "Gannets", "Orcas",
];
const BOWLS = ["Cedar Bowl", "Lantern Bowl", "Harbor Bowl", "Summit Bowl", "Orchard Bowl", "Beacon Bowl"];

/**
 * A field of `size` teams where seeds 1..byes skip the first round. The first
 * round pairs the remaining seeds best against worst; each later round pairs
 * the first-round winners with the byes, then the outermost games with each
 * other. Everything else (wins available, roads, results) is derived from the
 * game list.
 */
export function makeField(size: number, byes: number): Field {
  const games: BGame[] = [];
  const add = (round: number, k: number, a: Ref, b: Ref) => {
    const id = `r${round}g${k}`;
    games.push({ id, round, a, b });
    return id;
  };
  const team = (seed: number): Ref => ({ team: seed });
  const firstRound = (size - byes) / 2;
  let round = 0;
  let pairs: [Ref, Ref][];
  if (firstRound) {
    const winners = Array.from({ length: firstRound }, (_, k) => add(0, k, team(byes + 1 + k), team(size - k)));
    round = 1;
    // The best remaining seed's game goes to the weakest bye.
    pairs = Array.from({ length: byes }, (_, k) => [team(k + 1), { winner: winners[byes - 1 - k] }]);
  } else {
    pairs = Array.from({ length: size / 2 }, (_, k) => [team(k + 1), team(size - k)]);
  }
  for (;;) {
    const ids = pairs.map(([a, b], k) => add(round, k, a, b));
    if (ids.length === 1) break;
    pairs = ids.slice(0, ids.length / 2).map((id, k) => [{ winner: id }, { winner: ids[ids.length - 1 - k] }]);
    round++;
  }
  const rounds = Array.from({ length: round + 1 }, (_, r) =>
    ["Final", "Semifinal", "Quarterfinal"][round - r] ?? (r === 0 ? "First round" : "Second round"),
  );
  let bowl = 0;
  for (const g of games) {
    if (rounds[g.round] === "Final") g.bowl = "Championship";
    else if (rounds[g.round] === "Quarterfinal" || rounds[g.round] === "Semifinal") g.bowl = BOWLS[bowl++];
  }
  return { size, teams: Array.from({ length: size }, (_, k) => `${PLACES[k]} ${MASCOTS[k]}`), games, rounds };
}

export const FIELDS: Record<number, Field> = { 12: makeField(12, 4), 24: makeField(24, 8) };

const gameOf = (f: Field, id: string) => f.games.find((g) => g.id === id)!;

export type Step = { game: BGame; opponent: Ref };

/** The games a team plays if it keeps winning, first to last, each with the slot it would face. */
export function road(f: Field, seed: number): Step[] {
  const out: Step[] = [];
  const holds = (r: Ref, mine: Ref) => JSON.stringify(r) === JSON.stringify(mine);
  let mine: Ref = { team: seed };
  for (let g = f.games.find((x) => holds(x.a, mine) || holds(x.b, mine)); g; ) {
    out.push({ game: g, opponent: holds(g.a, mine) ? g.b : g.a });
    mine = { winner: g.id };
    g = f.games.find((x) => holds(x.a, mine) || holds(x.b, mine));
  }
  return out;
}

export const teamLabel = (f: Field, seed: number) => `#${seed} ${f.teams[seed - 1]}`;

export const maxWins = (f: Field, seed: number) => road(f, seed).length;

/** A readable name for a game: its bowl, else its round and place in the round. */
export function gameLabel(f: Field, g: BGame) {
  if (g.bowl) return g.bowl;
  const same = f.games.filter((x) => x.round === g.round);
  return `${f.rounds[g.round]} game ${same.indexOf(g) + 1}`;
}

/** Who fills a slot: the team, or "winner of ..." the two teams (or the game) that feed it. */
export function whoIn(f: Field, ref: Ref): string {
  if ("team" in ref) return teamLabel(f, ref.team);
  const g = gameOf(f, ref.winner);
  const both = [g.a, g.b].filter((r): r is { team: number } => "team" in r);
  return both.length === 2 ? `winner of ${both.map((r) => teamLabel(f, r.team)).join(" / ")}` : `winner of ${gameLabel(f, g)}`;
}

/** The team in a slot once results are known, else undefined. */
export function resolve(ref: Ref, winners: Record<string, number>): number | undefined {
  return "team" in ref ? ref.team : winners[ref.winner];
}

/** Random winners round by round, so every game's two sides are known when it is played. */
export function simulate(f: Field, rand = Math.random): Record<string, number> {
  const winners: Record<string, number> = {};
  for (const g of [...f.games].sort((x, y) => x.round - y.round)) {
    const sides = [resolve(g.a, winners)!, resolve(g.b, winners)!];
    winners[g.id] = sides[rand() < 0.5 ? 0 : 1];
  }
  return winners;
}

export const winCounts = (winners: Record<string, number>) => {
  const w = new Map<number, number>();
  for (const t of Object.values(winners)) w.set(t, (w.get(t) ?? 0) + 1);
  return w;
};

/** Rank times wins, scaled so the playoff weighs the same at any field size. */
export const earned = (size: number, rank: number, wins: number) => (rank * wins * 12) / size;
