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
                    eprintln!(
                        "{{\"ok\":false,\"error\":\"policy\",\"message\":{}}}",
                        serde_json::to_string(&e.to_string()).unwrap()
                    );
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
