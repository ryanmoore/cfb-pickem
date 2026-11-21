//! Draft season documents from a saved CollegeFootballData response
//! (`GET /games?year=Y&seasonType=postseason`).
//!
//! Matching is deliberately conservative: a bowl or team that is not
//! confidently matched becomes a declared-new entry whose name starts with
//! [`REVIEW`], which validation refuses until a person resolves it. Playoff
//! games carry the teams and seeds the response knows; wiring them into a
//! bracket is left to the reviewer, and validation refuses a ranked bracket
//! that is not wired.

use std::collections::{BTreeMap, BTreeSet};

use chrono::DateTime;
use pickem_core::season_doc::{valid_color, GameEntry, NewTeam, SeasonDoc, SlotEntry, TeamEntry, REVIEW};
use pickem_core::{Event, PlayoffFormat, Team};
use serde::Deserialize;

use crate::import::slugify;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceGame {
    id: i64,
    season: u16,
    start_date: String,
    notes: Option<String>,
    home_team: String,
    away_team: String,
    home_classification: Option<String>,
    away_classification: Option<String>,
    playoff: Option<SourcePlayoff>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourcePlayoff {
    home_seed: Option<u16>,
    away_seed: Option<u16>,
}

/// One entry of the source's teams list. A color the source does not have may
/// come as `#null`, which is not a color.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceTeam {
    school: String,
    mascot: Option<String>,
    color: Option<String>,
    alternate_color: Option<String>,
}

pub struct Draft {
    pub doc: SeasonDoc,
    pub matched_bowls: usize,
    pub matched_teams: usize,
    /// What a person still has to resolve, one line each.
    pub review: Vec<String>,
}

/// Lowercase words: letters and digits kept, hyphens and spaces separate,
/// everything else (apostrophes, ampersands, parentheses) dropped.
fn words(s: &str) -> Vec<String> {
    let kept: String = s
        .chars()
        .filter_map(|c| match c {
            c if c.is_alphanumeric() => Some(c.to_lowercase().next().unwrap_or(c)),
            c if c.is_whitespace() || c == '-' => Some(' '),
            _ => None,
        })
        .collect();
    kept.split_whitespace().map(str::to_string).collect()
}

fn contains_run(haystack: &[String], needle: &[String]) -> bool {
    !needle.is_empty() && haystack.windows(needle.len()).any(|w| w == needle)
}

/// The existing bowl the source's `notes` string names, if exactly one fits best.
/// One name contained in the other counts, so a sponsor that came or went
/// does not break the match; a contained name must be at least two words.
fn match_bowl<'a>(notes: &str, events: &'a [Event]) -> Option<&'a Event> {
    let notes = words(notes);
    let mut best: Vec<(usize, &Event)> = Vec::new();
    for e in events {
        let name = words(&e.name);
        let overlap = if contains_run(&notes, &name) {
            name.len()
        } else if notes.len() >= 2 && contains_run(&name, &notes) {
            notes.len()
        } else {
            continue;
        };
        best.push((overlap, e));
    }
    let top = best.iter().map(|(n, _)| *n).max()?;
    let mut top_events = best.into_iter().filter(|(n, _)| *n == top);
    let first = top_events.next()?.1;
    top_events.next().is_none().then_some(first)
}

/// The existing team named exactly `school`, ignoring case. A school the
/// source spells differently, or one whose stored name carries more words, is
/// no match: a near match would attach a pick to the wrong team.
fn match_team<'a>(school: &str, teams: &'a [Team]) -> Option<&'a Team> {
    teams.iter().find(|t| t.name.to_lowercase() == school.to_lowercase())
}

/// The season's own name for a bowl: the notes without a playoff round prefix
/// ("College Football Playoff Semifinal at the ...") or a presenting sponsor.
fn sponsored_name(notes: &str) -> String {
    let named = match notes.starts_with("College Football Playoff") {
        true => notes.split_once(" at the ").map_or(notes, |(_, bowl)| bowl),
        false => notes,
    };
    let cut = named.to_ascii_lowercase().find(" presented by ").unwrap_or(named.len());
    named[..cut].trim().to_string()
}

fn is_playoff(notes: &str) -> bool {
    notes.starts_with("College Football Playoff") || notes.starts_with("CFP ")
}

