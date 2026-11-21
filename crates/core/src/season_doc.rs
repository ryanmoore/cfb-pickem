//! The season document: one JSON file that describes a whole season, and the
//! checks that make loading it safe.
//!
//! Everything is named by slug, never by database id. A bowl has one game per
//! season, so a game is identified by its bowl's slug, which is also how a
//! slot says it is fed by another game. Bowls and teams that do not exist yet
//! must be declared in `new_bowls` / `new_teams`: a misspelt slug is then an
//! error instead of a new row. A declared name that starts with [`REVIEW`] is
//! a placeholder a person has not confirmed, and is refused.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::model::{Event, PlayoffFormat, Team};
use crate::storage::Storage;

/// Marks a generated name or entry a person still has to resolve.
pub const REVIEW: &str = "REVIEW:";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SeasonDoc {
    pub year: u16,
    /// RFC 3339; defaults to the earliest kickoff.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locks_at: Option<String>,
    #[serde(default)]
    pub playoff_format: PlayoffFormat,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub practice: bool,
    /// Bowl slug to name, for bowls not yet in the database.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub new_bowls: BTreeMap<String, String>,
    /// Team slug to its name (or an object with mascot and colors), for teams
    /// not yet in the database.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub new_teams: BTreeMap<String, NewTeam>,
    /// The teams taking part, by slug.
    pub teams: BTreeMap<String, TeamEntry>,
    pub games: Vec<GameEntry>,
}

/// A declared team. Written as a bare name or as an object, always stored as
/// the object so the SQL reads one shape.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(from = "NewTeamForm")]
pub struct NewTeam {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mascot: Option<String>,
    /// `#rrggbb`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt_color: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum NewTeamForm {
    Name(String),
    Full { name: String, mascot: Option<String>, color: Option<String>, alt_color: Option<String> },
}

