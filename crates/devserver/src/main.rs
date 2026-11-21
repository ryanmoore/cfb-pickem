use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use pickem_core::season_doc::{load_season, LoadError, SeasonDoc};
use pickem_core::Storage;
use pickem_devserver::draft::draft;
use pickem_devserver::import::import;
use pickem_devserver::serve::{dist_dir, now, serve, Config};
use pickem_devserver::SqliteStorage;

const DEFAULT_PORT: u16 = 8787;

const USAGE: &str = "usage:
  devserver import <legacy.sqlite3> <out.sqlite3>
  devserver serve <db.sqlite3>
  devserver attach-email <db.sqlite3> <legacy_username> <email>
  devserver draft-season <games.json> <db.sqlite3> [--from YYYY-MM-DD] [--teams teams.json]   (document on stdout)
  devserver apply-season <season.json> <db.sqlite3> [--dry-run]

env: PICKEM_EMAIL_KEY (HMAC key for email digests), PICKEM_DEV_EMAIL (serve: sign every request in as this address), PICKEM_DEV_AUTOMATION (serve: act as the automation instead), PICKEM_BIND (serve: listen address, default 127.0.0.1), PICKEM_PORT (serve: default 8787)";

fn email_key() -> Vec<u8> {
    env::var("PICKEM_EMAIL_KEY").unwrap_or_else(|_| "dev-email-key".into()).into_bytes()
}

fn draft_season(response: &str, db: &str, flags: &[&str]) -> Result<(), String> {
    let (mut from, mut teams_file) = (None, None);
    for pair in flags.chunks(2) {
        match pair {
            ["--from", date] => from = Some(*date),
            ["--teams", file] => teams_file = Some(*file),
            _ => return Err(USAGE.into()),
        }
    }
    let source_teams = teams_file.map(|f| fs::read_to_string(f).map_err(|e| format!("{f}: {e}"))).transpose()?;
    let storage = SqliteStorage::open(&PathBuf::from(db)).map_err(|e| e.to_string())?;
    let response = fs::read_to_string(response).map_err(|e| format!("{response}: {e}"))?;
    let (events, teams) = pollster::block_on(async { (storage.events().await, storage.teams().await) });
    let draft = draft(&response, &events.map_err(|e| e.to_string())?, &teams.map_err(|e| e.to_string())?, source_teams.as_deref(), from)?;
    println!("{}", serde_json::to_string_pretty(&draft.doc).expect("documents serialise"));
    eprintln!("matched {} bowls and {} teams automatically", draft.matched_bowls, draft.matched_teams);
    for line in &draft.review {
        eprintln!("REVIEW {line}");
    }
    Ok(())
}

fn apply_season(file: &str, db: &str, dry_run: bool) -> Result<(), String> {
    let mut doc: SeasonDoc = serde_json::from_str(&fs::read_to_string(file).map_err(|e| format!("{file}: {e}"))?)
        .map_err(|e| format!("{file}: {e}"))?;
    let storage = SqliteStorage::open(&PathBuf::from(db)).map_err(|e| e.to_string())?;
    match pollster::block_on(load_season(&storage, &mut doc, dry_run, now())).map_err(|e| e.to_string())? {
        Ok(summary) => {
            println!("{}", serde_json::to_string_pretty(&summary).expect("summaries serialise"));
            Ok(())
        }
        Err(LoadError::Published) => Err(format!("{}: that season is published; only a draft can be replaced", doc.year)),
        Err(LoadError::Invalid(problems)) => Err(problems.iter().map(|p| format!("- {p}")).collect::<Vec<_>>().join("\n")),
    }
}

fn run(args: &[String]) -> Result<(), String> {
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    match args.as_slice() {
        ["import", legacy, out] => import(&PathBuf::from(legacy), &PathBuf::from(out))
            .map(drop)
            .map_err(|e| format!("import failed: {e}")),
        ["attach-email", db, username, email] => {
            let storage = SqliteStorage::open(&PathBuf::from(db)).map_err(|e| e.to_string())?;
            let hash = storage
                .attach_email(&email_key(), username, email)
                .map_err(|e| format!("no player with legacy username {username:?} ({e})"))?;
            println!("{hash}");
            Ok(())
        }
        ["draft-season", response, db, flags @ ..] => draft_season(response, db, flags),
        ["apply-season", file, db] => apply_season(file, db, false),
        ["apply-season", file, db, "--dry-run"] => apply_season(file, db, true),
        ["serve", db] => {
            let storage = SqliteStorage::open(&PathBuf::from(db)).map_err(|e| e.to_string())?;
            let config = Config {
                dev_email: env::var("PICKEM_DEV_EMAIL").ok(),
                dev_automation: env::var_os("PICKEM_DEV_AUTOMATION").is_some(),
                email_key: email_key(),
                dist: dist_dir(),
            };
            let host = env::var("PICKEM_BIND").unwrap_or_else(|_| "127.0.0.1".into());
            let port = env::var("PICKEM_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(DEFAULT_PORT);
            serve(&storage, &config, &host, port).map_err(|e| e.to_string())
        }
        _ => Err(USAGE.into()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}
