//! One-shot import of the legacy Django database.
//!
//! Row ids of seasons, games, team seasons, participants (now game slots) and
//! users carry over unchanged, so legacy rows can be found from new ones.
//! Nothing is repaired: data that breaks a rule fails the import.

use std::collections::HashSet;
use std::path::Path;

use pickem_core::{validate_confidence_permutation, PermutationError, SeasonId, Storage};
use rusqlite::Connection;

use crate::storage::{create, SqliteStorage};

#[derive(Debug, thiserror::Error)]
pub enum ImportError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("legacy event names with no mapping: {0:?}")]
    UnmappedEvents(Vec<String>),
    #[error("{table}: legacy has {legacy} rows, import produced {imported}")]
    CountMismatch { table: &'static str, legacy: i64, imported: i64 },
    #[error("{year} user {user}: {problems:?}")]
    Permutation { year: u16, user: i64, problems: Vec<PermutationError> },
}

/// Legacy names that denote one bowl: (slug, canonical name, legacy names).
/// A game keeps its legacy name as `display_name` when it differs from the
/// canonical one. A name is merged only where removing sponsor words,
/// casing and "Bowl"/"Game"/"Classic"/"Semifinal" leaves the same core;
/// renames that need outside knowledge stay separate events.
const EVENTS: &[(&str, &str, &[&str])] = &[
    ("alamo", "Alamo Bowl", &["Alamo", "Alamo Bowl", "Valero Alamo Bowl"]),
    ("arizona", "Arizona Bowl", &["Arizona", "Arizona Bowl", "Nova Home Loans Arizona Bowl"]),
    ("armed-forces", "Armed Forces Bowl", &["Bell Helicopter Armed Forces Bowl", "Lockheed Martin Armed Forces Bowl"]),
    ("belk", "Belk Bowl", &["Belk", "Belk Bowl"]),
    ("birmingham", "Birmingham Bowl", &["Birmingham", "Birmingham Bowl"]),
    ("cactus", "Cactus Bowl", &["Cactus", "Motel 6 Cactus Bowl", "Ticketcity Cactus Bowl"]),
    ("camping-world", "Camping World Bowl", &["Camping World", "Camping World Bowl"]),
    ("citrus", "Citrus Bowl", &["Citrus", "Citrus Bowl", "Buffalo Wild Wings Citrus Bowl", "Vrbo Citrus Bowl"]),
    ("cotton", "Cotton Bowl", &["Cotton", "Cotton Bowl", "Cotton Bowl Classic", "At&T Cotton Bowl", "Goodyear Cotton Bowl", "Goodyear Cotton Bowl Classic"]),
    ("fiesta", "Fiesta Bowl", &["Fiesta", "Fiesta Bowl", "Tostitos Fiesta Bowl", "Vizio Fiesta Bowl", "Battlefrog Fiesta Bowl", "Playstation Fiesta Bowl"]),
    ("first-responder", "First Responder Bowl", &["First Responder Bowl", "Servpro First Responder Bowl"]),
    ("foster-farms", "Foster Farms Bowl", &["Foster Farms", "Foster Fam", "Foster Farms Bowl", "Foster Farms San Francisco Bowl"]),
    ("gator", "Gator Bowl", &["Gator Bowl", "Taxslayer Gator Bowl", "Taxslayer.Com Gator Bowl"]),
    ("heart-of-dallas", "Heart Of Dallas Bowl", &["Heart Of Dallas", "Heart Of Dallas Bowl", "Zaxby'S Heart Of Dallas Bowl"]),
    ("holiday", "Holiday Bowl", &["Holiday", "Holiday Bowl", "National University Holiday Bowl", "Sdccu Holiday Bowl"]),
    ("independence", "Independence Bowl", &["Independence", "Duck Commander Independence Bowl", "Camping World Independence Bowl", "Walk On'S Independence Bowl", "Walk On\u{2019}S Independence Bowl"]),
    ("liberty", "Liberty Bowl", &["Liberty", "Liberty Bowl", "Autozone Liberty Bowl"]),
    ("military", "Military Bowl", &["Military", "Military Bowl", "Military Bowl ", "Military Bowl Pres. By Northrop Grumman"]),
    ("music-city", "Music City Bowl", &["Music City", "Music City Bowl", "Franklin American Mortgage Music City Bowl", "Fam Music City Bowl"]),
    ("orange", "Orange Bowl", &["Orange", "Orange Bowl", "Discover Orange Bowl", "Capital One Orange Bowl"]),
    ("outback", "Outback Bowl", &["Outback", "Outback Bowl"]),
    ("peach", "Peach Bowl", &["Peach", "Peach Bowl", "Chick-Fil-A Peach Bowl"]),
    ("pinstripe", "Pinstripe Bowl", &["Pinstripe", "Pinstripe Bowl", "New Era Pinstripe Bowl"]),
    ("quick-lane", "Quick Lane Bowl", &["Quick Lane", "Quick Lane Bowl"]),
    ("rose", "Rose Bowl", &["Rose", "Rose Bowl", "Rose Bowl Game", "Rose Bowl Semifinal", "Rose Bowl Game Pres. By Vizio", "Rose Bowl Game Pres. By Northwestern Mutual - Semifinal"]),
    ("russell-athletic", "Russell Athletic Bowl", &["Russell Athletic", "Russell Athletic Bowl"]),
    ("st-petersburg", "St. Petersburg Bowl", &["St. Petersburg", "St. Petersburg Bowl", "Bitcoin St. Petersburg Bowl"]),
    ("sugar", "Sugar Bowl", &["Sugar", "Sugar Bowl", "Sugar Bowl Semifinal", "Allstate Sugar Bowl", "Allstate Sugar Bowl - Semifinal"]),
    ("sun", "Sun Bowl", &["Sun", "Sun Bowl", "Hyundai Sun", "Hyundai Sun Bowl", "Tony The Tiger Sun Bowl"]),
    ("taxslayer", "Taxslayer Bowl", &["Taxslayer", "Taxslayer Bowl"]),
    ("texas", "Texas Bowl", &["Texas", "Texas Bowl", "Advocare V100 Texas Bowl", "Academy Sports + Outdoors Texas Bowl"]),
    ("national-championship", "National Championship", &[
        "National Championship", "2016 National Championship", "Cfp National Championship",
        "Cfp National Championship Game Pres. By At&T", "CFP National Championship Game Pres. By AT&T",
        "College Football Playoff National Championship", "Vizio Bcs National Championship",
    ]),
    ("advocare-v100", "Advocare V100 Bowl", &["Advocare V100 Bowl"]),
    ("bbva-compass", "Bbva Compass Bowl", &["Bbva Compass Bowl"]),
    ("buffalo-wild-wings", "Buffalo Wild Wings Bowl", &["Buffalo Wild Wings Bowl"]),
    ("camellia", "Camellia Bowl", &["Camellia Bowl"]),
    ("capital-one", "Capital One Bowl", &["Capital One Bowl"]),
    ("cheez-it", "Cheez-It Bowl", &["Cheez-It Bowl"]),
    ("chick-fil-a", "Chick-Fil-A Bowl", &["Chick-Fil-A Bowl"]),
    ("dukes-mayo", "Duke's Mayo Bowl", &["Duke'S Mayo Bowl"]),
    ("famous-idaho-potato", "Famous Idaho Potato Bowl", &["Famous Idaho Potato Bowl"]),
    ("fenway", "Fenway Bowl", &["Fenway Bowl"]),
    ("fight-hunger", "Fight Hunger Bowl", &["Fight Hunger Bowl"]),
    ("godaddy", "Godaddy Bowl", &["Godaddy Bowl"]),
    ("guaranteed-rate", "Guaranteed Rate Bowl", &["Guaranteed Rate Bowl"]),
    ("las-vegas", "Las Vegas Bowl", &["Las Vegas Bowl"]),
    ("lendingtree", "Lendingtree Bowl", &["Lendingtree Bowl"]),
    ("little-caesars", "Little Caesars Bowl", &["Little Caesars Bowl"]),
    ("poinsettia", "Poinsettia Bowl", &["S.D. County Credit Union Poinsettia "]),
    ("pop-tarts", "Pop-Tarts Bowl", &["Pop-Tarts Bowl"]),
    ("redbox", "Redbox Bowl", &["Redbox Bowl"]),
    ("reliaquest", "Reliaquest Bowl", &["Reliaquest Bowl"]),
];

