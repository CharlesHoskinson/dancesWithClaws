# Logan WASM Sandbox Host (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone Rust CLI that enforces domain-allowlisted HTTPS from a capability-scoped Wasmtime guest path, proving Docker-free egress policy for Logan.

**Architecture:** A host binary (`logan-wasm-sandbox`) loads `security/proxy/allowed-domains.txt`, mediates HTTPS with `reqwest`, and runs a tiny WASI guest that can only request HTTP via a host import. Allowlist and limits live entirely on the host; the guest never opens raw sockets to the world.

**Tech Stack:** Rust 1.83+, Cargo workspace crate under `tools/logan-wasm-sandbox`, Wasmtime 28+ with WASI P2, `reqwest` (rustls), `serde`/`serde_json`, `clap` for CLI, `tokio` for async HTTP.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-logan-wasm-sandbox-ts7-design.md` (Approach A, P1 only).
- Do **not** modify OpenClaw gateway sandbox backend in this plan (that is P2).
- Do **not** require WSL2 or Docker for success tests.
- Reuse domain list format from `security/proxy/allowed-domains.txt` (lines like `.openai.com`, `#` comments, blank lines ignored).
- Default deny: any host not matching an allowlist entry is rejected before network I/O.
- Timeouts and response byte caps are mandatory on every request.
- Commits: small, conventional (`feat:`, `test:`, `docs:`).
- Platform: Windows host primary; Linux CI optional if Rust toolchain present.
- Guest language: Rust → `wasm32-wasip2` only in this plan.
- No general shell, no `docker.sock`, no ambient filesystem outside preopens (guest FS not required for P1 HTTP smoke).

## File structure

| Path                                                                 | Responsibility                             |
| -------------------------------------------------------------------- | ------------------------------------------ |
| `tools/logan-wasm-sandbox/Cargo.toml`                                | Host crate manifest                        |
| `tools/logan-wasm-sandbox/src/lib.rs`                                | Library root: re-exports modules           |
| `tools/logan-wasm-sandbox/src/allowlist.rs`                          | Parse + match domain allowlist             |
| `tools/logan-wasm-sandbox/src/policy.rs`                             | Timeouts, byte limits, paths to allowlist  |
| `tools/logan-wasm-sandbox/src/http_host.rs`                          | Host-mediated HTTPS with allowlist + caps  |
| `tools/logan-wasm-sandbox/src/runtime.rs`                            | Wasmtime engine, host import, run guest    |
| `tools/logan-wasm-sandbox/src/main.rs`                               | CLI: `http` and `guest-http` subcommands   |
| `tools/logan-wasm-sandbox/tests/allowlist_tests.rs`                  | Integration-style unit tests for allowlist |
| `tools/logan-wasm-sandbox/tests/http_policy_tests.rs`                | Allow/deny without hitting network (mock)  |
| `tools/logan-wasi-http/Cargo.toml`                                   | Guest crate                                |
| `tools/logan-wasi-http/src/lib.rs`                                   | Guest: call host `http_get`                |
| `tools/logan-wasm-sandbox/build.rs`                                  | Optional: build guest wasm into `OUT_DIR`  |
| `scripts/logan-wasm-smoke.ps1`                                       | Windows smoke: allow + deny URLs           |
| `docs/superpowers/specs/2026-07-13-logan-wasm-sandbox-ts7-design.md` | Spec (read-only reference)                 |

---

### Task 1: Scaffold host crate + allowlist module (TDD)

**Files:**

- Create: `tools/logan-wasm-sandbox/Cargo.toml`
- Create: `tools/logan-wasm-sandbox/src/lib.rs`
- Create: `tools/logan-wasm-sandbox/src/allowlist.rs`
- Create: `tools/logan-wasm-sandbox/tests/allowlist_tests.rs`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `Allowlist::from_str(text: &str) -> Allowlist`
  - `Allowlist::from_path(path: impl AsRef<Path>) -> Result<Allowlist, std::io::Error>`
  - `Allowlist::allows_host(&self, host: &str) -> bool`
  - Matching rules: entry `.example.com` matches `example.com` and `api.example.com`; entry `example.com` matches exact host only; comparison is case-insensitive; strip trailing dots

- [ ] **Step 1: Create crate manifest**

```toml
# tools/logan-wasm-sandbox/Cargo.toml
[package]
name = "logan-wasm-sandbox"
version = "0.1.0"
edition = "2021"
publish = false

[dependencies]
thiserror = "2"

[dev-dependencies]
```

