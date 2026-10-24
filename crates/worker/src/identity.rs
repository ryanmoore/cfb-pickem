//! Who is calling, per Cloudflare Access.
//!
//! Access injects `Cf-Access-Jwt-Assertion` only on paths it protects. Public
//! routes are bypassed and get no header, but a browser that has signed in
//! still carries the `CF_Authorization` cookie, so that is the fallback.

use std::cell::RefCell;

use chrono::{DateTime, Utc};
use pickem_core::access;
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_futures::JsFuture;
use worker::{console_error, Date, Error, Fetch, Request, Result};

/// Re-fetching on an unknown `kid` handles key rotation; this floor stops a
/// forged `kid` from turning every request into a fetch.
const JWKS_REFETCH_FLOOR_MS: u64 = 5 * 60 * 1000;

struct Cached {
    keys: Vec<serde_json::Value>,
    fetched_at_ms: u64,
}

thread_local! {
    // One isolate serves many requests; the keys change on the order of weeks.
    static JWKS: RefCell<Option<Cached>> = const { RefCell::new(None) };
}

pub struct Access<'a> {
    pub team_domain: &'a str,
    pub aud: &'a str,
}

fn token_from(req: &Request) -> Option<String> {
    if let Ok(Some(t)) = req.headers().get("Cf-Access-Jwt-Assertion") {
        return Some(t);
    }
    let cookies = req.headers().get("Cookie").ok().flatten()?;
    cookies
        .split(';')
        .filter_map(|c| c.trim().strip_prefix("CF_Authorization="))
        .next()
        .map(String::from)
}

fn find_key(kid: &str) -> Option<serde_json::Value> {
    JWKS.with(|c| {
        let cache = c.borrow();
        cache.as_ref()?.keys.iter().find(|k| k["kid"] == kid).cloned()
    })
}

async fn key_for(team_domain: &str, kid: &str) -> Result<serde_json::Value> {
    if let Some(key) = find_key(kid) {
        return Ok(key);
    }
    let now = Date::now().as_millis();
    let recent = JWKS.with(|c| {
        c.borrow().as_ref().is_some_and(|c| now.saturating_sub(c.fetched_at_ms) < JWKS_REFETCH_FLOOR_MS)
    });
    if !recent {
        let url = format!("https://{team_domain}/cdn-cgi/access/certs");
        let mut jwks: serde_json::Value =
            Fetch::Url(url.parse().map_err(|_| Error::RustError("bad team domain".into()))?)
                .send()
                .await?
                .json()
                .await?;
        let keys = match jwks["keys"].take() {
            serde_json::Value::Array(keys) => keys,
            _ => return Err(Error::RustError("JWKS has no keys".into())),
        };
        JWKS.with(|c| *c.borrow_mut() = Some(Cached { keys, fetched_at_ms: now }));
    }
    find_key(kid).ok_or_else(|| Error::RustError(format!("no signing key {kid:?}")))
}

fn js_err(what: &str) -> impl Fn(JsValue) -> Error + '_ {
    move |e| Error::RustError(format!("{what}: {e:?}"))
}

async fn verify_rs256(jwk: &serde_json::Value, signed: &str, signature: &[u8]) -> Result<bool> {
    let subtle = js_sys::Reflect::get(&js_sys::global(), &"crypto".into())
        .map_err(js_err("crypto"))?
        .unchecked_into::<web_sys::Crypto>()
        .subtle();
    let jwk = js_sys::JSON::parse(&jwk.to_string()).map_err(js_err("jwk"))?;
    let algorithm = js_sys::Object::from(
        js_sys::JSON::parse(r#"{"name":"RSASSA-PKCS1-v1_5","hash":"SHA-256"}"#).map_err(js_err("alg"))?,
    );
    let usages = js_sys::Array::of1(&"verify".into());
    let key: web_sys::CryptoKey = JsFuture::from(
        subtle
            .import_key_with_object("jwk", &jwk.unchecked_into(), &algorithm, false, &usages)
            .map_err(js_err("importKey"))?,
    )
    .await
    .map_err(js_err("importKey"))?
    .unchecked_into();
    let ok = JsFuture::from(
        subtle
            .verify_with_str_and_u8_array_and_u8_array(
                "RSASSA-PKCS1-v1_5",
                &key,
                &mut signature.to_vec(),
                &mut signed.as_bytes().to_vec(),
            )
            .map_err(js_err("verify"))?,
    )
    .await
    .map_err(js_err("verify"))?;
    Ok(ok.as_bool().unwrap_or(false))
}

/// The verified address of the caller, or `None` when there is no valid
/// Access token. A bad token is logged and treated as signed out: the public
/// pages still work for it.
pub async fn caller_email(req: &Request, access: &Access<'_>, now: DateTime<Utc>) -> Option<String> {
    let raw = token_from(req)?;
    let verified = async {
        let token = access::parse(&raw).map_err(|e| Error::RustError(e.to_string()))?;
        let email = token
            .claims
            .verified_email(access.aud, access.team_domain, now)
            .map_err(|e| Error::RustError(e.to_string()))?
            .to_string();
        let jwk = key_for(access.team_domain, &token.kid).await?;
        if verify_rs256(&jwk, token.signing_input, &token.signature).await? {
            Ok(email)
        } else {
            Err(Error::RustError("bad signature".into()))
        }
    };
    match verified.await {
        Ok(email) => Some(email),
        Err(e) => {
            console_error!("access token rejected: {e}");
            None
        }
    }
}
