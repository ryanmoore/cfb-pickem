use std::fs;
use std::path::Path;

use rusqlite::Connection;

fn migration(name: &str) -> String {
    fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations").join(name)).unwrap()
}

const PICKS: &str = "SELECT user_id, game_id, season_id, slot_id, confidence, updated_at FROM pick ORDER BY 1, 2";

#[test]
fn making_pick_slot_nullable_keeps_every_row_and_the_confidence_rule() {
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
    let before: Vec<_> = conn
        .prepare(PICKS).unwrap()
        .query_map([], |r| Ok((0..6).map(|i| r.get::<_, rusqlite::types::Value>(i).unwrap()).collect::<Vec<_>>())).unwrap()
        .collect::<Result<_, _>>().unwrap();

    conn.execute_batch(&migration("0002_nullable_pick_slot.sql")).unwrap();

    let after: Vec<_> = conn
        .prepare(PICKS).unwrap()
        .query_map([], |r| Ok((0..6).map(|i| r.get::<_, rusqlite::types::Value>(i).unwrap()).collect::<Vec<_>>())).unwrap()
        .collect::<Result<_, _>>().unwrap();
    assert_eq!(before.len(), 3);
    assert_eq!(after, before);
    assert!(conn.execute("UPDATE pick SET slot_id = NULL WHERE user_id = 2", []).is_ok());
    // The partial unique index came back, and foreign keys still hold.
    assert!(conn.execute("INSERT INTO pick VALUES (1, 2, 1, 2, 1, 'u')", []).is_err());
    assert!(conn.execute("UPDATE pick SET slot_id = 99 WHERE user_id = 2", []).is_err());
}
