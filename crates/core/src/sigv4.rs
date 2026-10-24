//! AWS Signature Version 4 for a single S3 `PutObject`.
//!
//! The payload is sent as `UNSIGNED-PAYLOAD`, which S3 accepts over TLS and
//! which spares hashing a whole database dump inside a CPU-limited Worker.

use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

pub struct PutObject<'a> {
    pub access_key_id: &'a str,
    pub secret_access_key: &'a str,
    pub region: &'a str,
    pub bucket: &'a str,
    /// Object key without a leading slash.
    pub key: &'a str,
    pub now: DateTime<Utc>,
}

/// A signed request: the URL to PUT to and the headers to send with it.
pub struct Signed {
    pub url: String,
    pub headers: Vec<(&'static str, String)>,
}

fn hmac(key: &[u8], msg: &str) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(msg.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Percent-encode a path, leaving `/` and unreserved characters alone. S3
/// signs the path as sent, with no second round of encoding.
fn encode_path(path: &str) -> String {
    let mut out = String::new();
    for b in path.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~' | b'/') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub fn sign_put(req: &PutObject) -> Signed {
    let host = format!("{}.s3.{}.amazonaws.com", req.bucket, req.region);
    let path = format!("/{}", encode_path(req.key));
    let amz_date = req.now.format("%Y%m%dT%H%M%SZ").to_string();
    let date = &amz_date[..8];
    let payload = "UNSIGNED-PAYLOAD";

    let canonical = format!(
        "PUT\n{path}\n\nhost:{host}\nx-amz-content-sha256:{payload}\nx-amz-date:{amz_date}\n\n\
         host;x-amz-content-sha256;x-amz-date\n{payload}"
    );
    let scope = format!("{date}/{}/s3/aws4_request", req.region);
    let to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        hex(&Sha256::digest(canonical.as_bytes()))
    );

    let mut k = hmac(format!("AWS4{}", req.secret_access_key).as_bytes(), date);
    for part in [req.region, "s3", "aws4_request"] {
        k = hmac(&k, part);
    }
    let signature = hex(&hmac(&k, &to_sign));

    Signed {
        url: format!("https://{host}{path}"),
        headers: vec![
            ("x-amz-date", amz_date),
            ("x-amz-content-sha256", payload.into()),
            (
                "authorization",
                format!(
                    "AWS4-HMAC-SHA256 Credential={}/{scope}, \
                     SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={signature}",
                    req.access_key_id
                ),
            ),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Expected values come from botocore 1.43.118 (`S3SigV4Auth`, payload
    /// forced to `UNSIGNED-PAYLOAD`, clock pinned to the instant below) signing
    /// the same request.
    #[test]
    fn matches_botocore() {
        let signed = sign_put(&PutObject {
            access_key_id: "AKIDEXAMPLE",
            secret_access_key: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
            region: "us-east-2",
            bucket: "example-bucket",
            key: "backups/pickem/pickem-2026-10-24.sql",
            now: "2026-10-24T09:00:05Z".parse().unwrap(),
        });
        assert_eq!(
            signed.url,
            "https://example-bucket.s3.us-east-2.amazonaws.com/backups/pickem/pickem-2026-10-24.sql"
        );
        let header = |name| signed.headers.iter().find(|(n, _)| *n == name).unwrap().1.clone();
        assert_eq!(header("x-amz-date"), "20261024T090005Z");
        assert_eq!(
            header("authorization"),
            "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261024/us-east-2/s3/aws4_request, \
             SignedHeaders=host;x-amz-content-sha256;x-amz-date, \
             Signature=e863b9e8b2223cebb91fb9c2b2f4652b81491679252fa1ac7ac0f18f4228bca5"
        );
    }
}