impl From<NewTeamForm> for NewTeam {
    fn from(form: NewTeamForm) -> Self {
        match form {
            NewTeamForm::Name(name) => Self { name, ..Self::default() },
            NewTeamForm::Full { name, mascot, color, alt_color } => Self { name, mascot, color, alt_color },
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeamEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rank: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub record: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GameEntry {
    /// The bowl's slug; names the game.
    pub bowl: String,
    /// This season's name for the bowl, when it differs from the bowl's own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// RFC 3339.
    pub kickoff_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fixed_wager: Option<u32>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub playoff: bool,
    /// Exactly two.
    pub slots: Vec<SlotEntry>,
}

/// One side of a game: a `team`, or the `winner_of` another game.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SlotEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub winner_of: Option<String>,
    /// Playoff seed; only with `team`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<u16>,
}

/// What loading a document creates (or, for a dry run, would create).
#[derive(Debug, Serialize)]
pub struct Summary {
    pub year: u16,
    pub locks_at: DateTime<Utc>,
    pub playoff_format: PlayoffFormat,
    pub games: usize,
    pub playoff_games: usize,
    pub teams: usize,
    /// Declared bowls and teams that do not exist yet.
    pub new_bowls: BTreeMap<String, String>,
    pub new_teams: BTreeMap<String, String>,
    pub replaces_draft: bool,
}

#[derive(Debug)]
pub enum LoadError {
    /// The year already has a published season.
    Published,
    Invalid(Vec<String>),
}

/// Validate `doc` against what the database holds and, unless `dry_run`,
/// store it as the year's draft season, replacing an earlier draft.
pub async fn load_season<S: Storage>(
    storage: &S,
    doc: &mut SeasonDoc,
    dry_run: bool,
    now: DateTime<Utc>,
) -> Result<Result<Summary, LoadError>, S::Error> {
    let existing = storage.season_by_year(doc.year).await?;
    if existing.as_ref().is_some_and(|s| !s.draft) {
        return Ok(Err(LoadError::Published));
    }
    let (events, teams) = (storage.events().await?, storage.teams().await?);
    let mut summary = match validate(doc, &events, &teams) {
        Ok(summary) => summary,
        Err(problems) => return Ok(Err(LoadError::Invalid(problems))),
    };
    summary.replaces_draft = existing.is_some();
    if !dry_run {
        storage.replace_draft(doc, now).await?;
    }
    Ok(Ok(summary))
}

fn valid_slug(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with('-')
        && !s.ends_with('-')
        && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

pub fn valid_color(s: &str) -> bool {
    s.strip_prefix('#').is_some_and(|h| h.len() == 6 && h.bytes().all(|b| b.is_ascii_hexdigit()))
}

fn utc(text: &str) -> Option<String> {
    let t: DateTime<Utc> = DateTime::parse_from_rfc3339(text).ok()?.into();
    Some(t.format("%Y-%m-%dT%H:%M:%SZ").to_string())
}

/// Check a declaration list; returns the entries that are really new.
/// A slug that exists already is accepted when its name is the same, so a
/// document can be applied again after its first apply created the entry.
fn declared<'a>(kind: &str, new: impl Iterator<Item = (&'a String, &'a String)>, known: &HashMap<&str, &str>, errs: &mut Vec<String>) -> BTreeMap<String, String> {
    let mut created = BTreeMap::new();
    for (slug, name) in new {
        if !valid_slug(slug) {
            errs.push(format!("new {kind} {slug:?}: slug must be lowercase letters, digits and single hyphens"));
        } else if name.trim() != name || name.is_empty() {
            errs.push(format!("new {kind} {slug:?}: name {name:?} is empty or has stray spaces"));
        } else if name.starts_with(REVIEW) {
            errs.push(format!("new {kind} {slug:?}: name {name:?} is an unconfirmed placeholder; set the real name, or delete it and use the existing {kind}'s slug"));
        } else if let Some(existing) = known.get(slug.as_str()) {
            if existing != name {
                errs.push(format!("new {kind} {slug:?}: that slug already exists as {existing:?}; use it without declaring it, or choose another slug"));
            }
        } else {
            created.insert(slug.clone(), name.clone());
        }
    }
    created
}

/// Check `doc` and normalise it in place (timestamps as UTC, the default lock
/// time filled in). Every problem found is returned, each naming its entry.
pub fn validate(doc: &mut SeasonDoc, events: &[Event], teams: &[Team]) -> Result<Summary, Vec<String>> {
    let mut errs = Vec::new();
    let known_bowls: HashMap<&str, &str> = events.iter().map(|e| (e.slug.as_str(), e.name.as_str())).collect();
    let known_teams: HashMap<&str, &str> = teams.iter().map(|t| (t.slug.as_str(), t.name.as_str())).collect();
    let new_bowls = declared("bowl", doc.new_bowls.iter(), &known_bowls, &mut errs);
    let new_teams = declared("team", doc.new_teams.iter().map(|(slug, t)| (slug, &t.name)), &known_teams, &mut errs);
    for (slug, t) in &doc.new_teams {
        for (field, color) in [("color", &t.color), ("alt_color", &t.alt_color)] {
            if color.as_deref().is_some_and(|c| !valid_color(c)) {
                errs.push(format!("new team {slug:?}: {field} {:?} is not a #rrggbb color", color.as_deref().unwrap()));
            }
        }
    }
    let bowl_exists = |slug: &str| known_bowls.contains_key(slug) || doc.new_bowls.contains_key(slug);
    let team_exists = |slug: &str| known_teams.contains_key(slug) || doc.new_teams.contains_key(slug);

    if doc.games.is_empty() {
        errs.push("games: the document has no games".into());
    }
    let mut bowls_seen = HashSet::new();
    let mut external_seen: HashMap<i64, String> = HashMap::new();
    let mut teams_used: HashSet<&str> = HashSet::new();
    let game_slugs: HashSet<String> = doc.games.iter().map(|g| g.bowl.clone()).collect();
    for g in &mut doc.games {
        let at = format!("game {:?}", g.bowl);
        if !bowl_exists(&g.bowl) {
            errs.push(format!("{at}: unknown bowl; if it is new, add it to new_bowls, otherwise fix the slug"));
        }
        if !bowls_seen.insert(g.bowl.clone()) {
            errs.push(format!("{at}: listed more than once; a bowl has one game per season"));
        }
        match utc(&g.kickoff_at) {
            Some(t) => g.kickoff_at = t,
            None => errs.push(format!("{at}: kickoff_at {:?} is not an RFC 3339 timestamp such as 2025-12-20T17:00:00Z", g.kickoff_at)),
        }
        if g.fixed_wager == Some(0) {
            errs.push(format!("{at}: fixed_wager must be positive; leave it out for a confidence game"));
        }
        if let Some(id) = g.external_id {
            if let Some(first) = external_seen.insert(id, g.bowl.clone()) {
                errs.push(format!("{at}: external_id {id} is already used by game {first:?}"));
            }
        }
        if g.slots.len() != 2 {
            errs.push(format!("{at}: has {} slots; a game has exactly two", g.slots.len()));
        }
        for (i, s) in g.slots.iter().enumerate() {
            match (&s.team, &s.winner_of) {
                (Some(t), None) => {
                    if !doc.teams.contains_key(t) {
                        errs.push(format!("{at}, slot {i}: team {t:?} is not in teams; add it there"));
                    }
                }
                (None, Some(f)) => {
                    if f == &g.bowl {
                        errs.push(format!("{at}, slot {i}: a game cannot be fed by itself"));
                    } else if !game_slugs.contains(f.as_str()) {
                        errs.push(format!("{at}, slot {i}: winner_of {f:?} is not a game in this document"));
                    }
                    if s.seed.is_some() {
                        errs.push(format!("{at}, slot {i}: seed goes on a team slot, not a winner_of slot"));
                    }
                }
                _ => errs.push(format!("{at}, slot {i}: needs exactly one of team and winner_of")),
            }
        }
        if let [a, b] = g.slots.as_slice() {
            if a.team.is_some() && a.team == b.team {
                errs.push(format!("{at}: both slots are {:?}", a.team.as_ref().unwrap()));
            }
        }
    }
    for g in &doc.games {
        teams_used.extend(g.slots.iter().filter_map(|s| s.team.as_deref()));
    }
    for slug in doc.teams.keys() {
        if !team_exists(slug) {
            errs.push(format!("team {slug:?}: no such team; if it is new, add it to new_teams, otherwise fix the slug"));
        } else if !teams_used.contains(slug.as_str()) {
            errs.push(format!("team {slug:?}: plays in no game; delete it from teams (and new_teams)"));
        }
    }
    for slug in doc.new_teams.keys().filter(|s| !doc.teams.contains_key(*s)) {
        errs.push(format!("new team {slug:?}: declared but not in teams"));
    }
    for slug in doc.new_bowls.keys().filter(|s| !bowls_seen.contains(*s)) {
        errs.push(format!("new bowl {slug:?}: declared but no game uses it"));
    }

    check_feeders(doc, &mut errs);
    if doc.playoff_format == PlayoffFormat::Rank {
        check_bracket(doc, &mut errs);
    }

    let kickoffs: Vec<DateTime<Utc>> =
        doc.games.iter().filter_map(|g| g.kickoff_at.parse().ok()).collect();
    let earliest = kickoffs.iter().min().copied();
    match (&doc.locks_at, earliest) {
        (Some(text), Some(first)) => match utc(text) {
            Some(t) if t.parse::<DateTime<Utc>>().is_ok_and(|t| t > first) => {
                errs.push(format!("locks_at {text:?} is after the first kickoff; picks must lock before any game starts"));
            }
            Some(t) => doc.locks_at = Some(t),
            None => errs.push(format!("locks_at {text:?} is not an RFC 3339 timestamp")),
        },
        (None, Some(first)) => doc.locks_at = Some(first.format("%Y-%m-%dT%H:%M:%SZ").to_string()),
        _ => {}
    }
    if !errs.is_empty() {
        return Err(errs);
    }
    Ok(Summary {
        year: doc.year,
        locks_at: doc.locks_at.as_deref().and_then(|t| t.parse().ok()).expect("validated"),
        playoff_format: doc.playoff_format,
        games: doc.games.len(),
        playoff_games: doc.games.iter().filter(|g| g.playoff).count(),
        teams: doc.teams.len(),
        new_bowls,
        new_teams,
        replaces_draft: false,
    })
}

/// Each game feeds at most one slot, and feeders do not loop.
fn check_feeders(doc: &SeasonDoc, errs: &mut Vec<String>) {
    let mut fed_by: HashMap<&str, &str> = HashMap::new();
    let mut feeders: HashMap<&str, Vec<&str>> = HashMap::new();
    for g in &doc.games {
        for f in g.slots.iter().filter_map(|s| s.winner_of.as_deref()) {
            if let Some(first) = fed_by.insert(f, &g.bowl) {
                errs.push(format!("game {f:?}: its winner feeds both {first:?} and {:?}; a game feeds one slot", g.bowl));
            }
            feeders.entry(&g.bowl).or_default().push(f);
        }
    }
    // Walking from each game up its feeders reaches the start again only on a loop.
    for g in &doc.games {
        let mut stack: Vec<&str> = feeders.get(g.bowl.as_str()).cloned().unwrap_or_default();
        let mut seen = HashSet::new();
        while let Some(f) = stack.pop() {
            if f == g.bowl {
                errs.push(format!("game {:?}: feeds itself through a loop of winner_of slots", g.bowl));
                break;
            }
            if seen.insert(f) {
                stack.extend(feeders.get(f).into_iter().flatten());
            }
        }
    }
}

/// A ranked playoff is one tree of playoff games ending in a final: each team
/// enters once, at its first game, with a seed, and seeds run 1 to the field size.
fn check_bracket(doc: &SeasonDoc, errs: &mut Vec<String>) {
    let bracket: Vec<&GameEntry> = doc.games.iter().filter(|g| g.playoff).collect();
    if bracket.is_empty() {
        errs.push("playoff_format is rank but no game has playoff: true".into());
        return;
    }
    let in_bracket: HashSet<&str> = bracket.iter().map(|g| g.bowl.as_str()).collect();
    let mut fed: HashSet<&str> = HashSet::new();
    let mut entered: HashMap<&str, &str> = HashMap::new();
    let mut seeds: Vec<u16> = Vec::new();
    for g in &bracket {
        for (i, s) in g.slots.iter().enumerate() {
            let at = format!("playoff game {:?}, slot {i}", g.bowl);
            if let Some(f) = s.winner_of.as_deref() {
                if !in_bracket.contains(f) {
                    errs.push(format!("{at}: winner_of {f:?} is not a playoff game"));
                }
                fed.insert(f);
            }
            if let Some(t) = s.team.as_deref() {
                if let Some(first) = entered.insert(t, &g.bowl) {
                    errs.push(format!("{at}: team {t:?} already enters the bracket in {first:?}; here use winner_of that game"));
                }
                match s.seed {
                    Some(seed) => seeds.push(seed),
                    None => errs.push(format!("{at}: team {t:?} needs a seed")),
                }
            }
        }
    }
    let finals: Vec<&str> = in_bracket.iter().copied().filter(|g| !fed.contains(g)).collect();
    if finals.len() != 1 {
        let mut finals = finals;
        finals.sort_unstable();
        errs.push(format!("bracket must end in one final; games that feed no later game: {finals:?}"));
    }
    seeds.sort_unstable();
    let wanted: Vec<u16> = (1..=seeds.len() as u16).collect();
    if seeds != wanted && errs.iter().all(|e| !e.contains("needs a seed")) {
        let distinct: BTreeSet<_> = seeds.iter().collect();
        errs.push(format!("bracket seeds must be 1 to {} with none repeated; found {:?} ({} distinct)", seeds.len(), seeds, distinct.len()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{EventId, TeamId};
    use serde_json::{json, Value};

    fn catalog() -> (Vec<Event>, Vec<Team>) {
        let events = ["rose", "sugar", "peach"]
            .iter()
            .enumerate()
            .map(|(i, s)| Event { id: EventId(i as i64), slug: s.to_string(), name: format!("{s} Bowl") })
            .collect();
        let teams = ["a", "b", "c", "d", "e"]
            .iter()
            .enumerate()
            .map(|(i, s)| Team { id: TeamId(i as i64), slug: s.to_string(), name: s.to_uppercase() })
            .collect();
        (events, teams)
    }

    /// Two bowls, then a final fed by both; a ranked bracket of four teams.
    fn bracket() -> Value {
        json!({
            "year": 2030, "playoff_format": "rank",
            "new_bowls": {"final": "Final"},
            "teams": {"a": {"rank": 1}, "b": {}, "c": {}, "d": {}},
            "games": [
                {"bowl": "rose", "kickoff_at": "2030-12-20T17:00:00Z", "playoff": true,
                 "slots": [{"team": "a", "seed": 1}, {"team": "d", "seed": 4}]},
                {"bowl": "sugar", "kickoff_at": "2030-12-20T20:00:00-05:00", "playoff": true,
                 "slots": [{"team": "b", "seed": 2}, {"team": "c", "seed": 3}]},
                {"bowl": "final", "kickoff_at": "2031-01-01T00:00:00Z", "playoff": true,
                 "slots": [{"winner_of": "rose"}, {"winner_of": "sugar"}]},
            ]
        })
    }

    fn problems(doc: Value) -> Vec<String> {
        let mut doc: SeasonDoc = serde_json::from_value(doc).unwrap();
        let (events, teams) = catalog();
        validate(&mut doc, &events, &teams).err().unwrap_or_default()
    }

    #[test]
    fn a_consistent_bracket_is_accepted_and_normalised() {
        let mut doc: SeasonDoc = serde_json::from_value(bracket()).unwrap();
        let (events, teams) = catalog();
        let summary = validate(&mut doc, &events, &teams).unwrap();
        assert_eq!((summary.games, summary.playoff_games, summary.teams), (3, 3, 4));
        assert_eq!(summary.new_bowls.keys().collect::<Vec<_>>(), ["final"]);
        // The default lock is the earliest kickoff, written in UTC.
        assert_eq!(doc.locks_at.as_deref(), Some("2030-12-20T17:00:00Z"));
        assert_eq!(doc.games[1].kickoff_at, "2030-12-21T01:00:00Z");
    }

    #[test]
    fn each_mistake_names_its_entry_and_the_fix() {
        type Edit = fn(&mut Value);
        let cases: [(&str, Edit, &str); 23] = [
            ("unknown bowl", |d| d["games"][0]["bowl"] = json!("rsoe"), "game \"rsoe\": unknown bowl"),
            ("duplicate game", |d| d["games"][1]["bowl"] = json!("rose"), "listed more than once"),
            ("repeated external_id", |d| { d["games"][0]["external_id"] = json!(5); d["games"][1]["external_id"] = json!(5); }, "game \"sugar\": external_id 5 is already used by game \"rose\""),
            ("undeclared team", |d| d["games"][0]["slots"][1]["team"] = json!("zz"), "team \"zz\" is not in teams"),
            ("team not in the database", |d| { d["teams"]["zz"] = json!({}); }, "team \"zz\": no such team"),
            ("unused team", |d| d["teams"]["e"] = json!({}), "plays in no game"),
            ("missing feeder", |d| d["games"][2]["slots"][0]["winner_of"] = json!("nope"), "winner_of \"nope\" is not a game"),
            ("three slots", |d| d["games"][0]["slots"].as_array_mut().unwrap().push(json!({"team": "b"})), "has 3 slots"),
            ("one slot", |d| { d["games"][0]["slots"].as_array_mut().unwrap().pop(); }, "has 1 slots"),
            ("empty slot", |d| d["games"][0]["slots"][0] = json!({}), "exactly one of team and winner_of"),
            ("bad kickoff", |d| d["games"][0]["kickoff_at"] = json!("tomorrow"), "kickoff_at \"tomorrow\""),
            ("bad lock", |d| d["locks_at"] = json!("soon"), "locks_at \"soon\""),
            ("late lock", |d| d["locks_at"] = json!("2030-12-25T00:00:00Z"), "after the first kickoff"),
            ("zero wager", |d| d["games"][0]["fixed_wager"] = json!(0), "fixed_wager must be positive"),
            ("feeder cycle", |d| d["games"][0]["slots"][0] = json!({"winner_of": "final"}), "loop"),
            ("two feeds", |d| d["games"][1]["slots"][0] = json!({"winner_of": "rose"}), "feeds both"),
            ("seed missing", |d| { d["games"][0]["slots"][0].as_object_mut().unwrap().remove("seed"); }, "needs a seed"),
            ("seed repeated", |d| d["games"][0]["slots"][1]["seed"] = json!(3), "seeds must be 1 to 4"),
            ("team enters twice", |d| d["games"][2]["slots"][0] = json!({"team": "a", "seed": 1}), "already enters the bracket"),
            ("bad color", |d| d["new_teams"] = json!({"zz": {"name": "Zed", "color": "red"}}), "new team \"zz\": color \"red\" is not a #rrggbb color"),
            ("short alt color", |d| d["new_teams"] = json!({"zz": {"name": "Zed", "alt_color": "#fff"}}), "alt_color \"#fff\" is not"),
            ("placeholder name", |d| d["new_bowls"]["final"] = json!("REVIEW: Final"), "unconfirmed placeholder"),
            ("no bracket", |d| for g in d["games"].as_array_mut().unwrap() { g["playoff"] = json!(false) }, "no game has playoff"),
        ];
        for (what, edit, expected) in cases {
            let mut doc = bracket();
            edit(&mut doc);
            let found = problems(doc);
            assert!(found.iter().any(|p| p.contains(expected)), "{what}: wanted {expected:?} in {found:?}");
        }
    }

    #[test]
    fn declaring_an_existing_slug_needs_the_same_name() {
        let mut doc = bracket();
        doc["new_bowls"]["rose"] = json!("rose Bowl");
        assert!(problems(doc.clone()).iter().all(|p| !p.contains("already exists")), "same name is accepted");
        doc["new_bowls"]["rose"] = json!("Other");
        assert!(problems(doc).iter().any(|p| p.contains("already exists as \"rose Bowl\"")));
    }
}
