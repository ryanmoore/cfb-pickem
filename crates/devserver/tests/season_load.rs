//! Loading a season from a document, through the API over a real SQLite database.

use pickem_core::access::Subject;
use pickem_core::api::{route, Identity, Request};
use pickem_core::email_hash;
use pickem_devserver::{create, SqliteStorage};
use serde_json::{json, Value};

const KEY: &[u8] = b"k";
const ADMIN: &str = "ann@example.com";
const PLAYER: &str = "bo@example.com";

fn database() -> SqliteStorage {
    let storage = create(std::path::Path::new(":memory:")).unwrap();
    let (ann, bo) = (email_hash(KEY, ADMIN), email_hash(KEY, PLAYER));
    storage
        .conn
        .execute_batch(&format!(
            "INSERT INTO app_user (id, email_hash, display_name, is_admin, created_at) VALUES
               (1, '{ann}', 'Ann', 1, 't'), (2, '{bo}', 'Bo', 0, 't');
             INSERT INTO season (id, year, locks_at, created_at) VALUES (5, 2024, '2024-12-01T00:00:00Z', 't');
             INSERT INTO event (id, slug, name) VALUES (1, 'alpha', 'Alpha Bowl'), (2, 'beta', 'Beta Bowl');
             INSERT INTO team (id, slug, name) VALUES (1, 'north', 'North'), (2, 'south', 'South'), (3, 'east', 'East'), (4, 'west', 'West');
             INSERT INTO team_season (id, season_id, team_id) VALUES (1, 5, 1);
             INSERT INTO game (id, season_id, event_id, kickoff_at, external_id) VALUES (1, 5, 2, '2024-12-20T00:00:00Z', 777);
             INSERT INTO game_slot (id, game_id, slot_index, team_season_id) VALUES (1, 1, 0, 1), (2, 1, 1, 1);"
        ))
        .unwrap();
    storage
}

fn call(db: &SqliteStorage, method: &str, path: &str, who: Identity, body: &Value) -> Result<(u16, Value), rusqlite::Error> {
    let body = body.to_string();
    let req = Request {
        method,
        path,
        identity: who,
        content_type: Some("application/json"),
        origin: None,
        host: Some("pool.test"),
        body: body.as_bytes(),
    };
    let now = "2025-11-01T00:00:00Z".parse().unwrap();
    let reply = pollster::block_on(route(db, &req, KEY, now))?;
    Ok((reply.status, serde_json::from_str(&reply.body).unwrap()))
}

fn ok(db: &SqliteStorage, method: &str, path: &str, who: Identity, body: &Value) -> (u16, Value) {
    call(db, method, path, who, body).unwrap()
}

/// A ranked four-team playoff plus one regular bowl, all new except the bowl `alpha`.
fn document(with_bowl: bool, external_id: i64) -> Value {
    let mut games = vec![
        json!({"bowl": "semi-1", "kickoff_at": "2025-12-20T17:00:00Z", "playoff": true, "external_id": external_id,
               "slots": [{"team": "north", "seed": 1}, {"team": "west", "seed": 4}]}),
        json!({"bowl": "semi-2", "kickoff_at": "2025-12-20T21:00:00Z", "playoff": true,
               "slots": [{"team": "south", "seed": 2}, {"team": "east", "seed": 3}]}),
        json!({"bowl": "final", "name": "The Final", "kickoff_at": "2026-01-01T00:00:00Z", "playoff": true,
               "slots": [{"winner_of": "semi-1"}, {"winner_of": "semi-2"}]}),
    ];
    let mut teams = json!({"north": {"rank": 1, "record": "12-0"}, "south": {}, "east": {}, "west": {}});
    if with_bowl {
        games.push(json!({"bowl": "alpha", "kickoff_at": "2025-12-19T17:00:00Z", "fixed_wager": 3,
                          "slots": [{"team": "north"}, {"team": "south"}]}));
    } else {
        teams = json!({"north": {}, "south": {}, "east": {}, "west": {}});
    }
    json!({"year": 2025, "playoff_format": "rank",
           "new_bowls": {"semi-1": "Semi One", "semi-2": "Semi Two", "final": "Final"},
           "teams": teams, "games": games})
}