/// Build the draft for the FBS games of `response` that kick off on or after
/// `from` (`YYYY-MM-DD`, UTC). `source_teams`, the source's teams list, fills
/// mascot and colors on the teams the draft declares.
pub fn draft(response: &str, events: &[Event], teams: &[Team], source_teams: Option<&str>, from: Option<&str>) -> Result<Draft, String> {
    let source_teams: Vec<SourceTeam> = match source_teams {
        Some(text) => serde_json::from_str(text).map_err(|e| format!("not a teams list: {e}"))?,
        None => Vec::new(),
    };
    let mut games: Vec<SourceGame> = serde_json::from_str(response).map_err(|e| format!("not a games response: {e}"))?;
    games.retain(|g| {
        g.home_classification.as_deref() == Some("fbs")
            && g.away_classification.as_deref() == Some("fbs")
            && from.is_none_or(|d| g.start_date.as_str() >= d)
    });
    games.sort_by(|a, b| (&a.start_date, a.id).cmp(&(&b.start_date, b.id)));
    let Some(year) = games.first().map(|g| g.season) else {
        return Err("no FBS games in the response".into());
    };

    let mut doc = SeasonDoc {
        year,
        locks_at: None,
        playoff_format: PlayoffFormat::Fixed,
        practice: false,
        new_bowls: BTreeMap::new(),
        new_teams: BTreeMap::new(),
        teams: BTreeMap::new(),
        games: Vec::new(),
    };
    let (mut matched_bowls, mut review) = (0, Vec::new());
    let mut team_slugs: BTreeMap<String, String> = BTreeMap::new();
    let mut first_rounds = 0u8;
    let mut matched_teams = BTreeSet::new();
    for g in &games {
        let notes = g.notes.clone().unwrap_or_default();
        let kickoff = DateTime::parse_from_rfc3339(&g.start_date)
            .map_err(|e| format!("game {}: bad startDate {:?}: {e}", g.id, g.start_date))?
            .to_utc()
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string();
        let playoff = is_playoff(&notes);

        let (bowl, name) = if playoff && notes.contains("First Round") {
            let letter = char::from(b'A' + first_rounds);
            first_rounds += 1;
            let (slug, name) = (format!("cfp-first-round-{}", letter.to_ascii_lowercase()), format!("CFP First Round {letter}"));
            if !events.iter().any(|e| e.slug == slug) {
                doc.new_bowls.insert(slug.clone(), name);
            }
            (slug, None)
        } else if let Some(event) = match_bowl(&notes, events) {
            matched_bowls += 1;
            let sponsored = sponsored_name(&notes);
            (event.slug.clone(), (words(&sponsored) != words(&event.name)).then_some(sponsored))
        } else {
            let sponsored = sponsored_name(&notes);
            let slug = slugify(&sponsored);
            doc.new_bowls.insert(slug.clone(), format!("{REVIEW} {sponsored}"));
            review.push(format!("bowl {slug:?} ({notes:?}): no existing bowl matched; give it its own name or point it at an existing bowl"));
            (slug, Some(sponsored))
        };

        let mut slots = Vec::new();
        for (school, seed) in [
            (&g.home_team, g.playoff.as_ref().and_then(|p| p.home_seed)),
            (&g.away_team, g.playoff.as_ref().and_then(|p| p.away_seed)),
        ] {
            let slug = team_slugs
                .entry(school.clone())
                .or_insert_with(|| match match_team(school, teams) {
                    Some(t) => {
                        matched_teams.insert(t.slug.clone());
                        t.slug.clone()
                    }
                    None => {
                        let slug = slugify(school);
                        let found = source_teams.iter().find(|t| t.school.to_lowercase() == school.to_lowercase());
                        let color = |c: Option<&String>| c.filter(|c| valid_color(c)).cloned();
                        doc.new_teams.insert(
                            slug.clone(),
                            NewTeam {
                                name: format!("{REVIEW} {}", school.trim()),
                                mascot: found.and_then(|t| t.mascot.clone()),
                                color: color(found.and_then(|t| t.color.as_ref())),
                                alt_color: color(found.and_then(|t| t.alternate_color.as_ref())),
                            },
                        );
                        review.push(format!("team {slug:?} ({school:?}): no existing team has exactly this name; confirm the name or point it at an existing team"));
                        slug
                    }
                })
                .clone();
            doc.teams.entry(slug.clone()).or_insert_with(TeamEntry::default);
            slots.push(SlotEntry { team: Some(slug), winner_of: None, seed });
        }
        doc.games.push(GameEntry {
            bowl,
            name,
            kickoff_at: kickoff,
            external_id: Some(g.id),
            fixed_wager: None,
            playoff,
            slots,
        });
    }
    let playoff_games = doc.games.iter().filter(|g| g.playoff).count();
    if playoff_games > 0 {
        doc.playoff_format = PlayoffFormat::Rank;
        review.push(format!(
            "playoff: {playoff_games} games are listed with the teams the source lists; wire the bracket (a team enters once, with its seed; later rounds use winner_of)"
        ));
    }
    Ok(Draft { doc, matched_bowls, matched_teams: matched_teams.len(), review })
}

