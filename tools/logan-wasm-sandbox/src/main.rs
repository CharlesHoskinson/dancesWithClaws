use clap::{Parser, Subcommand};
use logan_wasm_sandbox::http_host::{http_get, HttpHostError};
use logan_wasm_sandbox::policy::SandboxPolicy;
use logan_wasm_sandbox::runtime::run_wasi_guest_timed;
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
    /// Run WASI guest URL validator, then host-mediated HTTPS GET if guest exits 0
    GuestHttp {
        /// Path to logan-wasi-http.wasm (wasm32-wasip1)
        #[arg(long)]
        wasm: PathBuf,
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
        } => run_http(allowlist, url, timeout_secs, max_bytes).await,
        Commands::GuestHttp {
            wasm,
            allowlist,
            url,
            timeout_secs,
            max_bytes,
        } => run_guest_http(wasm, allowlist, url, timeout_secs, max_bytes).await,
    }
}

async fn run_http(
    allowlist: PathBuf,
    url: String,
    timeout_secs: u64,
    max_bytes: usize,
) -> ExitCode {
    let policy = match SandboxPolicy::from_allowlist_path(
        &allowlist,
        Duration::from_secs(timeout_secs),
        max_bytes,
    ) {
        Ok(p) => p,
        Err(e) => {
            eprintln!(
                "{{\"ok\":false,\"error\":\"policy\",\"message\":{}}}",
                serde_json::to_string(&e.to_string()).unwrap()
            );
            return ExitCode::from(1);
        }
    };
    emit_http_result(http_get(&policy, &url).await)
}

async fn run_guest_http(
    wasm: PathBuf,
    allowlist: PathBuf,
    url: String,
    timeout_secs: u64,
    max_bytes: usize,
) -> ExitCode {
    // Guest argv: program name + URL (guest reads nth(1)).
    let guest_args = vec!["logan-wasi-http".to_string(), url.clone()];
    // Same wall-clock budget as host HTTP (`SandboxPolicy.timeout` / CLI timeout_secs).
    let guest_timeout = Duration::from_secs(timeout_secs);
    // Wasmtime WASI sync APIs use an internal block_on; must not run on the
    // Tokio worker thread (nested runtime panic). Wall-clock timeout so a
    // hostile/buggy guest cannot hang the CLI await forever.
    let guest = match run_wasi_guest_timed(wasm, guest_args, guest_timeout).await {
        Ok(r) => r,
        Err(e) => {
            let message = format!("{e:#}");
            let error = if message.contains("guest timeout") {
                "guest timeout"
            } else {
                "guest"
            };
            println!(
                "{}",
                serde_json::json!({
                    "ok": false,
                    "error": error,
                    "message": message,
                })
            );
            // Fail closed: do not call http_get after guest timeout/error.
            return ExitCode::from(1);
        }
    };

    if guest.exit_code != 0 {
        // Fail closed: guest rejected URL shape (or trapped).
        println!(
            "{}",
            serde_json::json!({
                "ok": false,
                "error": "guest",
                "exit_code": guest.exit_code,
                "stderr": guest.stderr.trim(),
                "stdout": guest.stdout.trim(),
            })
        );
        return ExitCode::from(1);
    }

    let policy = match SandboxPolicy::from_allowlist_path(
        &allowlist,
        Duration::from_secs(timeout_secs),
        max_bytes,
    ) {
        Ok(p) => p,
        Err(e) => {
            eprintln!(
                "{{\"ok\":false,\"error\":\"policy\",\"message\":{}}}",
                serde_json::to_string(&e.to_string()).unwrap()
            );
            return ExitCode::from(1);
        }
    };

    // Host performs the real GET; guest never had sockets.
    emit_http_result(http_get(&policy, &url).await)
}

fn emit_http_result(result: Result<logan_wasm_sandbox::http_host::HttpResult, HttpHostError>) -> ExitCode {
    match result {
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
