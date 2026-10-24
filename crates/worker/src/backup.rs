//! Nightly D1 -> S3 backup.
//!
//! D1 exports through Cloudflare's REST API: start a polling export, re-POST
//! with the returned bookmark until it completes, then download the SQL from
//! the signed URL and PUT it to S3. The export auto-cancels if it is not
//! polled continuously.

use std::time::Duration;

use chrono::{DateTime, Utc};
use pickem_core::sigv4::{sign_put, PutObject};
use serde::Deserialize;
use serde_json::json;
use wasm_bindgen::JsValue;
use worker::{Delay, Env, Error, Fetch, Headers, Method, Request, RequestInit, Result};

const MAX_POLLS: u32 = 60;
const POLL_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Deserialize)]
struct Envelope {
    success: bool,
    #[serde(default)]
    errors: serde_json::Value,
    result: Option<Export>,
}

#[derive(Deserialize)]
struct Export {
    status: String,
    at_bookmark: Option<String>,
    current_bookmark: Option<String>,
    error: Option<String>,
    result: Option<ExportFile>,
}

#[derive(Deserialize)]
struct ExportFile {
    signed_url: String,
}

fn var(env: &Env, name: &str) -> Result<String> {
    env.var(name).map(|v| v.to_string())
}

async fn poll(url: &str, token: &str, bookmark: Option<&str>) -> Result<Export> {
    let mut body = json!({ "output_format": "polling" });
    if let Some(b) = bookmark {
        body["current_bookmark"] = json!(b);
    }
    let headers = Headers::new();
    headers.set("Authorization", &format!("Bearer {token}"))?;
    headers.set("Content-Type", "application/json")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(JsValue::from_str(&body.to_string())));
    let mut resp = Fetch::Request(Request::new_with_init(url, &init)?).send().await?;
    let status = resp.status_code();
    let text = resp.text().await?;
    let envelope: Envelope = serde_json::from_str(&text)
        .map_err(|_| Error::RustError(format!("export API answered {status}: {text}")))?;
    match envelope.result {
        Some(export) if envelope.success => Ok(export),
        _ => Err(Error::RustError(format!("export API answered {status}: {}", envelope.errors))),
    }
}

async fn export_signed_url(env: &Env) -> Result<String> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/d1/database/{}/export",
        var(env, "CF_ACCOUNT_ID")?,
        var(env, "D1_DATABASE_ID")?
    );
    let token = env.secret("D1_EXPORT_TOKEN")?.to_string();
    let mut bookmark: Option<String> = None;
    for _ in 0..MAX_POLLS {
        let export = poll(&url, &token, bookmark.as_deref()).await?;
        match export.status.as_str() {
            "complete" => {
                return export
                    .result
                    .map(|f| f.signed_url)
                    .ok_or_else(|| Error::RustError("export complete without a signed_url".into()))
            }
            "error" => {
                return Err(Error::RustError(format!(
                    "export failed: {}",
                    export.error.unwrap_or_default()
                )))
            }
            _ => bookmark = export.current_bookmark.or(export.at_bookmark).or(bookmark),
        }
        Delay::from(POLL_INTERVAL).await;
    }
    Err(Error::RustError(format!("export still running after {MAX_POLLS} polls")))
}

pub async fn run(env: &Env, now: DateTime<Utc>) -> Result<()> {
    let dump_url = export_signed_url(env).await?;
    let dump = Fetch::Url(dump_url.parse().map_err(|_| Error::RustError("bad signed_url".into()))?)
        .send()
        .await?
        .bytes()
        .await?;

    let prefix = var(env, "S3_PREFIX")?;
    let key = format!(
        "{}pickem-{}.sql",
        if prefix.is_empty() { String::new() } else { format!("{}/", prefix.trim_matches('/')) },
        now.format("%Y-%m-%d")
    );
    let signed = sign_put(&PutObject {
        access_key_id: &env.secret("AWS_ACCESS_KEY_ID")?.to_string(),
        secret_access_key: &env.secret("AWS_SECRET_ACCESS_KEY")?.to_string(),
        region: &var(env, "S3_REGION")?,
        bucket: &var(env, "S3_BUCKET")?,
        key: &key,
        now,
    });
    let headers = Headers::new();
    for (name, value) in &signed.headers {
        headers.set(name, value)?;
    }
    let mut init = RequestInit::new();
    init.with_method(Method::Put)
        .with_headers(headers)
        .with_body(Some(js_sys::Uint8Array::from(dump.as_slice()).into()));
    let mut resp = Fetch::Request(Request::new_with_init(&signed.url, &init)?).send().await?;
    if resp.status_code() != 200 {
        return Err(Error::RustError(format!(
            "S3 PUT answered {}: {}",
            resp.status_code(),
            resp.text().await.unwrap_or_default()
        )));
    }
    Ok(())
}
