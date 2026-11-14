use std::path::Path;

use pickem_core::sql;
use pickem_devserver::create;

#[test]
fn every_statement_prepares_against_the_migrated_schema() {
    let storage = create(Path::new(":memory:")).unwrap();
    for stmt in sql::ALL {
        storage.conn.prepare(stmt).unwrap_or_else(|e| panic!("{stmt}: {e}"));
    }
}
