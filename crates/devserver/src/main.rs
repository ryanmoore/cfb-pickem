use std::path::PathBuf;
use std::process::ExitCode;

use pickem_devserver::import::import;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let [_, legacy, out] = args.as_slice() else {
        eprintln!("usage: devserver <legacy.sqlite3> <out.sqlite3>");
        return ExitCode::from(2);
    };
    match import(&PathBuf::from(legacy), &PathBuf::from(out)) {
        Ok(_) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("import failed: {e}");
            ExitCode::FAILURE
        }
    }
}