fn count(db: &SqliteStorage, sql: &str) -> i64 {
    db.conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

#[test]
fn a_draft_is_applied_replaced_hidden_published_and_then_frozen() {
    let db = database();
    let (admin, player, anon) = (Identity::Email(ADMIN), Identity::Email(PLAYER), Identity::Anonymous);
    let put = |who, body: &Value| ok(&db, "PUT", "/api/admin/seasons/2025/draft", who, body);

    assert_eq!(put(player, &document(true, 1)).0, 403);
    assert_eq!(put(anon, &document(true, 1)).0, 401);
    let mut bad = document(true, 1);
    bad["games"][0]["bowl"] = json!("semi-3");
    let (status, body) = put(admin, &bad);
    assert_eq!(status, 422);
    assert!(body["problems"].to_string().contains("semi-3"));
    let (status, _) = ok(&db, "PUT", "/api/admin/seasons/2026/draft", admin, &document(true, 1));
    assert_eq!(status, 422, "the route's year must match the document");

    let (status, body) = ok(&db, "POST", "/api/admin/seasons/2025/draft/dry-run", admin, &document(true, 1));
    assert_eq!((status, body["summary"]["games"].as_i64(), body["summary"]["playoff_games"].as_i64()), (200, Some(4), Some(3)));
    assert_eq!(body["summary"]["new_bowls"].as_object().unwrap().len(), 3);
    assert_eq!(count(&db, "SELECT count(*) FROM season WHERE year = 2025"), 0);

    assert_eq!(put(admin, &document(true, 1)).0, 200);
    let years = |who| -> Vec<(i64, bool)> {
        let (_, body) = ok(&db, "GET", "/api/seasons", who, &json!(null));
        body["seasons"].as_array().unwrap().iter().map(|s| (s["year"].as_i64().unwrap(), s["draft"].as_bool().unwrap())).collect()
    };
    assert_eq!(years(admin), [(2025, true), (2024, false)]);
    assert_eq!(years(player), [(2024, false)]);
    assert_eq!(years(anon), [(2024, false)]);
    for who in [player, anon] {
        for path in ["games", "standings", "picks", "progress"] {
            assert_eq!(ok(&db, "GET", &format!("/api/seasons/2025/{path}"), who, &json!(null)).0, 404, "{path}");
        }
    }
    assert_eq!(ok(&db, "PUT", "/api/seasons/2025/picks", player, &json!({"picks": []})).0, 404);

    let (status, body) = ok(&db, "GET", "/api/seasons/2025/games", admin, &json!(null));
    assert_eq!(status, 200);
    assert_eq!(body["games"].as_array().unwrap().len(), 1);
    let rounds: Vec<_> = body["playoff"]["games"].as_array().unwrap().iter().map(|g| g["round"].as_i64().unwrap()).collect();
    assert_eq!(rounds, [0, 0, 1]);
    assert_eq!(body["playoff"]["games"][2]["name"], "The Final");
    let seeds: Vec<_> = body["playoff"]["teams"].as_array().unwrap().iter().map(|t| t["seed"].as_i64().unwrap()).collect();
    assert_eq!(seeds, [1, 2, 3, 4]);

    // Applying again replaces the draft wholesale; bowls and teams the first
    // apply created are not new any more.
    let (status, body) = put(admin, &document(false, 1));
    assert_eq!((status, body["summary"]["replaces_draft"].clone(), body["summary"]["new_bowls"].clone()), (200, json!(true), json!({})));
    assert_eq!(count(&db, "SELECT count(*) FROM game g JOIN season s ON s.id = g.season_id WHERE s.year = 2025"), 3);
    assert_eq!(count(&db, "SELECT count(*) FROM season WHERE year = 2025"), 1);
    let (_, body) = ok(&db, "GET", "/api/seasons/2025/games", admin, &json!(null));
    assert_eq!(body["games"].as_array().unwrap().len(), 0);

    // A failure inside the database leaves the earlier draft untouched.
    assert!(call(&db, "PUT", "/api/admin/seasons/2025/draft", admin, &document(true, 777)).is_err());
    assert_eq!(count(&db, "SELECT count(*) FROM game g JOIN season s ON s.id = g.season_id WHERE s.year = 2025"), 3);

    assert_eq!(ok(&db, "POST", "/api/admin/seasons/2025/publish", player, &json!({})).0, 403);
    assert_eq!(ok(&db, "POST", "/api/admin/seasons/2025/publish", admin, &json!({})).0, 200);
    assert_eq!(years(player), [(2025, false), (2024, false)]);
    assert_eq!(ok(&db, "GET", "/api/seasons/2025/games", anon, &json!(null)).0, 200);
    assert_eq!(put(admin, &document(true, 1)).0, 409);
    assert_eq!(ok(&db, "POST", "/api/admin/seasons/2025/publish", admin, &json!({})).0, 409);
    assert_eq!(ok(&db, "DELETE", "/api/admin/seasons/2025/draft", admin, &json!({})).0, 409);
}

#[test]
fn deleting_a_draft_removes_everything_in_it() {
    let db = database();
    let admin = Identity::Email(ADMIN);
    assert_eq!(ok(&db, "PUT", "/api/admin/seasons/2025/draft", admin, &document(true, 1)).0, 200);
    let (_, games) = ok(&db, "GET", "/api/seasons/2025/games", admin, &json!(null));
    let (game, slot) = (games["games"][0]["id"].clone(), games["games"][0]["slots"][0]["id"].clone());
    let ranking: Vec<_> = (1..=4).zip(games["playoff"]["teams"].as_array().unwrap()).map(|(rank, t)| json!({"team_season_id": t["team_season_id"], "rank": rank})).collect();
    let picks = json!({"picks": [{"game_id": game, "slot_id": slot, "confidence": null}], "playoff": ranking});
    assert_eq!(ok(&db, "PUT", "/api/seasons/2025/picks", admin, &picks).0, 200, "admins can try a draft");

    assert_eq!(ok(&db, "DELETE", "/api/admin/seasons/2025/draft", Identity::Email(PLAYER), &json!({})).0, 403);
    assert_eq!(ok(&db, "DELETE", "/api/admin/seasons/2025/draft", admin, &json!({})).0, 200);
    assert_eq!(ok(&db, "GET", "/api/seasons/2025/games", admin, &json!(null)).0, 404);
    // Only the 2024 fixture's rows remain.
    for (table, left) in [("pick", 0), ("playoff_rank", 0), ("game_slot", 2), ("team_season", 1)] {
        assert_eq!(count(&db, &format!("SELECT count(*) FROM {table}")), left, "{table}");
    }
    assert_eq!(count(&db, "SELECT count(*) FROM game"), 1);
    assert_eq!(ok(&db, "DELETE", "/api/admin/seasons/2025/draft", admin, &json!({})).0, 404);
}

const AUTOMATION: &str = "automation.access";

#[test]
fn the_automation_edits_drafts_and_nothing_else() {
    let (token, other) = (Subject::ServiceToken(AUTOMATION.into()), Subject::ServiceToken("other.access".into()));
    let callers = [
        ("anonymous", Identity::Anonymous),
        ("player", Identity::Email(PLAYER)),
        ("admin", Identity::Email(ADMIN)),
        ("automation", Identity::from_subject(&token, Some(AUTOMATION))),
        ("other token", Identity::from_subject(&other, Some(AUTOMATION))),
    ];
    let doc = document(true, 1);
    let empty = json!({});
    let picks = json!({"picks": []});
    // Statuses per caller, in the order above. Each caller starts from a fresh database holding a draft.
    let rows: [(&str, &str, &Value, [u16; 5]); 8] = [
        ("GET", "/api/seasons/2025/games", &empty, [404, 404, 200, 200, 404]),
        ("POST", "/api/admin/seasons/2025/draft/dry-run", &doc, [401, 403, 200, 200, 401]),
        ("PUT", "/api/admin/seasons/2025/draft", &doc, [401, 403, 200, 200, 401]),
        ("POST", "/api/seasons/2025/games/1/result", &empty, [401, 403, 404, 403, 401]),
        ("PUT", "/api/seasons/2025/picks", &picks, [401, 404, 422, 403, 401]),
        ("POST", "/api/admin/seasons/2025/publish", &empty, [401, 403, 200, 403, 401]),
        ("DELETE", "/api/admin/seasons/2025/draft", &empty, [401, 403, 409, 200, 401]),
        ("GET", "/api/me", &empty, [200, 200, 200, 200, 200]),
    ];
    for (i, (who, identity)) in callers.iter().enumerate() {
        let db = database();
        assert_eq!(ok(&db, "PUT", "/api/admin/seasons/2025/draft", Identity::Email(ADMIN), &doc).0, 200);
        for (method, path, body, expected) in &rows {
            let (status, reply) = ok(&db, method, path, *identity, body);
            assert_eq!(status, expected[i], "{who}: {method} {path} {reply}");
        }
    }
    assert_eq!(Identity::from_subject(&token, None), Identity::Anonymous, "without AUTOMATION_CLIENT_ID there is no automation");
    let automation = callers[3].1;
    let (_, me) = ok(&database(), "GET", "/api/me", automation, &json!(null));
    assert_eq!(me, json!({"signed_in": false}), "the automation is not a player");
}
