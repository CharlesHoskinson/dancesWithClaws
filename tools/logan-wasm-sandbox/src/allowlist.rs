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