- [ ] **Step 2: Write failing allowlist tests**

```rust
// tools/logan-wasm-sandbox/tests/allowlist_tests.rs
use logan_wasm_sandbox::allowlist::Allowlist;

#[test]
fn parses_suffix_entries_and_comments() {
    let text = "\
# comment
.openai.com

.sokosumi.com
";
    let al = Allowlist::from_str(text);
    assert!(al.allows_host("api.openai.com"));
    assert!(al.allows_host("openai.com"));
    assert!(al.allows_host("www.sokosumi.com"));
    assert!(!al.allows_host("evil.com"));
    assert!(!al.allows_host("notopenai.com"));
}

#[test]
fn exact_entry_does_not_match_subdomain() {
    let al = Allowlist::from_str("openai.com\n");
    assert!(al.allows_host("openai.com"));
    assert!(!al.allows_host("api.openai.com"));
}

#[test]
fn matching_is_case_insensitive() {
    let al = Allowlist::from_str(".OpenAI.com\n");
    assert!(al.allows_host("API.OPENAI.COM"));
}
```

- [ ] **Step 3: Run tests — expect compile/link failure**

Run (from repo root, after installing Rust):

```powershell
cd tools/logan-wasm-sandbox
cargo test --test allowlist_tests
```

Expected: FAIL — package/module `allowlist` missing.

- [ ] **Step 4: Implement allowlist**

```rust
// tools/logan-wasm-sandbox/src/allowlist.rs
use std::fs;
use std::io;
use std::path::Path;

#[derive(Debug, Clone)]
enum Entry {
    /// Matches host == name or host ends with "." + name (entry stored without leading dot)
    Suffix(String),
    Exact(String),
}

#[derive(Debug, Clone, Default)]
pub struct Allowlist {
    entries: Vec<Entry>,
}

impl Allowlist {
    pub fn from_str(text: &str) -> Self {
        let mut entries = Vec::new();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some(rest) = line.strip_prefix('.') {
                entries.push(Entry::Suffix(normalize_host(rest)));
            } else {
                entries.push(Entry::Exact(normalize_host(line)));
            }
        }
        Self { entries }
    }

    pub fn from_path(path: impl AsRef<Path>) -> io::Result<Self> {
        let text = fs::read_to_string(path)?;
        Ok(Self::from_str(&text))
    }

    pub fn allows_host(&self, host: &str) -> bool {
        let host = normalize_host(host);
        self.entries.iter().any(|e| match e {
            Entry::Exact(name) => host == *name,
            Entry::Suffix(name) => host == *name || host.ends_with(&format!(".{name}")),
        })
    }
}

fn normalize_host(host: &str) -> String {
    host.trim().trim_end_matches('.').to_ascii_lowercase()
}
```

```rust
// tools/logan-wasm-sandbox/src/lib.rs
pub mod allowlist;
```

- [ ] **Step 5: Run tests — expect PASS**

```powershell
cd tools/logan-wasm-sandbox
cargo test --test allowlist_tests
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add tools/logan-wasm-sandbox
git commit -m "feat(wasm-sandbox): add domain allowlist module with tests"
```

---

### Task 2: Policy + host-mediated HTTPS (TDD)

**Files:**

- Create: `tools/logan-wasm-sandbox/src/policy.rs`
- Create: `tools/logan-wasm-sandbox/src/http_host.rs`
- Create: `tools/logan-wasm-sandbox/tests/http_policy_tests.rs`
- Modify: `tools/logan-wasm-sandbox/Cargo.toml`
- Modify: `tools/logan-wasm-sandbox/src/lib.rs`

**Interfaces:**

- Consumes: `Allowlist`
- Produces:
  - `struct SandboxPolicy { allowlist: Allowlist, timeout: Duration, max_response_bytes: usize }`
  - `SandboxPolicy::from_allowlist_path(path, timeout, max_response_bytes) -> io::Result<SandboxPolicy>`
  - `struct HttpResult { status: u16, headers: Vec<(String,String)>, body: Vec<u8>, final_url: String }`
  - `enum HttpHostError { Denied { host: String }, Timeout, TooLarge, Network(String), BadUrl(String) }`
  - `async fn http_get(policy: &SandboxPolicy, url: &str) -> Result<HttpResult, HttpHostError>`
  - Host extracted from URL must pass `allowlist.allows_host` **before** any TCP connect

- [ ] **Step 1: Add dependencies**

