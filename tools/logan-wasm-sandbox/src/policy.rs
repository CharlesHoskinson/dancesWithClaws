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
