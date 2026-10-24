//! Local HTTP server: the shared API from `pickem-core` over SQLite, plus the
//! built frontend. Single-threaded because storage futures are not `Send`.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::DateTime;
use pickem_core::api::{route, Reply};
use tiny_http::{Header, Method, Request, Response};

use crate::storage::SqliteStorage;

/// What a request is authenticated as and keyed with; fixed for the process.
pub struct Config {
    /// Every request is treated as signed in as this address.
    pub dev_email: Option<String>,
    pub email_key: Vec<u8>,
    pub dist: PathBuf,
}

pub fn dist_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../frontend/dist")
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name, value).expect("static header")
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript",
        Some("css") => "text/css",
        Some("json" | "map") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// A file under `dist`, falling back to `index.html` for client-side routes.
fn static_file(dist: &Path, url_path: &str) -> Option<(Vec<u8>, &'static str)> {
    let rel = url_path.trim_start_matches('/');
    let candidate = dist.join(rel);
    let canonical = candidate.canonicalize().ok();
    let path = match canonical {
        Some(p) if p.starts_with(dist.canonicalize().ok()?) && p.is_file() => p,
        _ => dist.join("index.html"),
    };
    Some((fs::read(&path).ok()?, content_type(&path)))
}

fn respond(request: Request, status: u16, content_type: &str, body: Vec<u8>) {
    let response = Response::from_data(body)
        .with_status_code(status)
        .with_header(header("Content-Type", content_type))
        .with_header(header("X-Robots-Tag", "noindex"));
    if let Err(e) = request.respond(response) {
        eprintln!("respond failed: {e}");
    }
}

fn handle(storage: &SqliteStorage, config: &Config, request: Request) {
    let method = match request.method() {
        Method::Get => "GET",
        _ => "OTHER",
    };
    let path = request.url().split('?').next().unwrap_or("/").to_string();

    if path == "/login" {
        let response = Response::empty(302)
            .with_header(header("Location", "/"))
            .with_header(header("X-Robots-Tag", "noindex"));
        let _ = request.respond(response);
        return;
    }
    if path == "/api" || path.starts_with("/api/") {
        let secs = SystemTime::now().duration_since(UNIX_EPOCH).expect("clock").as_secs();
        let now = DateTime::from_timestamp(secs as i64, 0).expect("in range");
        let identity = config.dev_email.as_deref();
        let reply = pollster::block_on(route(storage, method, &path, identity, &config.email_key, now))
            .unwrap_or_else(|e| {
                eprintln!("storage error: {e:?}");
                Reply::error(500, "internal error")
            });
        respond(request, reply.status, "application/json", reply.body.into_bytes());
        return;
    }
    match static_file(&config.dist, &path) {
        Some((body, ct)) => respond(request, 200, ct, body),
        None => respond(request, 404, "text/plain", b"frontend not built".to_vec()),
    }
}

pub fn serve(storage: &SqliteStorage, config: &Config, port: u16) -> std::io::Result<()> {
    let server = tiny_http::Server::http(("127.0.0.1", port)).map_err(std::io::Error::other)?;
    eprintln!("listening on http://127.0.0.1:{port}");
    for request in server.incoming_requests() {
        handle(storage, config, request);
    }
    Ok(())
}