/// Lowercase alphanumerics joined by single hyphens.
fn slugify(name: &str) -> String {
    let mut slug = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
    }
    slug.trim_end_matches('-').to_string()
}

fn count(conn: &Connection, sql: &str) -> rusqlite::Result<i64> {
    conn.query_row(sql, [], |r| r.get(0))
}

/// Import `legacy` into a new database at `out`, then check that every
/// player's confidence values form a permutation.
pub fn import(legacy: &Path, out: &Path) -> Result<SqliteStorage, ImportError> {
    let storage = create(out)?;
    load(&storage.conn, legacy)?;
    let seasons: Vec<(i64, u16)> = {
        let mut stmt = storage.conn.prepare("SELECT id, year FROM season ORDER BY year")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect::<Result<_, _>>()?
    };
    for (id, year) in seasons {
        let season = SeasonId(id);
        let games = pollster::block_on(storage.games_for_season(season))?;
        let picks = pollster::block_on(storage.picks_for_season(season))?;
        let mut users: Vec<_> = picks.iter().map(|p| p.user_id).collect();
        users.dedup();
        for user in users {
            let theirs: Vec<_> = picks.iter().filter(|p| p.user_id == user).copied().collect();
            validate_confidence_permutation(&games, &theirs).map_err(|problems| {
                ImportError::Permutation { year, user: user.0, problems }
            })?;
        }
    }
    Ok(storage)
}

