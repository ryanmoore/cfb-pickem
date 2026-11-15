use std::path::Path;

use pickem_core::api::{route, Request};
use pickem_devserver::create;
use serde_json::{json, Value};

const NOW: &str = "2025-01-01T00:00:00Z";

/// One season of one-point games the first listed player's score wins; each
/// player picks the winning side in as many games as their score and the other
/// side in the rest. `decided` records the winners.
struct Spec {
    year: u16,
    locks_at: &'static str,
    practice: bool,
    decided: bool,
    scores: &'static [(&'static str, usize)],
}

fn seed(specs: &[Spec]) -> pickem_devserver::SqliteStorage {
    let storage = create(Path::new(":memory:")).unwrap();
    let c = &storage.conn;
    c.execute_batch("INSERT INTO team (id, slug, name) VALUES (1, 'a', 'A'), (2, 'b', 'B');").unwrap();
    let (mut game, mut slot) = (0, 0);
    for (i, s) in specs.iter().enumerate() {
        let season = i as i64 + 1;
        c.execute(
            "INSERT INTO season (id, year, locks_at, practice, created_at) VALUES (?, ?, ?, ?, 't')",
            rusqlite::params![season, s.year, s.locks_at, s.practice],
        )
        .unwrap();
        c.execute("INSERT INTO team_season (id, season_id, team_id) VALUES (?, ?, 1), (?, ?, 2)", rusqlite::params![season * 2 - 1, season, season * 2, season]).unwrap();
        let games = s.scores.iter().map(|p| p.1).max().unwrap();
        for g in 0..games {
            game += 1;
            slot += 2;
            c.execute("INSERT INTO event (id, slug, name) VALUES (?1, ?1, 'E')", [game]).unwrap();
            c.execute("INSERT INTO game (id, season_id, event_id, kickoff_at, fixed_wager) VALUES (?, ?, ?, '2020-01-01T00:00:00Z', 1)", [game, season, game]).unwrap();
            c.execute("INSERT INTO game_slot (id, game_id, slot_index, team_season_id) VALUES (?, ?, 0, ?), (?, ?, 1, ?)", [slot - 1, game, season * 2 - 1, slot, game, season * 2]).unwrap();
            if s.decided {
                c.execute("INSERT INTO game_result VALUES (?, ?, 'import', 't')", [game, slot - 1]).unwrap();
            }
            for (name, score) in s.scores {
                c.execute("INSERT OR IGNORE INTO app_user (display_name, created_at) SELECT ?1, 't' WHERE NOT EXISTS (SELECT 1 FROM app_user WHERE display_name = ?1)", [name]).unwrap();
                let side = if g < *score { slot - 1 } else { slot };
                c.execute("INSERT INTO pick SELECT id, ?, ?, ?, NULL, 't' FROM app_user WHERE display_name = ?", rusqlite::params![game, season, side, name]).unwrap();
            }
        }
    }
    storage
}

fn get(storage: &pickem_devserver::SqliteStorage, path: &str) -> Value {
    let req = Request { method: "GET", path, identity: None, content_type: None, origin: None, host: None, body: b"" };
    serde_json::from_str(&pollster::block_on(route(storage, &req, b"k", NOW.parse().unwrap())).unwrap().body).unwrap()
}

#[test]
fn history_counts_finished_real_seasons_only() {
    let storage = seed(&[
        Spec { year: 2019, locks_at: "2019-12-01T00:00:00Z", practice: false, decided: true, scores: &[("Ann", 3), ("Bo", 2), ("Cy", 2), ("Di", 0)] },
        Spec { year: 2020, locks_at: "2020-12-01T00:00:00Z", practice: false, decided: true, scores: &[("Ann", 3), ("Bo", 3), ("Cy", 1)] },
        Spec { year: 2021, locks_at: "2021-12-01T00:00:00Z", practice: true, decided: true, scores: &[("Di", 3), ("Ann", 0)] },
        Spec { year: 2023, locks_at: "2023-12-01T00:00:00Z", practice: false, decided: false, scores: &[("Di", 2), ("Ann", 1)] },
        Spec { year: 2030, locks_at: "2030-12-01T00:00:00Z", practice: false, decided: false, scores: &[("Bo", 2)] },
    ]);
    let h = get(&storage, "/api/history");
    let years: Vec<_> = h["seasons"].as_array().unwrap().iter().map(|s| s["year"].as_u64().unwrap()).collect();
    assert_eq!(years, [2020, 2019]);
    assert_eq!(h["seasons"][0]["podium"], json!([{"rank": 1, "names": ["Ann", "Bo"]}, {"rank": 3, "names": ["Cy"]}]));
    assert_eq!(h["seasons"][0]["last"], json!(["Cy"]));
    assert_eq!(h["seasons"][1]["podium"][1], json!({"rank": 2, "names": ["Bo", "Cy"]}));
    assert_eq!(h["seasons"][1]["margin"], json!(1.0));
    // Each player's record covers finished real seasons only, oldest first.
    let di = h["players"].as_array().unwrap().iter().find(|p| p["name"] == "Di").unwrap();
    assert_eq!(di["results"], json!([{"year": 2019, "rank": 4, "field": 4, "points": 0.0, "winner": 3.0}]));
    // Di's practice win and unfinished 2023 do not show anywhere.
    assert_eq!(h["medals"].as_array().unwrap().len(), 3);
    assert_eq!(h["coal_club"].as_array().unwrap().iter().map(|c| c["name"].as_str().unwrap()).collect::<Vec<_>>(), ["Cy", "Di", "Bo"]);
    // The practice season still plays like any other, and says so.
    assert_eq!(get(&storage, "/api/seasons")["seasons"][2]["practice"], json!(true));
    assert_eq!(get(&storage, "/api/seasons/2021/standings")["standings"][0]["display_name"], json!("Di"));
}
