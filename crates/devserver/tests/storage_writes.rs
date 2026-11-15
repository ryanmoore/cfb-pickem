use std::env;
use std::fs;

use pickem_core::{GameId, GameResult, Pick, ResultSource, SeasonId, SlotId, Storage, UserId};
use pickem_devserver::create;

fn pick(game: i64, slot: i64, confidence: u32) -> Pick {
    Pick {
        user_id: UserId(1),
        game_id: GameId(game),
        season_id: SeasonId(1),
        slot_id: Some(SlotId(slot)),
        confidence: Some(confidence),
    }
}

#[test]
fn writes_bump_the_generation_and_failed_writes_change_nothing() {
    let path = env::temp_dir().join(format!("pickem-writes-{}.sqlite3", std::process::id()));
    let _ = fs::remove_file(&path);
    let storage = create(&path).unwrap();
    storage
        .conn
        .execute_batch(
            "INSERT INTO app_user (id, display_name, created_at) VALUES (1, 'p', '2024-01-01T00:00:00Z');
             INSERT INTO season (id, year, locks_at, created_at) VALUES (1, 2024, '2024-12-01T00:00:00Z', '2024-01-01T00:00:00Z');
             INSERT INTO event (id, slug, name) VALUES (1, 'a', 'A'), (2, 'b', 'B');
             INSERT INTO team (id, slug, name) VALUES (1, 't', 'T');
             INSERT INTO team_season (id, season_id, team_id) VALUES (1, 1, 1);
             INSERT INTO game (id, season_id, event_id, kickoff_at) VALUES (1, 1, 1, '2024-12-20T00:00:00Z'), (2, 1, 2, '2024-12-21T00:00:00Z');
             INSERT INTO game_slot (id, game_id, slot_index, team_season_id) VALUES (1, 1, 0, 1), (2, 2, 0, 1);",
        )
        .unwrap();

    let replace = |picks: &[Pick], version: &str, base: Option<&str>| {
        pollster::block_on(storage.replace_picks(UserId(1), SeasonId(1), picks, version, base))
    };
    assert_eq!(replace(&[pick(1, 1, 1), pick(2, 2, 2)], "v1", Some("")).unwrap(), Some(2));
    let version = || pollster::block_on(storage.picks_version(UserId(1), SeasonId(1))).unwrap();
    assert_eq!(version().as_deref(), Some("v1"));

    // A stale or wrong base changes nothing: not the picks, version or generation.
    assert_eq!(replace(&[pick(1, 2, 2), pick(2, 1, 1)], "v2", Some("")).unwrap(), None);
    assert_eq!(replace(&[pick(1, 2, 2), pick(2, 1, 1)], "v2", Some("old")).unwrap(), None);
    assert_eq!(version().as_deref(), Some("v1"));
    assert_eq!(replace(&[pick(1, 1, 1), pick(2, 2, 2)], "v3", Some("v1")).unwrap(), Some(3));
    assert_eq!(replace(&[pick(1, 1, 1), pick(2, 2, 2)], "v4", None).unwrap(), Some(4));

    // The same confidence twice violates the per-season unique index; the
    // earlier picks and the generation must survive.
    let bad = [pick(1, 1, 1), pick(2, 2, 1)];
    assert!(replace(&bad, "v5", None).is_err());
    let picks = pollster::block_on(storage.picks_for_season(SeasonId(1))).unwrap();
    assert_eq!(picks, vec![pick(1, 1, 1), pick(2, 2, 2)]);

    let result = GameResult { game_id: GameId(1), winner_slot_id: SlotId(1), source: ResultSource::Manual };
    assert_eq!(pollster::block_on(storage.record_result(SeasonId(1), result)).unwrap(), 5);
    assert_eq!(pollster::block_on(storage.results_for_season(SeasonId(1))).unwrap(), vec![result]);
    fs::remove_file(path).unwrap();
}