fn load(conn: &Connection, legacy: &Path) -> Result<(), ImportError> {
    conn.execute("ATTACH DATABASE ?1 AS old", [legacy.to_str()])?;
    conn.execute_batch("BEGIN")?;

    conn.execute_batch("CREATE TEMP TABLE event_map (old_name TEXT PRIMARY KEY, slug TEXT, name TEXT)")?;
    {
        let mut map = conn.prepare("INSERT INTO event_map VALUES (?, ?, ?)")?;
        let mut event = conn.prepare("INSERT INTO event (slug, name) VALUES (?, ?)")?;
        for (slug, name, aliases) in EVENTS {
            event.execute([slug, name])?;
            for alias in *aliases {
                map.execute([alias, slug, name])?;
            }
        }
    }
    let unmapped: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT event_id FROM old.pickem_game
             WHERE event_id NOT IN (SELECT old_name FROM event_map)",
        )?;
        let rows = stmt.query_map([], |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };
    if !unmapped.is_empty() {
        return Err(ImportError::UnmappedEvents(unmapped));
    }

    {
        let names: Vec<String> = {
            let mut stmt = conn.prepare("SELECT name FROM old.pickem_team ORDER BY name")?;
            let rows = stmt.query_map([], |r| r.get(0))?;
            rows.collect::<Result<_, _>>()?
        };
        // Legacy names differ by stray whitespace alone; teams are not merged,
        // so a repeated slug gets a numeric suffix.
        let mut taken = HashSet::new();
        let mut team = conn.prepare("INSERT INTO team (slug, name) VALUES (?, ?)")?;
        for name in names {
            let base = slugify(&name);
            let mut slug = base.clone();
            for n in 2.. {
                if taken.insert(slug.clone()) {
                    break;
                }
                slug = format!("{base}-{n}");
            }
            team.execute([slug, name])?;
        }
    }

    // Legacy datetimes are naive and were stored as UTC.
    conn.execute_batch(
        "INSERT INTO app_user (id, email_hash, display_name, is_admin, legacy_username, created_at)
         SELECT id, NULL, username, is_superuser, username, replace(date_joined, ' ', 'T') || 'Z'
         FROM old.auth_user;

         INSERT INTO season (id, year, locks_at, created_at)
         SELECT id, year, replace(start_time, ' ', 'T') || 'Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         FROM old.pickem_season;

         INSERT INTO team_season (id, season_id, team_id, rank, record)
         SELECT ts.id, ts.season_id, t.id, ts.rank, ts.record
         FROM old.pickem_teamseason ts JOIN team t ON t.name = ts.team_id;

         INSERT INTO game (id, season_id, event_id, display_name, kickoff_at, fixed_wager)
         SELECT g.id, g.season_id, e.id,
                CASE WHEN m.old_name <> m.name THEN m.old_name END,
                replace(g.datetime, ' ', 'T') || 'Z', NULLIF(g.fixed_wager_amount, 0)
         FROM old.pickem_game g
         JOIN event_map m ON m.old_name = g.event_id
         JOIN event e ON e.slug = m.slug;

         INSERT INTO game_slot (id, game_id, slot_index, team_season_id)
         SELECT id, game_id, row_number() OVER (PARTITION BY game_id ORDER BY id) - 1, teamseason_id
         FROM old.pickem_participant;

         INSERT INTO game_result (game_id, winner_slot_id, source, recorded_at)
         SELECT p.game_id, w.participant_id, 'import', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         FROM old.pickem_winner w JOIN old.pickem_participant p ON p.id = w.participant_id;

         INSERT INTO pick (user_id, game_id, season_id, slot_id, confidence, updated_at)
         SELECT s.user_id, p.game_id, g.season_id, s.participant_id, w.amount,
                strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         FROM old.pickem_selection s
         JOIN old.pickem_participant p ON p.id = s.participant_id
         JOIN old.pickem_game g ON g.id = p.game_id
         LEFT JOIN old.pickem_wager w ON w.game_id = p.game_id AND w.user_id = s.user_id;",
    )?;

    for (table, legacy_table) in [
        ("app_user", "auth_user"),
        ("season", "pickem_season"),
        ("team_season", "pickem_teamseason"),
        ("game", "pickem_game"),
        ("game_slot", "pickem_participant"),
        ("game_result", "pickem_winner"),
        ("pick", "pickem_selection"),
    ] {
        let legacy = count(conn, &format!("SELECT count(*) FROM old.{legacy_table}"))?;
        let imported = count(conn, &format!("SELECT count(*) FROM {table}"))?;
        if legacy != imported {
            return Err(ImportError::CountMismatch { table, legacy, imported });
        }
    }
    conn.execute_batch("COMMIT")?;
    Ok(())
}
