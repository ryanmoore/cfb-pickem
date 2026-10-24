use std::env;
use std::path::PathBuf;
use std::process::ExitCode;

use pickem_devserver::import::import;
use pickem_devserver::serve::{dist_dir, serve, Config};
use pickem_devserver::SqliteStorage;

const PORT: u16 = 8787;

const USAGE: &str = "usage:
  devserver import <legacy.sqlite3> <out.sqlite3>
  devserver serve <db.sqlite3>   (port 8787)
  devserver attach-email <db.sqlite3> <legacy_username> <email>

env: PICKEM_EMAIL_KEY (HMAC key for email digests), PICKEM_DEV_EMAIL (serve: sign every request in as this address)";

fn email_key() -> Vec<u8> {
    env::var("PICKEM_EMAIL_KEY").unwrap_or_else(|_| "dev-email-key".into()).into_bytes()
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
        ["serve", db] => {
            let storage = SqliteStorage::open(&PathBuf::from(db)).map_err(|e| e.to_string())?;
            let config = Config {
                dev_email: env::var("PICKEM_DEV_EMAIL").ok(),
                email_key: email_key(),
                dist: dist_dir(),
            };
            serve(&storage, &config, PORT).map_err(|e| e.to_string())
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
