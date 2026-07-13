//! Optionally build the WASI guest when wasm32-wasip1 is installed.
//!
//! Failure to build the guest is non-fatal so host-only CI still works.

use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Rebuild host if guest sources change.
    let guest_manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("logan-wasi-http")
        .join("Cargo.toml");
    println!("cargo:rerun-if-changed={}", guest_manifest.display());
    let guest_main = guest_manifest
        .parent()
        .unwrap()
        .join("src")
        .join("main.rs");
    println!("cargo:rerun-if-changed={}", guest_main.display());

    let has_target = Command::new("rustup")
        .args(["target", "list", "--installed"])
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .any(|l| l.trim() == "wasm32-wasip1")
        })
        .unwrap_or(false);

    if !has_target {
        println!("cargo:warning=wasm32-wasip1 not installed; skip guest build (rustup target add wasm32-wasip1)");
        return;
    }

    if !guest_manifest.is_file() {
        println!(
            "cargo:warning=guest crate missing at {}; skip guest build",
            guest_manifest.display()
        );
        return;
    }

    let status = Command::new("cargo")
        .args([
            "build",
            "--manifest-path",
            guest_manifest.to_str().unwrap_or(""),
            "--release",
            "--target",
            "wasm32-wasip1",
        ])
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("cargo:warning=built logan-wasi-http.wasm (wasm32-wasip1 release)");
        }
        Ok(s) => {
            println!(
                "cargo:warning=guest build failed with status {s}; host still builds"
            );
        }
        Err(e) => {
            println!("cargo:warning=could not invoke cargo for guest build: {e}");
        }
    }
}
