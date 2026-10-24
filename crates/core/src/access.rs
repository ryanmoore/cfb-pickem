//! Cloudflare Access JWT handling, minus the signature.
//!
//! Parsing and claim checks are pure so they test natively. Verifying the RS256
//! signature over [`Token::signing_input`] is the caller's job: the worker does
//! it with the runtime's SubtleCrypto, which keeps an RSA implementation out of
//! the binary.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AccessError {
    #[error("malformed token")]
    Malformed,
    #[error("unsupported algorithm {0:?}")]
    Algorithm(String),
    #[error("audience mismatch")]
    Audience,
    #[error("issuer mismatch")]
    Issuer,
    #[error("token expired")]
    Expired,
    #[error("token not yet valid")]
    NotYetValid,
    #[error("no email claim")]
    NoEmail,
}

#[derive(Deserialize)]
struct Header {
    alg: String,
    kid: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Audience {
    One(String),
    Many(Vec<String>),
}

#[derive(Deserialize)]
pub struct Claims {
    aud: Audience,
    iss: String,
    exp: i64,
    nbf: Option<i64>,
    email: Option<String>,
}

pub struct Token<'a> {
    /// The bytes the signature covers: `<header>.<payload>` as sent.
    pub signing_input: &'a str,
    pub signature: Vec<u8>,
    /// Which JWKS key signed it.
    pub kid: String,
    pub claims: Claims,
}

fn decode<T: for<'de> Deserialize<'de>>(part: &str) -> Result<T, AccessError> {
    let bytes = URL_SAFE_NO_PAD.decode(part).map_err(|_| AccessError::Malformed)?;
    serde_json::from_slice(&bytes).map_err(|_| AccessError::Malformed)
}

pub fn parse(token: &str) -> Result<Token<'_>, AccessError> {
    let mut parts = token.split('.');
    let (Some(header), Some(payload), Some(signature), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(AccessError::Malformed);
    };
    let header: Header = decode(header)?;
    if header.alg != "RS256" {
        return Err(AccessError::Algorithm(header.alg));
    }
    Ok(Token {
        signing_input: token.rsplit_once('.').map_or(token, |(signed, _)| signed),
        signature: URL_SAFE_NO_PAD.decode(signature).map_err(|_| AccessError::Malformed)?,
        kid: header.kid.ok_or(AccessError::Malformed)?,
        claims: decode(payload)?,
    })
}

impl Claims {
    /// The signed-in address, if the claims were issued by this team for this
    /// application and are valid at `now`.
    pub fn verified_email(
        &self,
        aud: &str,
        team_domain: &str,
        now: DateTime<Utc>,
    ) -> Result<&str, AccessError> {
        let aud_ok = match &self.aud {
            Audience::One(a) => a == aud,
            Audience::Many(list) => list.iter().any(|a| a == aud),
        };
        if !aud_ok {
            return Err(AccessError::Audience);
        }
        if self.iss != format!("https://{team_domain}") {
            return Err(AccessError::Issuer);
        }
        let now = now.timestamp();
        if now >= self.exp {
            return Err(AccessError::Expired);
        }
        if self.nbf.is_some_and(|nbf| now < nbf) {
            return Err(AccessError::NotYetValid);
        }
        self.email.as_deref().ok_or(AccessError::NoEmail)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_800_000_000;

    fn token(alg: &str, claims: &str) -> String {
        let enc = |s: &str| URL_SAFE_NO_PAD.encode(s);
        format!(
            "{}.{}.{}",
            enc(&format!(r#"{{"alg":"{alg}","kid":"k1"}}"#)),
            enc(claims),
            URL_SAFE_NO_PAD.encode([1, 2, 3])
        )
    }

    fn check(claims: &str) -> Result<String, AccessError> {
        let raw = token("RS256", claims);
        let t = parse(&raw)?;
        let now = DateTime::from_timestamp(NOW, 0).unwrap();
        t.claims.verified_email("app-aud", "team.cloudflareaccess.com", now).map(String::from)
    }

    #[test]
    fn claim_checks() {
        // Valid except for the one field each case overrides.
        let claims = |aud: &str, iss: &str, exp: i64, nbf: &str, email: &str| {
            format!(r#"{{"aud":{aud},"iss":"{iss}","exp":{exp}{nbf}{email}}}"#)
        };
        let team = "https://team.cloudflareaccess.com";
        let email = r#","email":"a@example.com""#;
        let ok = Ok("a@example.com".to_string());
        let cases = [
            (claims(r#"["other","app-aud"]"#, team, NOW + 60, r#","nbf":1800000000"#, email), ok.clone()),
            (claims(r#""app-aud""#, team, NOW + 60, "", email), ok),
            (claims(r#""nope""#, team, NOW + 60, "", email), Err(AccessError::Audience)),
            (claims(r#""app-aud""#, "https://evil.example.com", NOW + 60, "", email), Err(AccessError::Issuer)),
            (claims(r#""app-aud""#, team, NOW, "", email), Err(AccessError::Expired)),
            (claims(r#""app-aud""#, team, NOW + 60, r#","nbf":1800000001"#, email), Err(AccessError::NotYetValid)),
            (claims(r#""app-aud""#, team, NOW + 60, "", ""), Err(AccessError::NoEmail)),
            ("not json".to_string(), Err(AccessError::Malformed)),
        ];
        for (body, expected) in cases {
            assert_eq!(check(&body), expected, "{body}");
        }
    }

    #[test]
    fn only_rs256_is_accepted() {
        assert!(matches!(parse(&token("none", "{}")), Err(AccessError::Algorithm(_))));
        assert!(matches!(parse("a.b"), Err(AccessError::Malformed)));
    }
}
