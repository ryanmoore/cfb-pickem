//! Imports the real legacy archive and checks it against the legacy scoring
//! rule. The archive names real people, so it is never committed: point
//! `PICKEM_LEGACY_DB` at it.

use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::PathBuf;

use pickem_core::{standings, Storage};
use pickem_devserver::import::import;
use rusqlite::Connection;

/// The legacy `ScoreTable` rule in SQL: a pick on a winning participant
/// scores the game's fixed wager if it has one, else the user's wager row.
const LEGACY_TOTALS: &str = "
    SELECT s.year, u.username,
           SUM(CASE WHEN g.fixed_wager_amount > 0 THEN g.fixed_wager_amount ELSE w.amount END)
    FROM pickem_selection sel
    JOIN pickem_winner win ON win.participant_id = sel.participant_id
    JOIN pickem_participant p ON p.id = sel.participant_id
    JOIN pickem_game g ON g.id = p.game_id
    JOIN pickem_season s ON s.id = g.season_id
    JOIN auth_user u ON u.id = sel.user_id
    LEFT JOIN pickem_wager w ON w.game_id = g.id AND w.user_id = sel.user_id
    GROUP BY s.year, u.username";

fn scalar(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

#[test]
fn import_reproduces_legacy_standings() {
    let Some(legacy_path) = env::var_os("PICKEM_LEGACY_DB") else {
        eprintln!("skipped: set PICKEM_LEGACY_DB to the legacy Django SQLite archive");
        return;
    };
    let out = env::temp_dir().join(format!("pickem-reconcile-{}.sqlite3", std::process::id()));
    let _ = fs::remove_file(&out);
    let storage = import(&PathBuf::from(&legacy_path), &out).unwrap();
    let legacy = Connection::open(&legacy_path).unwrap();
    let new = Connection::open(&out).unwrap();

    // Every legacy row arrives exactly once.
    for (table, legacy_table, expected) in [
        ("game", "pickem_game", 269),
        ("game_result", "pickem_winner", 269),
        ("pick", "pickem_selection", 2815),
    ] {
        assert_eq!(scalar(&new, &format!("SELECT count(*) FROM {table}")), expected);
        assert_eq!(scalar(&legacy, &format!("SELECT count(*) FROM {legacy_table}")), expected);
    }
    // Wagers fold into picks; the picks without one are the fixed-wager games.
    assert_eq!(scalar(&legacy, "SELECT count(*) FROM pickem_wager"), 2719);
    assert_eq!(scalar(&new, "SELECT count(*) FROM pick WHERE confidence IS NOT NULL"), 2719);
    assert_eq!(
        scalar(
            &new,
            "SELECT count(*) FROM pick p JOIN game g ON g.id = p.game_id
             WHERE (p.confidence IS NULL) <> (g.fixed_wager IS NOT NULL)",
        ),
        0
    );

    // Each of the nine championships has two slots fed by semifinals, and
    // their 17 distinct pseudo-teams are gone.
    assert_eq!(scalar(&new, "SELECT count(*) FROM game_slot WHERE feeder_game_id IS NOT NULL"), 18);
    assert_eq!(scalar(&new, "SELECT count(*) FROM team_season"), 533);

    let mut expected: BTreeMap<(u16, String), u32> = BTreeMap::new();
    let mut stmt = legacy.prepare(LEGACY_TOTALS).unwrap();
    for row in stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap() {
        let (year, user, total) = row.unwrap();
        expected.insert((year, user), total);
    }

    let names: BTreeMap<_, _> = pollster::block_on(storage.users())
        .unwrap()
        .into_iter()
        .map(|u| (u.id, u.display_name))
        .collect();
    let mut actual: BTreeMap<(u16, String), u32> = BTreeMap::new();
    for year in [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023] {
        let season = pollster::block_on(storage.season_by_year(year)).unwrap().unwrap();
        let games = pollster::block_on(storage.games_for_season(season.id)).unwrap();
        let picks = pollster::block_on(storage.picks_for_season(season.id)).unwrap();
        let results = pollster::block_on(storage.results_for_season(season.id)).unwrap();
        for s in standings(&games, &picks, &results) {
            assert_eq!(s.remaining, 0, "{year}: every game has a winner");
            if s.scored > 0 {
                actual.insert((year, names[&s.user_id].clone()), s.scored);
            }
        }
    }
    assert!(expected.len() > 50, "legacy totals query returned too little");
    assert_eq!(actual, expected);
    fs::remove_file(out).unwrap();
}
