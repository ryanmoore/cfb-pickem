//! All-time stats from the final standings of finished seasons.

use std::collections::BTreeMap;

use serde::Serialize;

/// One player's finish: competition rank (1, 1, 3) and final points.
pub struct Place<'a> {
    pub name: &'a str,
    pub rank: u32,
    pub total: f64,
}

/// A finished season's final standings, best first.
pub struct Finish<'a> {
    pub year: u16,
    pub places: Vec<Place<'a>>,
}

#[derive(Serialize)]
struct Podium<'a> {
    rank: u32,
    names: Vec<&'a str>,
}

#[derive(Serialize)]
struct SeasonLine<'a> {
    year: u16,
    players: usize,
    /// First to third, a tie sharing its place.
    podium: Vec<Podium<'a>>,
    /// The winner's points over the runner-up; absent when the title is shared.
    margin: Option<f64>,
    /// Who finished last; empty when everyone tied.
    last: Vec<&'a str>,
}

#[derive(Serialize)]
struct Medals<'a> {
    name: &'a str,
    gold: u32,
    silver: u32,
    bronze: u32,
}

#[derive(Serialize)]
struct Coal<'a> {
    name: &'a str,
    /// Last-place finishes.
    coal: u32,
    /// Second places.
    so_close: u32,
    seasons: u32,
    /// Mean finishing rank (competition ranks); lower is better.
    avg_rank: f64,
}

#[derive(Serialize)]
pub struct History<'a> {
    seasons: Vec<SeasonLine<'a>>,
    medals: Vec<Medals<'a>>,
    coal_club: Vec<Coal<'a>>,
}

#[derive(Default)]
struct Tally {
    medals: [u32; 3],
    coal: u32,
    seasons: u32,
    rank_sum: u32,
}

/// Newest season first in `seasons`; `finishes` may come in any order.
pub fn history<'a>(finishes: &[Finish<'a>]) -> History<'a> {
    let mut tallies: BTreeMap<&str, Tally> = BTreeMap::new();
    let mut seasons: Vec<SeasonLine> = Vec::new();
    for f in finishes {
        let worst = f.places.last().map_or(0, |p| p.rank);
        let named = |rank: u32| f.places.iter().filter(|p| p.rank == rank).map(|p| p.name).collect::<Vec<_>>();
        for p in &f.places {
            let t = tallies.entry(p.name).or_default();
            t.seasons += 1;
            t.rank_sum += p.rank;
            if let Some(medal) = t.medals.get_mut(p.rank as usize - 1) {
                *medal += 1;
            }
            if p.rank == worst && worst > 1 {
                t.coal += 1;
            }
        }
        let champions = named(1);
        let runner_up = f.places.iter().find(|p| p.rank > 1);
        seasons.push(SeasonLine {
            year: f.year,
            players: f.places.len(),
            podium: (1..=3).filter_map(|rank| Some(Podium { rank, names: named(rank) }).filter(|p| !p.names.is_empty())).collect(),
            margin: runner_up.filter(|_| champions.len() == 1).map(|r| f.places[0].total - r.total),
            last: if worst > 1 { named(worst) } else { Vec::new() },
        });
    }
    seasons.sort_by_key(|s| std::cmp::Reverse(s.year));

    let mut medals: Vec<Medals> = tallies
        .iter()
        .filter(|(_, t)| t.medals.iter().any(|&m| m > 0))
        .map(|(&name, t)| Medals { name, gold: t.medals[0], silver: t.medals[1], bronze: t.medals[2] })
        .collect();
    medals.sort_by(|a, b| (b.gold, b.silver, b.bronze).cmp(&(a.gold, a.silver, a.bronze)).then(a.name.cmp(b.name)));

    let mut coal_club: Vec<Coal> = tallies
        .iter()
        .filter(|(_, t)| t.coal > 0 || t.medals[1] > 0)
        .map(|(&name, t)| Coal {
            name,
            coal: t.coal,
            so_close: t.medals[1],
            seasons: t.seasons,
            avg_rank: f64::from(t.rank_sum) / f64::from(t.seasons),
        })
        .collect();
    coal_club.sort_by(|a, b| {
        (b.coal, b.so_close).cmp(&(a.coal, a.so_close)).then(b.avg_rank.total_cmp(&a.avg_rank)).then(a.name.cmp(b.name))
    });
    History { seasons, medals, coal_club }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn finish(year: u16, totals: &[(&'static str, f64)]) -> Finish<'static> {
        let points: Vec<f64> = totals.iter().map(|t| t.1).collect();
        let places = crate::scoring::rank_ties(&points)
            .into_iter()
            .zip(totals)
            .map(|(rank, &(name, total))| Place { name, rank, total })
            .collect();
        Finish { year, places }
    }

    #[test]
    fn ties_share_places_medals_and_the_last_spot() {
        let h = history(&[
            finish(2020, &[("Ann", 10.0), ("Bo", 8.0), ("Cy", 8.0), ("Di", 5.0)]),
            finish(2021, &[("Ann", 9.0), ("Bo", 9.0), ("Cy", 6.0)]),
            finish(2022, &[("Cy", 4.0), ("Di", 4.0)]),
        ]);
        let h = serde_json::to_value(h).unwrap();
        assert_eq!(h["seasons"][0], json!({"year": 2022, "players": 2, "podium": [{"rank": 1, "names": ["Cy", "Di"]}], "margin": null, "last": []}));
        assert_eq!(
            h["seasons"][2],
            json!({"year": 2020, "players": 4, "margin": 2.0, "last": ["Di"],
                   "podium": [{"rank": 1, "names": ["Ann"]}, {"rank": 2, "names": ["Bo", "Cy"]}]})
        );
        // 2021: Ann and Bo share gold and nobody takes silver.
        assert_eq!(h["seasons"][1]["podium"], json!([{"rank": 1, "names": ["Ann", "Bo"]}, {"rank": 3, "names": ["Cy"]}]));
        assert_eq!(h["seasons"][1]["margin"], json!(null));
        assert_eq!(
            h["medals"],
            json!([
                {"name": "Ann", "gold": 2, "silver": 0, "bronze": 0},
                {"name": "Cy", "gold": 1, "silver": 1, "bronze": 1},
                {"name": "Bo", "gold": 1, "silver": 1, "bronze": 0},
                {"name": "Di", "gold": 1, "silver": 0, "bronze": 0},
            ])
        );
        // Di was last once, Cy last once; only the 2020 and 2021 fields had a last place.
        let coal: Vec<_> = h["coal_club"].as_array().unwrap().iter().map(|c| (c["name"].as_str().unwrap(), c["coal"].as_u64().unwrap(), c["so_close"].as_u64().unwrap())).collect();
        assert_eq!(coal, [("Cy", 1, 1), ("Di", 1, 0), ("Bo", 0, 1)]);
        let di = &h["coal_club"][1];
        assert_eq!((di["seasons"].as_u64(), di["avg_rank"].as_f64()), (Some(2), Some((4.0 + 1.0) / 2.0)));
    }
}
