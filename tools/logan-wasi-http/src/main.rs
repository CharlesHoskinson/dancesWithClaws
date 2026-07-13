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
