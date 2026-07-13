//! Run a pure-compute WASI guest (no sockets / preopens / env secrets).
//!
//! P1 shape: guest validates URL format and exits 0/non-zero; host then
//! performs allowlisted HTTP. Full WIT host imports are deferred to P2.

use anyhow::{Context, Result};
use std::path::Path;
use wasmtime::{Engine, Linker, Module, Store};
use wasmtime_wasi::pipe::MemoryOutputPipe;
use wasmtime_wasi::preview1::{self, WasiP1Ctx};
use wasmtime_wasi::{I32Exit, WasiCtxBuilder};

pub struct GuestRunResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Execute a wasm32-wasip1 command module with the given argv.
///
/// Guest receives only argv (no inherited env, no preopens, TCP/UDP disabled).
/// `args[0]` should be the program name; remaining args are guest argv.
pub fn run_wasi_guest(wasm_path: &Path, args: &[String]) -> Result<GuestRunResult> {
    let engine = Engine::default();
    let module = Module::from_file(&engine, wasm_path)
        .with_context(|| format!("load wasm {}", wasm_path.display()))?;

    let mut linker: Linker<WasiP1Ctx> = Linker::new(&engine);
    // Sync linker: host CLI is async only for reqwest; guest run is pure compute.
    preview1::add_to_linker_sync(&mut linker, |cx| cx)?;

    let stdout = MemoryOutputPipe::new(1024 * 1024);
    let stderr = MemoryOutputPipe::new(1024 * 1024);

    let mut wasi_builder = WasiCtxBuilder::new();
    wasi_builder.stdout(stdout.clone());
    wasi_builder.stderr(stderr.clone());
    // Prefer blocking WASI host ops on the current (blocking) thread.
    wasi_builder.allow_blocking_current_thread(true);
    // No preopens, no inherited env secrets. Deny sockets explicitly.
    wasi_builder.allow_tcp(false);
    wasi_builder.allow_udp(false);
    wasi_builder.allow_ip_name_lookup(false);
    for a in args {
        wasi_builder.arg(a);
    }
    let wasi = wasi_builder.build_p1();

    let mut store = Store::new(&engine, wasi);
    let instance = linker
        .instantiate(&mut store, &module)
        .context("instantiate guest module")?;
    let start = instance
        .get_typed_func::<(), ()>(&mut store, "_start")
        .or_else(|_| instance.get_typed_func::<(), ()>(&mut store, "_initialize"))
        .context("missing _start")?;

    let run = start.call(&mut store, ());
    let exit_code = match run {
        Ok(()) => 0,
        Err(e) => {
            // WASI proc_exit is reported as I32Exit (including exit 0).
            if let Some(exit) = e.downcast_ref::<I32Exit>() {
                exit.0
            } else {
                // Unknown trap / link error → fail closed
                1
            }
        }
    };

    // Capture pipes while clones may still exist; contents() is shared.
    let stdout_s = String::from_utf8_lossy(&stdout.contents()).into_owned();
    let stderr_s = String::from_utf8_lossy(&stderr.contents()).into_owned();
    drop(store);

    Ok(GuestRunResult {
        exit_code,
        stdout: stdout_s,
        stderr: stderr_s,
    })
}
