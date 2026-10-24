//! One-shot import of the legacy Django database.
//!
//! Row ids of seasons, games, team seasons, participants (now game slots) and
//! users carry over unchanged, so legacy rows can be found from new ones.
//! Nothing is repaired: data that breaks a rule fails the import.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::Path;

use pickem_core::{validate_confidence_permutation, PermutationError, SeasonId, Storage};
use rusqlite::{params, Connection};

use crate::storage::{create, SqliteStorage};

#[derive(Debug, thiserror::Error)]
pub enum ImportError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("legacy event names with no mapping: {0:?}")]
    UnmappedEvents(Vec<String>),
    #[error("participant {participant} ({name:?}) matches games {matches:?}, not exactly one semifinal")]
    Feeder { participant: i64, name: String, matches: Vec<i64> },
    #[error("{table}: legacy has {legacy} rows, import produced {imported}")]
    CountMismatch { table: &'static str, legacy: i64, imported: i64 },
    #[error("{year} user {user}: {problems:?}")]
    Permutation { year: u16, user: i64, problems: Vec<PermutationError> },
}

/// Legacy names that denote one bowl: (slug, canonical name, legacy names).
/// The canonical name is the bowl's most recent one. A game keeps its legacy
/// name as `display_name` when it differs from the canonical one. A legacy
/// name ending in `@<year>` applies to that season only, for a name that two
/// different bowls used in different years.
const EVENTS: &[(&str, &str, &[&str])] = &[
    ("alamo", "Alamo Bowl", &["Alamo", "Alamo Bowl", "Valero Alamo Bowl"]),
    ("arizona", "Arizona Bowl", &["Arizona", "Arizona Bowl", "Nova Home Loans Arizona Bowl"]),
    ("armed-forces", "Armed Forces Bowl", &["Bell Helicopter Armed Forces Bowl", "Lockheed Martin Armed Forces Bowl"]),
    ("birmingham", "Birmingham Bowl", &["Birmingham", "Birmingham Bowl", "Bbva Compass Bowl"]),
    ("guaranteed-rate", "Guaranteed Rate Bowl", &[
        "Cactus", "Motel 6 Cactus Bowl", "Ticketcity Cactus Bowl", "Buffalo Wild Wings Bowl",
        "Cheez-It Bowl@2018", "Cheez-It Bowl@2019", "Guaranteed Rate Bowl",
    ]),
    ("pop-tarts", "Pop-Tarts Bowl", &[
        "Russell Athletic", "Russell Athletic Bowl", "Camping World", "Camping World Bowl",
        "Cheez-It Bowl@2021", "Cheez-It Bowl@2022", "Pop-Tarts Bowl",
    ]),
    ("citrus", "Citrus Bowl", &["Citrus", "Citrus Bowl", "Buffalo Wild Wings Citrus Bowl", "Vrbo Citrus Bowl", "Capital One Bowl"]),
    ("cotton", "Cotton Bowl", &["Cotton", "Cotton Bowl", "Cotton Bowl Classic", "At&T Cotton Bowl", "Goodyear Cotton Bowl", "Goodyear Cotton Bowl Classic"]),
    ("dukes-mayo", "Duke's Mayo Bowl", &["Belk", "Belk Bowl", "Duke'S Mayo Bowl"]),
    ("fiesta", "Fiesta Bowl", &["Fiesta", "Fiesta Bowl", "Tostitos Fiesta Bowl", "Vizio Fiesta Bowl", "Battlefrog Fiesta Bowl", "Playstation Fiesta Bowl"]),
    ("first-responder", "First Responder Bowl", &["First Responder Bowl", "Servpro First Responder Bowl"]),
    ("redbox", "Redbox Bowl", &["Fight Hunger Bowl", "Foster Farms", "Foster Fam", "Foster Farms Bowl", "Foster Farms San Francisco Bowl", "Redbox Bowl"]),
    ("gator", "Gator Bowl", &["Gator Bowl", "Taxslayer Gator Bowl", "Taxslayer.Com Gator Bowl", "Taxslayer", "Taxslayer Bowl"]),
    ("heart-of-dallas", "Heart Of Dallas Bowl", &["Heart Of Dallas", "Heart Of Dallas Bowl", "Zaxby'S Heart Of Dallas Bowl"]),
    ("holiday", "Holiday Bowl", &["Holiday", "Holiday Bowl", "National University Holiday Bowl", "Sdccu Holiday Bowl"]),
    ("independence", "Independence Bowl", &["Independence", "Duck Commander Independence Bowl", "Camping World Independence Bowl", "Walk On'S Independence Bowl", "Walk On\u{2019}S Independence Bowl", "Advocare V100 Bowl"]),
    ("lendingtree", "Lendingtree Bowl", &["Godaddy Bowl", "Lendingtree Bowl"]),
    ("liberty", "Liberty Bowl", &["Liberty", "Liberty Bowl", "Autozone Liberty Bowl"]),
    ("military", "Military Bowl", &["Military", "Military Bowl", "Military Bowl ", "Military Bowl Pres. By Northrop Grumman"]),
    ("music-city", "Music City Bowl", &["Music City", "Music City Bowl", "Franklin American Mortgage Music City Bowl", "Fam Music City Bowl"]),
    ("orange", "Orange Bowl", &["Orange", "Orange Bowl", "Discover Orange Bowl", "Capital One Orange Bowl"]),
    ("reliaquest", "Reliaquest Bowl", &["Outback", "Outback Bowl", "Reliaquest Bowl"]),
    ("peach", "Peach Bowl", &["Peach", "Peach Bowl", "Chick-Fil-A Peach Bowl", "Chick-Fil-A Bowl"]),
    ("pinstripe", "Pinstripe Bowl", &["Pinstripe", "Pinstripe Bowl", "New Era Pinstripe Bowl"]),
    ("quick-lane", "Quick Lane Bowl", &["Quick Lane", "Quick Lane Bowl"]),
    ("rose", "Rose Bowl", &["Rose", "Rose Bowl", "Rose Bowl Game", "Rose Bowl Semifinal", "Rose Bowl Game Pres. By Vizio", "Rose Bowl Game Pres. By Northwestern Mutual - Semifinal"]),
    ("st-petersburg", "St. Petersburg Bowl", &["St. Petersburg", "St. Petersburg Bowl", "Bitcoin St. Petersburg Bowl"]),
    ("sugar", "Sugar Bowl", &["Sugar", "Sugar Bowl", "Sugar Bowl Semifinal", "Allstate Sugar Bowl", "Allstate Sugar Bowl - Semifinal"]),
    ("sun", "Sun Bowl", &["Sun", "Sun Bowl", "Hyundai Sun", "Hyundai Sun Bowl", "Tony The Tiger Sun Bowl"]),
    ("texas", "Texas Bowl", &["Texas", "Texas Bowl", "Advocare V100 Texas Bowl", "Academy Sports + Outdoors Texas Bowl"]),
    ("national-championship", "National Championship", &[
        "National Championship", "2016 National Championship", "Cfp National Championship",
        "Cfp National Championship Game Pres. By At&T", "CFP National Championship Game Pres. By AT&T",
        "College Football Playoff National Championship", "Vizio Bcs National Championship",
    ]),
    ("camellia", "Camellia Bowl", &["Camellia Bowl"]),
    ("famous-idaho-potato", "Famous Idaho Potato Bowl", &["Famous Idaho Potato Bowl"]),
    ("fenway", "Fenway Bowl", &["Fenway Bowl"]),
    ("las-vegas", "Las Vegas Bowl", &["Las Vegas Bowl"]),
    ("little-caesars", "Little Caesars Bowl", &["Little Caesars Bowl"]),
    ("poinsettia", "Poinsettia Bowl", &["S.D. County Credit Union Poinsettia "]),
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

/// Championship games list as participants pseudo-teams named for the two
/// semifinal winners ("Alpha/Beta"). Each becomes a slot fed by the semifinal
/// in the same season whose two teams are those names. Recorded in the temp
/// tables `feeder_map` (participant to feeder game) and `pseudo_ts` (the
/// team seasons that no longer exist).
fn link_feeders(conn: &Connection) -> Result<(), ImportError> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.game_id, g.season_id, trim(ts.team_id), p.teamseason_id
         FROM old.pickem_participant p
         JOIN old.pickem_game g ON g.id = p.game_id
         JOIN old.pickem_teamseason ts ON ts.id = p.teamseason_id",
    )?;
    let rows: Vec<(i64, i64, i64, String, i64)> =
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?
            .collect::<Result<_, _>>()?;

    let mut teams_of: HashMap<i64, (i64, BTreeSet<&str>)> = HashMap::new();
    for (_, game, season, name, _) in &rows {
        teams_of.entry(*game).or_insert((*season, BTreeSet::new())).1.insert(name);
    }

    conn.execute_batch(
        "CREATE TEMP TABLE feeder_map (participant_id INTEGER PRIMARY KEY, feeder_game_id INTEGER);
         CREATE TEMP TABLE pseudo_ts (id INTEGER PRIMARY KEY);",
    )?;
    for (participant, game, season, name, teamseason) in &rows {
        if !name.contains('/') {
            continue;
        }
        let halves: BTreeSet<&str> = name.split('/').map(str::trim).collect();
        let matches: Vec<i64> = teams_of
            .iter()
            .filter(|(id, (s, teams))| *id != game && s == season && *teams == halves)
            .map(|(id, _)| *id)
            .collect();
        let [feeder] = matches.as_slice() else {
            return Err(ImportError::Feeder { participant: *participant, name: name.clone(), matches });
        };
        conn.execute("INSERT INTO feeder_map VALUES (?, ?)", [participant, feeder])?;
        conn.execute("INSERT OR IGNORE INTO pseudo_ts VALUES (?)", [teamseason])?;
    }
    Ok(())
}

