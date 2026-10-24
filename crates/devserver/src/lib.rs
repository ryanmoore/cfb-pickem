//! Native adapter for `pickem-core`: [`core::Storage`] over a local SQLite
//! file, plus the importer that fills it from the legacy Django database.

pub mod import;
pub mod storage;

pub use storage::{create, SqliteStorage};