```toml
# append to tools/logan-wasm-sandbox/Cargo.toml
[dependencies]
thiserror = "2"
url = "2"
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "http2"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "time"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Write failing policy tests (no network)**

```rust
// tools/logan-wasm-sandbox/tests/http_policy_tests.rs
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
```

- [ ] **Step 3: Run tests — expect FAIL (missing modules)**

```powershell
cd tools/logan-wasm-sandbox
cargo test --test http_policy_tests
```

Expected: FAIL — unresolved `policy` / `http_host`.

- [ ] **Step 4: Implement policy + http_host**

```rust
// tools/logan-wasm-sandbox/src/policy.rs
use std::io;
use std::path::Path;
use std::time::Duration;
use crate::allowlist::Allowlist;

#[derive(Debug, Clone)]
pub struct SandboxPolicy {
    pub allowlist: Allowlist,
    pub timeout: Duration,
    pub max_response_bytes: usize,
}

impl SandboxPolicy {
    pub fn from_allowlist_path(
        path: impl AsRef<Path>,
        timeout: Duration,
        max_response_bytes: usize,
    ) -> io::Result<Self> {
        Ok(Self {
            allowlist: Allowlist::from_path(path)?,
            timeout,
            max_response_bytes,
        })
    }
}
```

```rust
// tools/logan-wasm-sandbox/src/http_host.rs
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
```

```rust
// tools/logan-wasm-sandbox/src/lib.rs
pub mod allowlist;
pub mod http_host;
pub mod policy;
```

- [ ] **Step 5: Run policy tests — expect PASS**

```powershell
cd tools/logan-wasm-sandbox
cargo test --test http_policy_tests
```

Expected: PASS (denied/non-https without network).

- [ ] **Step 6: Commit**

```powershell
git add tools/logan-wasm-sandbox
git commit -m "feat(wasm-sandbox): host-mediated HTTPS with allowlist and limits"
```

---

### Task 3: CLI `http` subcommand

**Files:**

- Create: `tools/logan-wasm-sandbox/src/main.rs`
- Modify: `tools/logan-wasm-sandbox/Cargo.toml` (add `clap`)

**Interfaces:**

- Consumes: `SandboxPolicy::from_allowlist_path`, `http_get`
- Produces: CLI binary `logan-wasm-sandbox`
  - `logan-wasm-sandbox http --allowlist <path> --url <https-url> [--timeout-secs N] [--max-bytes N]`
  - Exit `0` on success: print JSON `{ "ok": true, "status": <u16>, "bytes": <usize>, "final_url": "..." }`
  - Exit `2` on deny: JSON `{ "ok": false, "error": "denied", "host": "..." }`
  - Exit `1` on other errors

- [ ] **Step 1: Add clap**

```toml
clap = { version = "4", features = ["derive"] }
```

- [ ] **Step 2: Implement main**

```rust
// tools/logan-wasm-sandbox/src/main.rs
use clap::{Parser, Subcommand};
use logan_wasm_sandbox::http_host::{http_get, HttpHostError};
use logan_wasm_sandbox::policy::SandboxPolicy;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

