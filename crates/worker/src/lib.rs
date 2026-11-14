//! Cloudflare Worker adapter: the shared API from `pickem-core` over D1, with
//! identity from Cloudflare Access and a nightly backup to S3.

mod backup;
mod d1;
mod identity;

use chrono::{DateTime, Utc};
use pickem_core::api::{route, Reply, Request as ApiRequest};
use worker::{
    console_error, event, Context, Date, Env, Headers, Request, Response, Result, ScheduleContext,
    ScheduledEvent,
};

fn now() -> DateTime<Utc> {
    DateTime::from_timestamp_millis(Date::now().as_millis() as i64).expect("in range")
}

fn json_response(reply: Reply) -> Result<Response> {
    let headers = Headers::new();
    headers.set("Content-Type", "application/json")?;
    headers.set("X-Robots-Tag", "noindex")?;
    Ok(Response::from_bytes(reply.body.into_bytes())?
        .with_headers(headers)
        .with_status(reply.status))
}

/// Only `/login` and `/api/*` reach the Worker; everything else is served by
/// the assets binding before any code runs.
#[event(fetch)]
async fn fetch(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
    if url.path() == "/login" {
        let headers = Headers::new();
        headers.set("Location", "/")?;
        headers.set("X-Robots-Tag", "noindex")?;
        return Ok(Response::empty()?.with_headers(headers).with_status(302));
    }

    let now = now();
    let team_domain = env.var("ACCESS_TEAM_DOMAIN")?.to_string();
    let aud = env.var("ACCESS_AUD")?.to_string();
    let email = identity::caller_email(
        &req,
        &identity::Access { team_domain: &team_domain, aud: &aud },
        now,
    )
    .await;
    let key = env.secret("EMAIL_HASH_KEY")?.to_string();
    let storage = d1::D1Storage(env.d1("DB")?);
    let host = url.host_str().map(|h| match url.port() {
        Some(port) => format!("{h}:{port}"),
        None => h.to_string(),
    });
    let header = |name: &str| req.headers().get(name).ok().flatten();
    let (content_type, origin) = (header("Content-Type"), header("Origin"));
    let method = req.method().to_string();
    let body = req.bytes().await?;
    let api_req = ApiRequest {
        method: &method,
        path: url.path(),
        identity: email.as_deref(),
        content_type: content_type.as_deref(),
        origin: origin.as_deref(),
        host: host.as_deref(),
        body: &body,
    };
    match route(&storage, &api_req, key.as_bytes(), now).await {
        Ok(reply) => json_response(reply),
        Err(e) => {
            console_error!("storage error: {e}");
            json_response(Reply::error(500, "internal error"))
        }
    }
}

/// A failed backup panics so the invocation shows as failed in the dashboard;
/// returning normally would make a lapsed backup look like a successful one.
#[event(scheduled)]
async fn scheduled(_event: ScheduledEvent, env: Env, _ctx: ScheduleContext) {
    if let Err(e) = backup::run(&env, now()).await {
        console_error!("backup failed: {e}");
        panic!("backup failed: {e}");
    }
}
