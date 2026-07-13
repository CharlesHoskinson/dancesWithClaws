use std::time::Duration;
use logan_wasm_sandbox::allowlist::Allowlist;
use logan_wasm_sandbox::http_host::{http_get, HttpHostError};
use logan_wasm_sandbox::policy::SandboxPolicy;

fn policy() -> SandboxPolicy {
    SandboxPolicy {
        allowlist: Allowlist::from_str(".openai.com\n"),
        timeout: Duration::from_secs(5),
        max_response_bytes: 1024 * 1024,
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
