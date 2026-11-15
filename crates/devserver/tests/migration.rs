use std::fs;
use std::path::Path;

use rusqlite::Connection;

fn migration(name: &str) -> String {
    fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations").join(name)).unwrap()
}

const PICKS: &str = "SELECT user_id, game_id, season_id, slot_id, confidence, updated_at FROM pick ORDER BY 1, 2";

/// A database as 0001 left it, holding a few rows of every kind.
fn at_0001() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(&migration("0001_initial.sql")).unwrap();
    conn.execute_batch(
        "INSERT INTO app_user (id, display_name, created_at) VALUES (1, 'a', 't'), (2, 'b', 't');
         INSERT INTO season (id, year, locks_at, created_at) VALUES (1, 2024, 't', 't');
         INSERT INTO event (id, slug, name) VALUES (1, 'x', 'X'), (2, 'y', 'Y');
         INSERT INTO team (id, slug, name) VALUES (1, 't', 'T');
         INSERT INTO team_season (id, season_id, team_id) VALUES (1, 1, 1);
         INSERT INTO game (id, season_id, event_id, kickoff_at, fixed_wager) VALUES (1, 1, 1, 't', NULL), (2, 1, 2, 't', 3);
         INSERT INTO game_slot (id, game_id, slot_index, team_season_id) VALUES (1, 1, 0, 1), (2, 2, 0, 1);
         INSERT INTO pick VALUES (1, 1, 1, 1, 1, 'u1'), (1, 2, 1, 2, NULL, 'u2'), (2, 1, 1, 1, 1, 'u3');",
    )
    .unwrap();
    conn
}

fn rows(conn: &Connection) -> Vec<Vec<rusqlite::types::Value>> {
    conn.prepare(PICKS).unwrap()
        .query_map([], |r| Ok((0..6).map(|i| r.get(i).unwrap()).collect()))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

#[test]
fn making_pick_slot_nullable_keeps_every_row_and_the_confidence_rule() {
    let conn = at_0001();
    let before = rows(&conn);

    conn.execute_batch(&migration("0002_nullable_pick_slot.sql")).unwrap();

    assert_eq!(rows(&conn), before);
    // The partial unique index came back, and foreign keys still hold.
    assert!(conn.execute("INSERT INTO pick VALUES (1, 2, 1, 2, 1, 'u')", []).is_err());
    assert!(conn.execute("UPDATE pick SET slot_id = 99 WHERE user_id = 2", []).is_err());
}

#[test]
fn the_playoff_migration_leaves_existing_seasons_fixed_and_picks_untouched() {
    let conn = at_0001();
    conn.execute_batch(&migration("0002_nullable_pick_slot.sql")).unwrap();
    let before = rows(&conn);

    conn.execute_batch(&migration("0003_playoff_ranking.sql")).unwrap();

    assert_eq!(rows(&conn), before);
    let count = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap();
    assert_eq!(count("SELECT count(*) FROM season WHERE playoff_format = 'fixed'"), 1);
    assert_eq!(count("SELECT count(*) FROM game WHERE playoff = 0"), 2);
    assert!(conn.execute("UPDATE season SET playoff_format = 'other'", []).is_err());

    // One rank and one team per player and season.
    conn.execute_batch("INSERT INTO team (id, slug, name) VALUES (2, 'u', 'U'); INSERT INTO team_season (id, season_id, team_id) VALUES (2, 1, 2);").unwrap();
    let rank = |team: i64, rank: i64| conn.execute("INSERT INTO playoff_rank VALUES (1, 1, ?, ?, 'u')", [team, rank]);
    rank(1, 1).unwrap();
    assert!(rank(1, 2).is_err());
    assert!(rank(2, 1).is_err());
}
