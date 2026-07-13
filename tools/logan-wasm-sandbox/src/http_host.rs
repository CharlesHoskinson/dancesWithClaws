use crate::policy::SandboxPolicy;
use reqwest::header;
use thiserror::Error;
use url::Url;

const MAX_REDIRECTS: usize = 5;

#[derive(Debug, Clone)]
pub struct HttpResult {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    pub final_url: String,
}

#[derive(Debug, Error)]
pub enum HttpHostError {
    #[error("host denied by allowlist: {host}")]
    Denied { host: String },
    #[error("request timed out")]
    Timeout,
    #[error("response exceeded max_response_bytes")]
    TooLarge,
    #[error("network error: {0}")]
    Network(String),
    #[error("bad url: {0}")]
    BadUrl(String),
}

/// HTTPS-only + allowlist gate used for the initial URL and every redirect hop
/// **before** the next request is sent.
pub fn validate_request_url(policy: &SandboxPolicy, url: &Url) -> Result<(), HttpHostError> {
    if url.scheme() != "https" {
        return Err(HttpHostError::BadUrl("only https is allowed".into()));
    }
    let host = url
        .host_str()
        .ok_or_else(|| HttpHostError::BadUrl("missing host".into()))?;
    if !policy.allowlist.allows_host(host) {
        return Err(HttpHostError::Denied {
            host: host.to_string(),
        });
    }
    Ok(())
}

/// Returns whether appending `chunk_len` bytes would exceed `max` (cap is exclusive upper bound on total size).
pub fn would_exceed_body_cap(current_len: usize, chunk_len: usize, max: usize) -> bool {
    current_len.saturating_add(chunk_len) > max
}

pub async fn http_get(policy: &SandboxPolicy, url_str: &str) -> Result<HttpResult, HttpHostError> {
    let mut url = Url::parse(url_str).map_err(|e| HttpHostError::BadUrl(e.to_string()))?;
    validate_request_url(policy, &url)?;

    // Manual redirects so every hop is allowlisted + https before connect.
    let client = reqwest::Client::builder()
        .timeout(policy.timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| HttpHostError::Network(e.to_string()))?;

    let mut redirects = 0usize;
    loop {
        let response = match client.get(url.clone()).send().await {
            Ok(r) => r,
            Err(e) if e.is_timeout() => return Err(HttpHostError::Timeout),
            Err(e) => return Err(HttpHostError::Network(e.to_string())),
        };

        if response.status().is_redirection() {
            if redirects >= MAX_REDIRECTS {
                return Err(HttpHostError::Network("too many redirects".into()));
            }
            let loc = response
                .headers()
                .get(header::LOCATION)
                .ok_or_else(|| HttpHostError::BadUrl("redirect missing Location".into()))?
                .to_str()
                .map_err(|e| HttpHostError::BadUrl(format!("invalid Location: {e}")))?;
            let next = url
                .join(loc)
                .or_else(|_| Url::parse(loc))
                .map_err(|e| HttpHostError::BadUrl(format!("invalid redirect target: {e}")))?;
            // Fail closed before following: scheme + host on the next hop.
            validate_request_url(policy, &next)?;
            url = next;
            redirects += 1;
            continue;
        }

        // Non-redirect final response: re-validate in case of client URL quirks.
        validate_request_url(policy, response.url())?;

        if let Some(cl) = response.content_length() {
            if cl as usize > policy.max_response_bytes {
                return Err(HttpHostError::TooLarge);
            }
        }

        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();
        let final_url = response.url().to_string();
        let body = read_body_capped(response, policy.max_response_bytes).await?;

        return Ok(HttpResult {
            status,
            headers,
            body,
            final_url,
        });
    }
}

async fn read_body_capped(
    mut response: reqwest::Response,
    max: usize,
) -> Result<Vec<u8>, HttpHostError> {
    let mut body = Vec::new();
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if would_exceed_body_cap(body.len(), chunk.len(), max) {
                    return Err(HttpHostError::TooLarge);
                }
                body.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(e) if e.is_timeout() => return Err(HttpHostError::Timeout),
            Err(e) => return Err(HttpHostError::Network(e.to_string())),
        }
    }
    Ok(body)
}
