use std::time::Duration;
use logan_wasm_sandbox::allowlist::Allowlist;
use logan_wasm_sandbox::http_host::{
    http_get, validate_request_url, would_exceed_body_cap, HttpHostError,
};
use logan_wasm_sandbox::policy::SandboxPolicy;
use url::Url;

fn policy() -> SandboxPolicy {
    SandboxPolicy {
        allowlist: Allowlist::from_str(".openai.com\n"),
        timeout: Duration::from_secs(5),
        max_response_bytes: 1024 * 1024,
    }
}

fn policy_with_cap(max_response_bytes: usize) -> SandboxPolicy {
    SandboxPolicy {
        allowlist: Allowlist::from_str(".openai.com\n"),
        timeout: Duration::from_secs(5),
        max_response_bytes,
    }
}

#[tokio::test]
async fn denies_before_connect_for_disallowed_host() {
    let err = http_get(&policy(), "https://evil.com/")
        .await
        .expect_err("must deny");
    match err {
        HttpHostError::Denied { host } => assert_eq!(host, "evil.com"),
        other => panic!("unexpected {other:?}"),
    }
}

#[tokio::test]
async fn rejects_non_https() {
    let err = http_get(&policy(), "http://api.openai.com/")
        .await
        .expect_err("http not allowed");
    assert!(matches!(err, HttpHostError::BadUrl(_)));
}

#[test]
fn validate_rejects_http_redirect_target() {
    let url = Url::parse("http://api.openai.com/path").unwrap();
    let err = validate_request_url(&policy(), &url).expect_err("http must fail");
    assert!(matches!(err, HttpHostError::BadUrl(_)));
}

#[test]
fn validate_rejects_disallowed_redirect_host() {
    let url = Url::parse("https://evil.com/callback").unwrap();
    let err = validate_request_url(&policy(), &url).expect_err("evil host must fail");
    match err {
        HttpHostError::Denied { host } => assert_eq!(host, "evil.com"),
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn validate_accepts_allowed_https_host() {
    let url = Url::parse("https://api.openai.com/v1").unwrap();
    validate_request_url(&policy(), &url).expect("allowed https host");
}

#[test]
fn body_cap_blocks_oversized_chunk() {
    assert!(!would_exceed_body_cap(0, 10, 10));
    assert!(would_exceed_body_cap(0, 11, 10));
    assert!(would_exceed_body_cap(8, 3, 10));
    assert!(!would_exceed_body_cap(8, 2, 10));
}

#[test]
fn body_cap_zero_rejects_any_byte() {
    assert!(would_exceed_body_cap(0, 1, 0));
    assert!(!would_exceed_body_cap(0, 0, 0));
}

/// Content-Length larger than max must fail closed without needing a full stream test server.
/// We exercise the public gate by pointing at a URL that will never be contacted if the
/// initial host is denied — covered above. Cap helper + validate_request_url are the
/// security-critical pure pieces; streaming path uses the same would_exceed_body_cap.
#[test]
fn policy_cap_field_is_honored_by_helper() {
    let p = policy_with_cap(4);
    assert!(would_exceed_body_cap(0, 5, p.max_response_bytes));
    assert!(!would_exceed_body_cap(0, 4, p.max_response_bytes));
}