#[derive(Parser, Debug)]
#[command(name = "logan-wasm-sandbox", version)]
struct Cli {
    #[command(subcommand)]
    cmd: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Host-mediated HTTPS GET with allowlist (no guest)
    Http {
        #[arg(long, default_value = "security/proxy/allowed-domains.txt")]
        allowlist: PathBuf,
        #[arg(long)]
        url: String,
        #[arg(long, default_value_t = 30)]
        timeout_secs: u64,
        #[arg(long, default_value_t = 1_048_576)]
        max_bytes: usize,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.cmd {
        Commands::Http {
            allowlist,
            url,
            timeout_secs,
            max_bytes,
        } => {
            let policy = match SandboxPolicy::from_allowlist_path(
                &allowlist,
                Duration::from_secs(timeout_secs),
                max_bytes,
            ) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("{{\"ok\":false,\"error\":\"policy\",\"message\":{}}}",
                        serde_json::to_string(&e.to_string()).unwrap());
                    return ExitCode::from(1);
                }
            };
            match http_get(&policy, &url).await {
                Ok(r) => {
                    println!(
                        "{}",
                        serde_json::json!({
                            "ok": true,
                            "status": r.status,
                            "bytes": r.body.len(),
                            "final_url": r.final_url,
                        })
                    );
                    ExitCode::SUCCESS
                }
                Err(HttpHostError::Denied { host }) => {
                    println!(
                        "{}",
                        serde_json::json!({"ok": false, "error": "denied", "host": host})
                    );
                    ExitCode::from(2)
                }
                Err(e) => {
                    println!(
                        "{}",
                        serde_json::json!({"ok": false, "error": "request", "message": e.to_string()})
                    );
                    ExitCode::from(1)
                }
            }
        }
    }
}
```

- [ ] **Step 3: Build and smoke deny (offline)**

```powershell
cd C:\Users\charl\dancesWithClaws
cargo build --manifest-path tools/logan-wasm-sandbox/Cargo.toml --release
.\tools\logan-wasm-sandbox\target\release\logan-wasm-sandbox.exe http --allowlist security\proxy\allowed-domains.txt --url https://evil.com/
```

Expected: exit code **2**, JSON includes `"error":"denied"`.

- [ ] **Step 4: Smoke allow (network)**

```powershell
.\tools\logan-wasm-sandbox\target\release\logan-wasm-sandbox.exe http --allowlist security\proxy\allowed-domains.txt --url https://api.openai.com/
```

Expected: exit **0**, JSON `"ok":true` and a numeric `status` (often 401/404 without API key — still success for allowlist).

- [ ] **Step 5: Commit**

```powershell
git add tools/logan-wasm-sandbox
git commit -m "feat(wasm-sandbox): CLI http subcommand with JSON results"
```

---

### Task 4: WASI guest + host import (minimal)

**Files:**

- Create: `tools/logan-wasi-http/Cargo.toml`
- Create: `tools/logan-wasi-http/src/main.rs` (cdylib or bin for wasip2)
- Create: `tools/logan-wasm-sandbox/src/runtime.rs`
- Modify: `tools/logan-wasm-sandbox/src/main.rs` (add `guest-http` subcommand)
- Modify: `tools/logan-wasm-sandbox/Cargo.toml` (wasmtime deps)
- Create: `tools/logan-wasm-sandbox/build.rs` (build guest if rustup target present)

**Interfaces:**

- Consumes: `http_get`, `SandboxPolicy`
- Produces:
  - Guest binary/module `logan_wasi_http.wasm` that reads URL from env `LOGAN_HTTP_URL` and calls host function
  - Host function name: `logan_http_get` (linker define) — for P1 simplicity, **run guest only as orchestrator**: host still performs HTTP; guest receives status via stdout written by host after import returns
  - Pragmatic P1 shape (avoid incomplete WIT tooling):
    1. CLI `guest-http` loads wasm with Wasmtime WASI
    2. Guest `main` writes the URL to a preopened outbox file OR host passes URL as argv
    3. Host intercepts by **not** giving guest sockets; instead host runs `http_get` for argv URL **after** guest validates URL format in wasm, printing a line `REQUEST <url>` on stdout that host already knew

**Simpler locked design for P1 (required):**  
Do **not** block P1 on full WIT component HTTP. Implement:

1. Guest crate compiles to `wasm32-wasip1` or `wasm32-wasip2` and only **validates** that a URL string is `https://` and host is non-empty (pure compute).
2. Host CLI `guest-http` runs the guest with URL in argv; if guest exits 0, host calls `http_get`; if guest exits non-zero, fail closed.
3. Document that P2 OpenClaw wiring will use host imports; P1 proves Wasmtime + policy pipeline.

- [ ] **Step 1: Guest crate**

```toml
# tools/logan-wasi-http/Cargo.toml
[package]
name = "logan-wasi-http"
version = "0.1.0"
edition = "2021"
publish = false

[[bin]]
name = "logan-wasi-http"
path = "src/main.rs"
```

```rust
// tools/logan-wasi-http/src/main.rs
//! WASI guest: validate HTTPS URL then exit 0. Host performs the real GET.
use std::env;
use std::process::exit;

fn main() {
    let url = env::args().nth(1).unwrap_or_default();
    if !url.starts_with("https://") {
        eprintln!("only https urls allowed");
        exit(3);
    }
    let rest = &url["https://".len()..];
    let host = rest.split('/').next().unwrap_or("");
    if host.is_empty() || host.contains(' ') {
        eprintln!("invalid host");
        exit(3);
    }
    println!("REQUEST {url}");
    exit(0);
}
```

- [ ] **Step 2: Install target and build guest**

```powershell
rustup target add wasm32-wasip1
cargo build --manifest-path tools/logan-wasi-http/Cargo.toml --release --target wasm32-wasip1
```

