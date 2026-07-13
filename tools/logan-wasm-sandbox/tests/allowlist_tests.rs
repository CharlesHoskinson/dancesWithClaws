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
