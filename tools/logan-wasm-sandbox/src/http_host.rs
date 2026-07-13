use crate::policy::SandboxPolicy;
use std::time::Duration;
use thiserror::Error;
use url::Url;

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

pub async fn http_get(policy: &SandboxPolicy, url_str: &str) -> Result<HttpResult, HttpHostError> {
    let url = Url::parse(url_str).map_err(|e| HttpHostError::BadUrl(e.to_string()))?;
    if url.scheme() != "https" {
        return Err(HttpHostError::BadUrl("only https is allowed".into()));
    }
    let host = url
        .host_str()
        .ok_or_else(|| HttpHostError::BadUrl("missing host".into()))?
        .to_string();
    if !policy.allowlist.allows_host(&host) {
        return Err(HttpHostError::Denied { host });
    }

    let client = reqwest::Client::builder()
        .timeout(policy.timeout)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| HttpHostError::Network(e.to_string()))?;

    let response = match client.get(url.clone()).send().await {
        Ok(r) => r,
        Err(e) if e.is_timeout() => return Err(HttpHostError::Timeout),
        Err(e) => return Err(HttpHostError::Network(e.to_string())),
    };

    // Re-check final URL host after redirects
    let final_url = response.url().clone();
    let final_host = final_url
        .host_str()
        .ok_or_else(|| HttpHostError::BadUrl("missing host after redirect".into()))?;
    if !policy.allowlist.allows_host(final_host) {
        return Err(HttpHostError::Denied {
            host: final_host.to_string(),
        });
    }

    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let mut body = response
        .bytes()
        .await
        .map_err(|e| HttpHostError::Network(e.to_string()))?
        .to_vec();
    if body.len() > policy.max_response_bytes {
        body.truncate(policy.max_response_bytes);
        return Err(HttpHostError::TooLarge);
    }

    Ok(HttpResult {
        status,
        headers,
        body,
        final_url: final_url.to_string(),
    })
}

// silence unused import if Duration used only via policy
#[allow(dead_code)]
fn _duration_marker() -> Duration {
    Duration::from_secs(1)
}
