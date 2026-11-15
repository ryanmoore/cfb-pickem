//! Rules of the confidence pool.
//!
//! This crate compiles without a wasm runtime, browser, or network, so it can
//! be tested in environments without access to those. Platform concerns live
//! behind [`storage::Storage`].

pub mod access;
pub mod api;
pub mod bracket;
pub mod model;
pub mod scoring;
pub mod sigv4;
pub mod sql;
pub mod storage;

pub use model::*;
pub use scoring::{standings, validate_confidence_permutation, PermutationError, Standing};
pub use storage::Storage;