fn load(conn: &Connection, legacy: &Path) -> Result<(), ImportError> {
    conn.execute("ATTACH DATABASE ?1 AS old", [legacy.to_str()])?;
    conn.execute_batch("BEGIN")?;

    conn.execute_batch("CREATE TEMP TABLE event_map (old_name TEXT, year INTEGER, slug TEXT, name TEXT)")?;
    {
        let mut map = conn.prepare("INSERT INTO event_map VALUES (?, ?, ?, ?)")?;
        let mut event = conn.prepare("INSERT INTO event (slug, name) VALUES (?, ?)")?;
        for (slug, name, aliases) in EVENTS {
            event.execute([slug, name])?;
            for alias in *aliases {
                let (old_name, year) = match alias.split_once('@') {
                    Some((n, y)) => (n, Some(y.parse::<u16>().expect("year in event alias"))),
                    None => (*alias, None),
                };
                map.execute(params![old_name, year, slug, name])?;
            }
        }
    }
    let unmapped: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT g.event_id FROM old.pickem_game g
             JOIN old.pickem_season s ON s.id = g.season_id
             WHERE NOT EXISTS (SELECT 1 FROM event_map m
                               WHERE m.old_name = g.event_id AND coalesce(m.year, s.year) = s.year)",
        )?;
        let rows = stmt.query_map([], |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };
    if !unmapped.is_empty() {
        return Err(ImportError::UnmappedEvents(unmapped));
    }

    link_feeders(conn)?;

    {
        let names: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT name FROM old.pickem_team
                 WHERE name IN (SELECT team_id FROM old.pickem_teamseason
                                WHERE id NOT IN (SELECT id FROM pseudo_ts))
                    OR name NOT IN (SELECT team_id FROM old.pickem_teamseason)
                 ORDER BY name",
            )?;
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
         FROM old.pickem_teamseason ts JOIN team t ON t.name = ts.team_id
         WHERE ts.id NOT IN (SELECT id FROM pseudo_ts);

         INSERT INTO game (id, season_id, event_id, display_name, kickoff_at, fixed_wager)
         SELECT g.id, g.season_id, e.id,
                CASE WHEN m.old_name <> m.name THEN m.old_name END,
                replace(g.datetime, ' ', 'T') || 'Z', NULLIF(g.fixed_wager_amount, 0)
         FROM old.pickem_game g
         JOIN old.pickem_season s ON s.id = g.season_id
         JOIN event_map m ON m.old_name = g.event_id AND coalesce(m.year, s.year) = s.year
         JOIN event e ON e.slug = m.slug;

         INSERT INTO game_slot (id, game_id, slot_index, team_season_id, feeder_game_id)
         SELECT p.id, p.game_id, row_number() OVER (PARTITION BY p.game_id ORDER BY p.id) - 1,
                CASE WHEN f.participant_id IS NULL THEN p.teamseason_id END, f.feeder_game_id
         FROM old.pickem_participant p
         LEFT JOIN feeder_map f ON f.participant_id = p.id;

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

    let pseudo = count(conn, "SELECT count(*) FROM pseudo_ts")?;
    for (table, legacy_table, dropped) in [
        ("app_user", "auth_user", 0),
        ("season", "pickem_season", 0),
        ("team_season", "pickem_teamseason", pseudo),
        ("game", "pickem_game", 0),
        ("game_slot", "pickem_participant", 0),
        ("game_result", "pickem_winner", 0),
        ("pick", "pickem_selection", 0),
    ] {
        let legacy = count(conn, &format!("SELECT count(*) FROM old.{legacy_table}"))? - dropped;
        let imported = count(conn, &format!("SELECT count(*) FROM {table}"))?;
        if legacy != imported {
            return Err(ImportError::CountMismatch { table, legacy, imported });
        }
    }
    conn.execute_batch("COMMIT")?;
    Ok(())
}
