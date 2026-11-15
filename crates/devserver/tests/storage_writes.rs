use std::env;
use std::fs;

use pickem_core::{GameId, GameResult, Pick, PlayoffRank, PlayoffSave, PlayoffStatus, ResultSource, SeasonId, SlotId, Storage, TeamSeasonId, UserId};
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

fn rank(team: i64, rank: u32) -> PlayoffRank {
    PlayoffRank { user_id: UserId(1), team_season_id: TeamSeasonId(team), rank }
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
             INSERT INTO team (id, slug, name) VALUES (1, 't', 'T'), (2, 'u', 'U');
             INSERT INTO team_season (id, season_id, team_id) VALUES (1, 1, 1), (2, 1, 2);
             INSERT INTO game (id, season_id, event_id, kickoff_at) VALUES (1, 1, 1, '2024-12-20T00:00:00Z'), (2, 1, 2, '2024-12-21T00:00:00Z');
             INSERT INTO game_slot (id, game_id, slot_index, team_season_id) VALUES (1, 1, 0, 1), (2, 2, 0, 1);",
        )
        .unwrap();

    let replace_with = |picks: &[Pick], ranks: &[PlayoffRank], version: &str, base: Option<&str>| {
        pollster::block_on(storage.replace_picks(UserId(1), SeasonId(1), picks, ranks, PlayoffSave { done: false, changed: false }, version, base))
    };
    let replace = |picks: &[Pick], version: &str, base: Option<&str>| replace_with(picks, &[], version, base);
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

    // A ranking is saved in the same batch, under the same version and guard.
    let good = [pick(1, 1, 1), pick(2, 2, 2)];
    let ranks = || pollster::block_on(storage.playoff_ranks_for_season(SeasonId(1))).unwrap();
    assert_eq!(replace_with(&good, &[rank(1, 2), rank(2, 1)], "v6", Some("v4")).unwrap(), Some(5));
    assert_eq!((version().as_deref(), ranks()), (Some("v6"), vec![rank(1, 2), rank(2, 1)]));
    // A stale base changes neither the ranking nor the picks.
    assert_eq!(replace_with(&[pick(1, 2, 2), pick(2, 1, 1)], &[rank(1, 1), rank(2, 2)], "v7", Some("v4")).unwrap(), None);
    assert_eq!((version().as_deref(), ranks()), (Some("v6"), vec![rank(1, 2), rank(2, 1)]));
    // A ranking alone can change: the picks are rewritten with it.
    assert_eq!(replace_with(&good, &[rank(1, 1), rank(2, 2)], "v7", Some("v6")).unwrap(), Some(6));
    assert_eq!((version().as_deref(), ranks()), (Some("v7"), vec![rank(2, 2), rank(1, 1)]));
    // One rank twice is refused by the unique index and rolls the whole save back.
    assert!(replace_with(&good, &[rank(1, 1), rank(2, 1)], "v8", None).is_err());
    assert_eq!((version().as_deref(), ranks()), (Some("v7"), vec![rank(2, 2), rank(1, 1)]));

    // Picks and ranking at different versions: the player's version is the newer
    // one, and a base naming only the older refuses the whole save, keeping the picks.
    storage.conn.execute("UPDATE playoff_rank SET updated_at = 'v9'", []).unwrap();
    assert_eq!(version().as_deref(), Some("v9"));
    assert_eq!(replace_with(&good, &[rank(1, 2), rank(2, 1)], "v10", Some("v7")).unwrap(), None);
    assert_eq!(pollster::block_on(storage.picks_for_season(SeasonId(1))).unwrap(), good);
    assert_eq!((version().as_deref(), ranks()), (Some("v9"), vec![rank(2, 2), rank(1, 1)]));

    // The status is written with the set and refused with it: a confirmation, and a count of changed rankings.
    let status = || pollster::block_on(storage.playoff_status_for_season(SeasonId(1))).unwrap();
    let save = |done: bool, changed: bool, version: &str, base: &str| {
        let playoff = PlayoffSave { done, changed };
        pollster::block_on(storage.replace_picks(UserId(1), SeasonId(1), &good, &[rank(1, 2), rank(2, 1)], playoff, version, Some(base))).unwrap()
    };
    let user = |done, moves| vec![PlayoffStatus { user_id: UserId(1), done, moves }];
    assert_eq!(save(true, false, "v11", "v9"), Some(7));
    assert_eq!(status(), user(true, 0));
    assert_eq!(save(false, true, "v12", "old"), None);
    assert_eq!(status(), user(true, 0));
    assert_eq!(save(true, true, "v12", "v11"), Some(8));
    assert_eq!(save(true, true, "v13", "v12"), Some(9));
    assert_eq!(save(false, false, "v14", "v13"), Some(10));
    assert_eq!(status(), user(false, 2));

    let result = GameResult { game_id: GameId(1), winner_slot_id: SlotId(1), source: ResultSource::Manual };
    assert_eq!(pollster::block_on(storage.record_result(SeasonId(1), result)).unwrap(), 11);
    assert_eq!(pollster::block_on(storage.results_for_season(SeasonId(1))).unwrap(), vec![result]);
    fs::remove_file(path).unwrap();
}