#[cfg(test)]
mod tests {
    use super::*;
    use pickem_core::{EventId, TeamId};

    fn events(names: &[(&str, &str)]) -> Vec<Event> {
        names.iter().enumerate().map(|(i, (slug, name))| Event { id: EventId(i as i64), slug: slug.to_string(), name: name.to_string() }).collect()
    }

    fn teams(names: &[&str]) -> Vec<Team> {
        names.iter().enumerate().map(|(i, name)| Team { id: TeamId(i as i64), slug: format!("t{i}"), name: name.to_string() }).collect()
    }

    #[test]
    fn bowls_match_through_sponsor_changes_and_stay_unmatched_when_unsure() {
        let all = events(&[
            ("la", "LA Bowl"),
            ("citrus", "Citrus Bowl"),
            ("music-city", "Music City Bowl"),
            ("liberty", "Liberty Bowl"),
            ("rate", "Guaranteed Rate Bowl"),
            ("cotton", "Cotton Bowl"),
            ("nc", "National Championship"),
        ]);
        let slug = |notes: &str| match_bowl(notes, &all).map(|e| e.slug.as_str());
        for (notes, expected) in [
            ("Cheez-It Citrus Bowl", Some("citrus")),
            ("Liberty Mutual Music City Bowl", Some("music-city")),
            ("AutoZone Liberty Bowl", Some("liberty")),
            ("Rate Bowl", Some("rate")),
            ("College Football Playoff Quarterfinal at the Goodyear Cotton Bowl Classic", Some("cotton")),
            ("College Football Playoff National Championship Presented by AT&T", Some("nc")),
            ("Bucked Up LA Bowl", Some("la")),
            ("Brand New Bowl", None),
            ("Bowl", None),
        ] {
            assert_eq!(slug(notes), expected, "{notes}");
        }
        // Two equally good matches are no match.
        let twin = events(&[("a", "Gator Bowl"), ("b", "Gator Bowl")]);
        assert!(match_bowl("TaxSlayer Gator Bowl", &twin).is_none());
    }

    #[test]
    fn teams_match_the_whole_school_name_ignoring_case() {
        let all = teams(&["Washington", "Washington State", "Miami", "Miami (OH)"]);
        let name = |school: &str| match_team(school, &all).map(|t| t.name.as_str());
        for (school, expected) in [
            ("Washington", Some("Washington")),
            ("washington state", Some("Washington State")),
            ("MIAMI (OH)", Some("Miami (OH)")),
            ("Wash", None),
            ("Washington Huskies", None),
            ("Troy", None),
        ] {
            assert_eq!(name(school), expected, "{school}");
        }
    }

    #[test]
    fn only_fbs_games_from_the_cutoff_and_unmatched_entries_are_marked() {
        let response = r#"[
          {"id": 1, "season": 2030, "startDate": "2030-12-20T01:00:00.000Z", "notes": "Alpha Bowl",
           "homeTeam": "North", "awayTeam": "South", "homeClassification": "fbs", "awayClassification": "fbs"},
          {"id": 2, "season": 2030, "startDate": "2030-12-22T01:00:00.000Z", "notes": "Beta Bowl",
           "homeTeam": "North", "awayTeam": "East", "homeClassification": "fbs", "awayClassification": "fbs"},
          {"id": 3, "season": 2030, "startDate": "2030-12-23T01:00:00.000Z", "notes": "Gamma Bowl",
           "homeTeam": "West", "awayTeam": "East", "homeClassification": "fbs", "awayClassification": "fcs"}
        ]"#;
        let all_events = events(&[("beta", "Beta Bowl")]);
        let all_teams = teams(&["north"]);
        let source = r##"[{"school": "East", "mascot": "Hawks", "color": "#102030", "alternateColor": "#null"},
                          {"school": "South", "mascot": "Owls", "color": "#ffffff", "alternateColor": null}]"##;
        let both = draft(response, &all_events, &all_teams, None, None).unwrap();
        assert_eq!(both.doc.games.len(), 2);
        let later = draft(response, &all_events, &all_teams, Some(source), Some("2030-12-21")).unwrap();
        assert_eq!(later.doc.games.len(), 1);
        assert_eq!((later.matched_bowls, later.matched_teams), (1, 1));
        assert_eq!(later.doc.new_teams.keys().collect::<Vec<_>>(), ["east"]);
        let east = &later.doc.new_teams["east"];
        assert_eq!((east.name.as_str(), east.mascot.as_deref(), east.color.as_deref(), east.alt_color.as_deref()), ("REVIEW: East", Some("Hawks"), Some("#102030"), None));
        assert!(both.doc.new_teams["south"].mascot.is_none(), "without a teams list nothing is filled");
        assert_eq!(later.review.len(), 1);
    }
}