Expected: `tools/logan-wasi-http/target/wasm32-wasip1/release/logan-wasi-http.wasm` exists.

- [ ] **Step 3: Host runtime runner**

```toml
# add to tools/logan-wasm-sandbox/Cargo.toml
wasmtime = "28"
wasmtime-wasi = "28"
anyhow = "1"
```

```rust
// tools/logan-wasm-sandbox/src/runtime.rs
use anyhow::{bail, Context, Result};
use std::path::Path;
use wasmtime::*;
use wasmtime_wasi::preview1::{self, WasiP1Ctx};
use wasmtime_wasi::{WasiCtxBuilder, WasiCtx};

pub struct GuestRunResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_wasi_guest(wasm_path: &Path, args: &[String]) -> Result<GuestRunResult> {
    let engine = Engine::default();
    let module = Module::from_file(&engine, wasm_path)
        .with_context(|| format!("load wasm {}", wasm_path.display()))?;

    let mut linker: Linker<WasiP1Ctx> = Linker::new(&engine);
    preview1::add_to_linker_async(&mut linker, |cx| cx)?;

    // Sync API variant — if async-only in your wasmtime version, use block_on consistently.
    // Prefer the docs for wasmtime 28 WASI preview1 sync examples if compile fails.

    let stdout = wasmtime_wasi::pipe::MemoryOutputPipe::new(1024 * 1024);
    let stderr = wasmtime_wasi::pipe::MemoryOutputPipe::new(1024 * 1024);

    let mut wasi_builder = WasiCtxBuilder::new();
    wasi_builder.stdout(stdout.clone());
    wasi_builder.stderr(stderr.clone());
    for a in args {
        wasi_builder.arg(a);
    }
    // No preopens, no sockets, no env secrets.
    let wasi = wasi_builder.build_p1();

    let mut store = Store::new(&engine, wasi);
    let instance = linker.instantiate(&mut store, &module)?;
    let start = instance
        .get_typed_func::<(), ()>(&mut store, "_start")
        .or_else(|_| instance.get_typed_func::<(), ()>(&mut store, "_initialize"))
        .context("missing _start")?;

    let run = start.call(&mut store, ());
    let exit_code = match run {
        Ok(()) => 0,
        Err(e) => {
            // WASI proc_exit is often reported as a trap with i32 code — map unknown to 1
            let msg = format!("{e:#}");
            if let Some(code) = msg.rfind("exit").and_then(|_| None) {
                let _ = code;
            }
            // Fallback: non-zero
            if msg.contains("exit with code") {
                // best-effort parse left to implementer if trap type exposes code
                1
            } else {
                1
            }
        }
    };

    Ok(GuestRunResult {
        exit_code,
        stdout: String::from_utf8_lossy(&stdout.try_into_inner().unwrap_or_default()).into_owned(),
        stderr: String::from_utf8_lossy(&stderr.try_into_inner().unwrap_or_default()).into_owned(),
    })
}
```

**Note for implementer:** Wasmtime 28 WASI APIs shift between preview1/preview2. If the above linker types fail to compile, follow the **current** `wasmtime_wasi` crate docs for “command” style WASI and keep the same external behavior: run guest with args, capture stdout/stderr/exit, no network preopens. Do not expand scope.

- [ ] **Step 4: Wire `guest-http` CLI**

Add subcommand that:

1. Runs guest with `url` as argv[1]
2. If guest exit != 0 → fail closed JSON error
3. Else `http_get(policy, url)` and print same JSON as `http`

- [ ] **Step 5: Manual smoke**

```powershell
cargo build --manifest-path tools/logan-wasm-sandbox/Cargo.toml --release
# after guest wasm built:
.\tools\logan-wasm-sandbox\target\release\logan-wasm-sandbox.exe guest-http `
  --wasm tools\logan-wasi-http\target\wasm32-wasip1\release\logan-wasi-http.wasm `
  --allowlist security\proxy\allowed-domains.txt `
  --url https://evil.com/
```

Expected: denied (exit 2) after guest validates URL shape.

```powershell
.\tools\logan-wasm-sandbox\target\release\logan-wasm-sandbox.exe guest-http `
  --wasm tools\logan-wasi-http\target\wasm32-wasip1\release\logan-wasi-http.wasm `
  --allowlist security\proxy\allowed-domains.txt `
  --url https://api.openai.com/
```

Expected: ok true.

- [ ] **Step 6: Commit**

```powershell
git add tools/logan-wasi-http tools/logan-wasm-sandbox
git commit -m "feat(wasm-sandbox): run WASI guest then host-mediated HTTP"
```

---

### Task 5: Windows smoke script + docs pointer

**Files:**

- Create: `scripts/logan-wasm-smoke.ps1`
- Modify: `README.md` (add short WASM smoke section under Docker smoke)
- Modify: `docs/superpowers/specs/2026-07-13-logan-wasm-sandbox-ts7-design.md` — only if needed to note P1 CLI paths (prefer not; keep plan as source of truth)

- [ ] **Step 1: Write smoke script**

```powershell
# scripts/logan-wasm-smoke.ps1
#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$exe = Join-Path $Root "tools\logan-wasm-sandbox\target\release\logan-wasm-sandbox.exe"
if (-not (Test-Path $exe)) {
  cargo build --manifest-path tools/logan-wasm-sandbox/Cargo.toml --release
}
$allow = "security\proxy\allowed-domains.txt"

Write-Host "=== deny evil.com ==="
& $exe http --allowlist $allow --url "https://evil.com/"
if ($LASTEXITCODE -ne 2) { throw "expected exit 2 for deny, got $LASTEXITCODE" }

Write-Host "=== allow api.openai.com ==="
& $exe http --allowlist $allow --url "https://api.openai.com/"
if ($LASTEXITCODE -ne 0) { throw "expected exit 0 for allow, got $LASTEXITCODE" }

Write-Host "WASM_SMOKE_OK"
```

- [ ] **Step 2: Run smoke**

```powershell
.\scripts\logan-wasm-smoke.ps1
```

Expected: prints `WASM_SMOKE_OK`.

- [ ] **Step 3: README snippet**

Under Docker smoke section, add:

````markdown
## WASM sandbox smoke (no Docker)

```powershell
cargo build --manifest-path tools/logan-wasm-sandbox/Cargo.toml --release
.\scripts\logan-wasm-smoke.ps1
```
````

Host-mediated HTTPS with `security/proxy/allowed-domains.txt`. OpenClaw backend wiring is a later phase (see design spec).

````

- [ ] **Step 4: Commit**

```powershell
git add scripts/logan-wasm-smoke.ps1 README.md
git commit -m "docs: add logan-wasm-sandbox smoke script and README"
````

---

### Task 6: P1 acceptance checklist (no new features)

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

```powershell
cargo test --manifest-path tools/logan-wasm-sandbox/Cargo.toml
```

Expected: all PASS.

- [ ] **Step 2: Smoke**

```powershell
.\scripts\logan-wasm-smoke.ps1
```

Expected: `WASM_SMOKE_OK`.

- [ ] **Step 3: Confirm non-goals still hold**

- No OpenClaw gateway backend change required for P1 pass.
- No Docker required for smoke.
- Guest has no network capability.

- [ ] **Step 4: Final commit if dirty; push**

```powershell
git status
git push origin custom main
```

---

## Spec coverage (self-review)

| Spec P1 requirement            | Task                                              |
| ------------------------------ | ------------------------------------------------- |
| Rust host + policy             | Tasks 1–2                                         |
| Allowlist reuse of domain file | Tasks 1, 3, 5                                     |
| Host-mediated HTTPS            | Task 2–3                                          |
| Deny before connect            | Task 2 tests                                      |
| Timeouts / byte caps           | Task 2 `SandboxPolicy`                            |
| Wasmtime guest path            | Task 4                                            |
| CLI smoke allow/deny           | Tasks 3, 5                                        |
| No OpenClaw backend yet        | Explicit non-goal; deferred P2                    |
| TS 7                           | **Not in P1** (spec phase P3) — correctly omitted |
| Windows without WSL/Docker     | Task 5 smoke                                      |

## Placeholder scan

No TBD/TODO left for P1 deliverables. Wasmtime API note is an explicit “follow crate docs if versions drift” instruction with fixed external behavior.

## Type consistency

- `Allowlist::allows_host(&self, host: &str) -> bool`
- `SandboxPolicy { allowlist, timeout, max_response_bytes }`
- `http_get(policy, url) -> Result<HttpResult, HttpHostError>`
- CLI JSON: `ok` / `status` / `bytes` / `final_url` / `error` / `host`

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-13-logan-wasm-sandbox-host.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — this session with executing-plans checkpoints

**Which approach?**
