# Editorial Review: Mostly Secure

**Generated**: 2026-02-02
**Mode**: full
**Personas**: 5 (default)
**Document**: mostlySecure.md
**Lines**: 692
**References**: None

---

## Persona Reviews

### Junior Developer

**Background**: Recently completed bootcamp, new to this domain, relies on documentation.

**Lens**: "What assumed knowledge am I missing that would help me understand this?"

#### Questions

**Q1**: What is a PEM file and why is it "copyable"?

- **Location**: Section "The Problem" (line 26)
- **Why it matters**: The term is used without explanation. A junior may know SSH keys exist but not what PEM means or why a file format makes something more or less secure.
- **Resolution**: Add a brief explanation: "PEM (Privacy Enhanced Mail) is a common text-based format for storing private keys. Being a regular file, it can be copied like any other document."

**Q2**: What does "exfiltration" mean?

- **Location**: Section "The Problem" (line 29)
- **Why it matters**: Security jargon not defined. If the problem statement is unclear, the solution won't be appreciated.
- **Resolution**: Use plain language ("stolen") or define inline: "exfiltration (theft of data from a system)."

**Q3**: How do I actually use PKCS#11 "references" instead of file paths?

- **Location**: Step 5 (lines 444-457)
- **Why it matters**: The doc says SSH will use "HSM slot ID, not a file path" but shows a path to a .dll. No explanation of how the SSH client selects which key on the HSM.
- **Resolution**: Show a complete example including the slot/key identifier. Explain how the PKCS#11 driver enumerates available keys.

**Q4**: What are "capabilities" in the context of auth keys?

- **Location**: Step 3 (lines 411-423)
- **Why it matters**: Command syntax shows things like `sign-ecdsa,sign-eddsa` and `none` but the parameter structure is never explained.
- **Resolution**: Add syntax breakdown before the examples explaining each positional parameter.

**Q5**: How do I know my PC supports the required hardware features?

- **Location**: VBS & Credential Guard concept (line 174), Step 9 (line 495)
- **Why it matters**: TPM 2.0 and virtualization are required but no verification steps are given. A user might buy a $650 HSM only to find their hardware is incompatible.
- **Resolution**: Add a Prerequisites section with verification commands (tpm.msc, Task Manager > CPU > Virtualization, msinfo32).

**Q6**: What is AES-CCM and why does it matter for key wrapping?

- **Location**: Key Wrapping concept (line 161), Step 10 (line 506)
- **Why it matters**: "AES" is familiar but "CCM" is not explained.
- **Resolution**: Add brief explanation: "AES-CCM (Counter with CBC-MAC) is an authenticated encryption mode that both encrypts and verifies integrity."

**Q7**: What happens if Step 2 fails and I'm locked out?

- **Location**: Step 2 (lines 396-408)
- **Why it matters**: The instructions say to change the default password then delete the default auth key. No recovery guidance if something goes wrong between these steps.
- **Resolution**: Add safety note: verify the new auth key works in a second terminal before deleting the default. Mention factory reset as last resort.

**Q8**: How do I convert the HSM public key to SSH format?

- **Location**: Step 4 (lines 436-440)
- **Why it matters**: Says "Convert to SSH format" but provides no command or tool. This is a missing step that blocks setup completion.
- **Resolution**: Provide the actual conversion command (e.g., `ssh-keygen -i -m PKCS8 -f pubkey.pem`).

**Q9**: What is MPL 2.0 and why does it matter?

- **Location**: OpenBao description (line 248)
- **Why it matters**: License jargon without context. A junior doesn't know the software license landscape.
- **Resolution**: Either remove or briefly explain: "MPL 2.0 is a permissive open-source license, unlike HashiCorp's more restrictive BSL."

**Q10**: What is "mechanism 0x1085"?

- **Location**: Step 7 OpenBao config (line 479)
- **Why it matters**: Hex values without explanation are opaque and intimidating.
- **Resolution**: Explain: "0x1085 corresponds to a PKCS#11 mechanism identifier for the encryption operation OpenBao uses to unseal."

**Q11**: Where do I download the required software?

- **Location**: Steps 1 and 7 (lines 384-389, 469-481)
- **Why it matters**: No URLs, package names, or version guidance. Users will waste time searching.
- **Resolution**: Provide specific download links or at minimum official documentation URLs.

**Q12**: How does PostgreSQL actually use the HSM through OpenBao?

- **Location**: Step 8 (lines 483-492)
- **Why it matters**: Shows `CREATE EXTENSION pgcrypto` but no concrete example of encrypting data using OpenBao-managed keys. The integration is hand-waved.
- **Resolution**: Add working SQL examples showing encryption/decryption with OpenBao-managed keys.

---

### Domain Expert

**Background**: Senior engineer with 10+ years in hardware security, cryptography, and Windows infrastructure.

**Lens**: "Is this technically accurate and complete enough for production use?"

#### Questions

**Q1**: SCP03 encryption claim needs clarification regarding USB transport security.

- **Location**: SCP03 concept (lines 138-155)
- **Why it matters**: SCP03 encrypts command/response payloads but doesn't necessarily encrypt the USB transport layer itself. Physical USB interception may still be possible.
- **Resolution**: Clarify what is actually encrypted (payload) vs. USB transport. Add note about physical USB security requirements.

**Q2**: Missing key attestation discussion.

- **Location**: Step 4 (lines 426-432)
- **Why it matters**: Without attestation, you can't prove keys were generated inside the HSM rather than injected from outside. This defeats the non-extractable guarantee.
- **Resolution**: Document YubiHSM 2's attestation capabilities and verification procedures.

**Q3**: Wrap key export creates a critical single point of failure.

- **Location**: Step 10 (line 510)
- **Why it matters**: Exporting the wrap key itself raises circular dependency questions. If self-wrapped, the security model is unclear. The IronKey PIN becomes the sole protection for all keys.
- **Resolution**: Explain the wrap key export mechanism explicitly. Discuss security implications of exportable wrap keys.

**Q4**: No firmware authenticity or supply chain verification.

- **Location**: Hardware Components (lines 205-217)
- **Why it matters**: The entire security model depends on trusting the HSM hardware. No guidance on verifying authenticity.
- **Resolution**: Add supply chain section: ordering from authorized resellers, firmware verification, update procedures.

**Q5**: PKCS#11 PIN handling is critically underspecified.

- **Location**: Step 7 OpenBao config (line 477)
- **Why it matters**: Shows `pin = "<hsm-auth-password>"` in plaintext config. This contradicts the Credential Manager claim in the boot sequence (line 365) and undermines the security model.
- **Resolution**: Provide concrete instructions for secure PIN storage. Resolve the contradiction between config file and Credential Manager.

**Q6**: Concurrent session management and performance not addressed.

- **Location**: Hardware specs (line 210)
- **Why it matters**: SSH, OpenBao, and PostgreSQL may all hit the HSM concurrently. No performance characteristics, queue behavior, or session exhaustion handling documented.
- **Resolution**: Add performance section: operation latency, concurrent limits, session exhaustion errors and handling.

**Q7**: Auth key capability model is dangerously oversimplified.

- **Location**: Step 3 (lines 411-423)
- **Why it matters**: Auth keys grant access to domain "1" (all domains) with no object-level restrictions. The "ssh-signer" key can sign with ANY key in the HSM, not just the SSH key.
- **Resolution**: Explain domain filtering and object-level access control. Show properly scoped examples.

**Q8**: No audit logging or tamper detection discussed.

- **Location**: OpenBao description (lines 255-256)
- **Why it matters**: OpenBao audit logs are mentioned but HSM-level logging is absent. After a security incident, you need to know exactly what operations were performed.
- **Resolution**: Document audit capabilities at each layer (HSM, connector, OpenBao). Include log retrieval and analysis procedures.

**Q9**: Disaster recovery has untested failure modes.

- **Location**: DR section (lines 568-583)
- **Why it matters**: Firmware incompatibility between old/new HSM, partial import failures, and IronKey bit rot are unaddressed. No recommendation for periodic DR testing.
- **Resolution**: Add DR testing procedures with recommended frequency and validation steps.

**Q10**: No key lifecycle management or rotation discussed.

- **Location**: Missing entirely
- **Why it matters**: SSH keys need periodic rotation, encryption keys have lifetime limits, auth credentials should change after personnel changes.
- **Resolution**: Add key lifecycle section: rotation frequency by key type, rotation procedures, old key retirement.

**Q11**: OpenBao-PostgreSQL integration lacks concrete implementation.

- **Location**: Data flow (lines 327-347), Step 8 (lines 486-492)
- **Why it matters**: Is OpenBao doing envelope encryption or direct encryption? What about transaction performance and latency? pgcrypto is mentioned but not configured.
- **Resolution**: Provide concrete implementation: SQL examples, OpenBao API calls, performance characteristics, error handling.

**Q12**: Threat model ignores several real-world attack vectors.

- **Location**: Threat model tables (lines 614-648)
- **Why it matters**: Missing: firmware attacks, side-channel attacks, persistent compromise scenarios, software supply chain attacks on components.
- **Resolution**: Expand threat model or explicitly state which vectors are out of scope.

---

### Security Auditor

**Background**: Security professional with OWASP experience, thinks like attacker and defender.

**Lens**: "What attack surfaces are unmodeled or unexplained here?"

#### Questions

**Q1**: SCP03 credential vulnerable during initial setup.

- **Location**: Step 2 (lines 398-408)
- **Threat model**: Auth password entered in plaintext via CLI. Screen recording malware, command history, or shoulder surfing could capture it before Credential Guard contains it.
- **Resolution**: Add secure setup guidance: air-gapped generation, command history clearing, verify Credential Guard is active BEFORE first password entry.

**Q2**: yubihsm-connector exposes unauthenticated HTTP endpoint.

- **Location**: Connector description (lines 237-245)
- **Threat model**: Any local process can connect to `http://127.0.0.1:12345`. Pre-authentication operations, DoS vectors, and memory corruption vulnerabilities are unaddressed.
- **Resolution**: Add connector hardening: firewall rules, process isolation, monitoring for suspicious connections.

**Q3**: Capability misconfiguration has no verification procedure.

- **Location**: Step 3 (lines 411-423)
- **Threat model**: Typos in capability lists could silently grant excessive permissions. No command shown to audit existing capabilities after creation.
- **Resolution**: Add verification commands and examples of misconfiguration impact.

**Q4**: OpenBao config contradicts Credential Manager storage claim.

- **Location**: Step 7 (lines 469-480)
- **Threat model**: HSM PIN in plaintext config file is backed up, possibly version-controlled. Contradicts boot sequence description (line 365).
- **Resolution**: Resolve contradiction. Show production-safe configuration with Credential Manager integration.

**Q5**: Wrap key backup cryptography may be circular.

- **Location**: Step 10 (line 510)
- **Threat model**: If wrap key 200 is wrapped by itself, the security of the backup depends solely on the IronKey PIN. An attacker who defeats the PIN gets everything.
- **Resolution**: Explain the actual wrapping mechanism. Clarify whether IronKey PIN is the only protection layer.

**Q6**: No audit logging architecture.

- **Location**: OpenBao description (line 256)
- **Threat model**: Cannot detect active attacks or conduct post-breach forensics. Live session hijacking (acknowledged vulnerability) would go undetected.
- **Resolution**: Add comprehensive logging section: events per layer, tamper protection, SIEM integration, suspicious pattern examples.

**Q7**: No incident response for acknowledged vulnerabilities.

- **Location**: "What This Does NOT Protect Against" (lines 631-638)
- **Threat model**: Live session hijacking and HSM theft are acknowledged but have no detection or response procedures. Damage window between compromise and detection is undefined.
- **Resolution**: Add incident response playbook: detection methods, credential revocation procedures, damage assessment.

**Q8**: MCP server has undefined trust boundary with HSM.

- **Location**: Step 11 (lines 518-538)
- **Threat model**: MCP server accesses ssh-agent, which accesses HSM. No authorization boundary between AI agent requests and HSM signing operations. A compromised MCP server gets unrestricted key use.
- **Resolution**: Document trust boundary. Consider separate auth key for AI agents with logging, time-based restrictions, or manual approval.

**Q9**: No supply chain verification for HSM hardware.

- **Location**: Hardware Components (lines 205-217)
- **Threat model**: Counterfeit or tampered HSM could exfiltrate keys. No firmware attestation or authenticity verification documented.
- **Resolution**: Add supply chain security: purchase from authorized resellers, firmware verification, hardware inspection.

**Q10**: OpenBao storage backend security unspecified.

- **Location**: OpenBao description (lines 247-256), Step 8 (lines 484-492)
- **Threat model**: Where does OpenBao store its secrets? If filesystem-based, are they encrypted at rest? When unsealed, are all stored keys accessible to filesystem attackers?
- **Resolution**: Specify storage backend, encryption at rest, and what's exposed when OpenBao is unsealed vs. sealed.

**Q11**: No isolation between HSM consumers.

- **Location**: Layer diagram (lines 282-299)
- **Threat model**: SSH, OpenBao, and PostgreSQL share the HSM. A compromised SSH client might access database encryption keys if auth keys aren't properly scoped.
- **Resolution**: Document which auth keys serve which components. Show blast radius of single-component compromise.

**Q12**: HSM session exhaustion creates denial-of-service vector.

- **Location**: Hardware specs (line 210)
- **Threat model**: 16 concurrent sessions. Malicious process opens all 16, locking out legitimate use. No timeout, leak detection, or forced-close mechanism documented.
- **Resolution**: Document session lifecycle, timeout behavior, stale session cleanup, and DoS mitigation.

---

### Core Developer

**Background**: Built similar systems, knows code vs. docs gap, cares about accuracy.

**Lens**: "Does this actually match what we built and how it works?"

#### Questions

**Q1**: Are the YubiHSM 2 capacity and session limits accurate?

- **Location**: Hardware Components (lines 208-210)
- **Implementation reality**: 256 objects and 16 sessions sound correct but may vary by firmware version. No version specified.
- **Resolution**: Verify against current firmware specs and note which version applies.

**Q2**: Is the `put authkey` command syntax correct?

- **Location**: Steps 2-3 (lines 403-422)
- **Implementation reality**: Actual yubihsm-shell syntax requires 7 parameters. Document shows only 6. Password parameter appears missing.
- **Resolution**: Test exact commands against yubihsm-shell and correct syntax.

**Q3**: Does `delete 0 1 authkey` use the correct session ID?

- **Location**: Step 2 (line 405)
- **Implementation reality**: Session ID should be 2 (the newly opened session), not 0. Using 0 may fail or have unintended meaning.
- **Resolution**: Verify correct session-id parameter.

**Q4**: Are the capability names valid? Hyphens vs. underscores.

- **Location**: Step 3 (lines 414-422)
- **Implementation reality**: YubiHSM 2 uses underscores (`sign_ecdsa`), not hyphens (`sign-ecdsa`). Also, `encrypt-ecb`, `decrypt-ecb`, `encrypt-cbc`, `decrypt-cbc` are not actual capability names.
- **Resolution**: Replace with actual capability names from official documentation.

**Q5**: Is the `generate asymmetric` command syntax correct?

- **Location**: Step 4 (line 428)
- **Implementation reality**: Algorithm specifier "ed25519" may not be the correct string. YubiHSM may use different constants. Parameter count needs verification.
- **Resolution**: Verify exact command and algorithm specifier against yubihsm-shell.

**Q6**: Public key extraction lacks conversion command.

- **Location**: Step 4 (lines 436-440)
- **Implementation reality**: `get pubkey` outputs raw/PEM format, not SSH format. The conversion step is missing entirely.
- **Resolution**: Add the actual working conversion command pipeline.

**Q7**: Does OpenBao support PKCS#11 seal with this syntax?

- **Location**: Step 7 (lines 473-480)
- **Implementation reality**: This looks like HashiCorp Vault syntax. OpenBao forked from Vault and configuration may have diverged.
- **Resolution**: Verify against OpenBao documentation specifically, not Vault docs.

**Q8**: Is mechanism `0x1085` correct?

- **Location**: Step 7 (line 479)
- **Implementation reality**: `0x1085` is `CKM_AES_CBC_PAD`. Vault typically uses `CKM_AES_KEY_WRAP` (`0x2109`) or `CKM_AES_KEY_WRAP_PAD` (`0x210A`) for seal operations.
- **Resolution**: Verify correct mechanism value against Vault/OpenBao source code.

**Q9**: Is the wrap key generation command syntax correct?

- **Location**: Step 10 (line 506)
- **Implementation reality**: `aes256-ccm-wrap` may not be the correct algorithm specifier. Capability names appear incorrect (same hyphen issue).
- **Resolution**: Verify exact generate wrapkey syntax and algorithm specifier.

**Q10**: Self-wrapping the wrap key creates circular dependency.

- **Location**: Step 10 (line 510)
- **Implementation reality**: `get wrapped 0 200 wrapkey 200` wraps key 200 with itself. The restore procedure then needs key 200 to import key 200, which is impossible on a fresh HSM.
- **Resolution**: Clarify backup strategy. Either use a separate master wrap key or explain the actual bootstrap mechanism.

**Q11**: Disaster recovery restore commands are incorrect.

- **Location**: DR section (lines 576-582)
- **Implementation reality**: `put wrapped` syntax appears wrong. Parameter shown as auth-id should be wrap-key-id. Circular dependency with wrap key makes procedure impossible as written.
- **Resolution**: Provide tested, working restore commands that handle the wrap key bootstrap problem.

**Q12**: Does Windows ssh-agent support PKCS#11 providers?

- **Location**: Step 5 (line 456)
- **Implementation reality**: Windows native OpenSSH ssh-agent may not support `ssh-add -s` for PKCS#11. May require Pageant, WSL, or another agent implementation.
- **Resolution**: Test on Windows and document the working approach, including any alternative agent requirements.

---

### Technical Writer

**Background**: Documentation professional, information architecture expert.

**Lens**: "Can users find what they need and accomplish their tasks?"

#### Questions

**Q1**: No prerequisites section exists.

- **Location**: Missing before "Setup: Step by Step"
- **User impact**: Users may invest hours before discovering incompatible hardware or OS edition.
- **Resolution**: Add prerequisites: Windows edition, TPM 2.0, admin access, hardware list, software dependencies.

**Q2**: Setup steps lack time commitments and breakpoint indicators.

- **Location**: TOC and Step headers
- **User impact**: Users can't plan sessions or identify stopping points. Step 9 may require a reboot but doesn't say so.
- **Resolution**: Add time estimates per step and flag reboot/restart requirements.

**Q3**: No reading path guidance for different experience levels.

- **Location**: Document structure
- **User impact**: Experienced users can't skip to setup; novices don't know concepts are required reading.
- **Resolution**: Add "How to Use This Document" section after TOC.

**Q4**: Code blocks lack environment indicators.

- **Location**: Throughout Setup (lines 392-515)
- **User impact**: Users can't distinguish CMD/PowerShell commands from yubihsm-shell interactive prompts. "yubihsm> connect" might be pasted literally into a terminal.
- **Resolution**: Add environment labels above code blocks: "In yubihsm-shell:", "In PowerShell:", etc.

**Q5**: Placeholder notation is inconsistent.

- **Location**: Steps 2, 3, 7 (various lines)
- **User impact**: `<new-password>` has angle brackets, `none` looks literal. Users don't know what to replace.
- **Resolution**: Adopt consistent notation and add a note explaining placeholder convention.

**Q6**: Step 5 presents two methods without decision criteria.

- **Location**: Step 5 (lines 444-457)
- **User impact**: Users don't know whether to edit ssh config OR use ssh-add. Different persistence behavior not explained.
- **Resolution**: Label as "Method 1: Persistent (Recommended)" and "Method 2: Session-Based" with pros/cons.

**Q7**: Public key conversion instructions are missing.

- **Location**: Step 4 (line 440)
- **User impact**: Critical step treated as throwaway comment. Users get stuck with unusable output.
- **Resolution**: Add explicit conversion command with example output.

**Q8**: Daily Workflow uses conversational examples without actual commands.

- **Location**: Daily Workflow (lines 556-559)
- **User impact**: "SSH into logan" isn't an actual command. Users who skimmed setup won't know the real command.
- **Resolution**: Map actual commands to outcomes: `$ ssh logan` with annotation of what happens underneath.

**Q9**: Disaster recovery lacks verification steps.

- **Location**: DR section (lines 572-583)
- **User impact**: Step 8 says "Back in business" with no validation. Users can't confirm keys were restored correctly until something fails.
- **Resolution**: Add verification step: extract public key, compare fingerprint, test SSH connection.

**Q10**: No cross-references between concepts and setup steps.

- **Location**: Throughout
- **User impact**: Setup steps reference concepts (wrap keys, PKCS#11) without linking back. Users must scroll/search manually.
- **Resolution**: Add markdown anchor links from setup steps to concept definitions.

**Q11**: No troubleshooting section.

- **Location**: Missing from document
- **User impact**: Predictable failures (connector won't start, HSM not detected, auth fails) have no guidance.
- **Resolution**: Add troubleshooting section with problem/solution pairs per setup step.

**Q12**: MCP server config (Step 11) is disconnected from the rest of the document.

- **Location**: Step 11 (lines 517-538)
- **User impact**: Introduces ".claude.json" and "MCP" without prior context. Users not using Claude will be confused.
- **Resolution**: Move to an "Integration Examples" appendix or add MCP to the Concepts section.

---

## Cross-Cutting Themes

### Theme 1: Command Syntax Likely Broken

**Flagged by**: Core Developer, Junior Developer, Technical Writer

**Root cause**: Commands appear written from conceptual understanding rather than tested against actual hardware/software.

**Related questions**:

- Q2, Q3, Q4, Q5, Q9 (Core Developer): Incorrect parameter counts, wrong capability names, untested syntax
- Q8 (Junior Developer): Missing conversion command
- Q7 (Technical Writer): Same missing conversion step

**Recommended action**: Build the stack on a clean Windows machine with actual hardware. Document every command that executes successfully. Replace all untested commands with verified ones.

---

### Theme 2: Wrap Key Backup Is Circular / Impossible

**Flagged by**: Core Developer, Domain Expert, Security Auditor

**Root cause**: The document wraps key 200 with itself (key 200), creating a circular dependency that makes disaster recovery impossible on a fresh HSM.

**Related questions**:

- Q10, Q11 (Core Developer): Self-wrapping and broken restore commands
- Q3 (Domain Expert): Single point of failure
- Q5 (Security Auditor): Circular cryptography

**Recommended action**: Redesign the backup strategy. Either use a separate master wrap key, store the wrap key in plaintext on the IronKey (with explicit security trade-off discussion), or use a different export mechanism.

---

### Theme 3: HSM Auth Password Storage Contradicts Security Model

**Flagged by**: Domain Expert, Security Auditor, Core Developer

**Root cause**: Step 7 shows the HSM PIN in a plaintext config file, but the boot sequence claims it's stored in Credential Manager. Both can't be true, and the plaintext version defeats the security model.

**Related questions**:

- Q5 (Domain Expert): PIN handling critically underspecified
- Q4 (Security Auditor): Contradictory secret storage guidance
- Q7, Q8 (Core Developer): OpenBao config syntax may be wrong anyway

**Recommended action**: Resolve the contradiction. Document the actual production-safe mechanism for providing the HSM PIN to OpenBao at startup without storing it in plaintext.

---

### Theme 4: Missing Prerequisites and Verification

**Flagged by**: Junior Developer, Technical Writer, Domain Expert

**Root cause**: No prerequisites section, no hardware compatibility checks, no verification steps after critical operations.

**Related questions**:

- Q5 (Junior Developer): Hardware compatibility unknown before purchase
- Q1, Q9 (Technical Writer): Missing prerequisites and DR verification
- Q9 (Domain Expert): DR never tested

**Recommended action**: Add a Prerequisites section with specific hardware/software requirements and verification commands. Add verification steps after each critical setup stage and DR procedure.

---

### Theme 5: No Operational Security (Logging, Monitoring, Incident Response)

**Flagged by**: Security Auditor, Domain Expert

**Root cause**: Document covers setup but not operations. No guidance on detecting attacks, responding to incidents, or maintaining the system over time.

**Related questions**:

- Q6, Q7 (Security Auditor): No audit logging, no incident response
- Q8, Q10 (Domain Expert): No audit capabilities, no key lifecycle management
- Q12 (Domain Expert): Incomplete threat model

**Recommended action**: Add "Operations" section covering: audit logging at each layer, monitoring and alerting, incident response playbook, key rotation procedures, and periodic DR testing.

---

### Theme 6: PostgreSQL Integration Is Hand-Waved

**Flagged by**: Junior Developer, Domain Expert

**Root cause**: Step 8 shows only `CREATE EXTENSION pgcrypto` with no concrete integration details.

**Related questions**:

- Q12 (Junior Developer): No working SQL examples
- Q11 (Domain Expert): Architecture unclear (envelope encryption vs. direct?)

**Recommended action**: Either provide concrete implementation with working SQL and OpenBao API examples, or remove PostgreSQL from the scope and focus on SSH key protection.

---

## Prose Quality Assessment

| Dimension        | Rating | Key Observations                                                                                                                                                                                              |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clarity**      | Good   | Strong conceptual explanations, excellent ASCII diagrams, logical progression from problem to solution. Jargon is defined in the Concepts section, though not always at point of use in Setup.                |
| **Accuracy**     | Poor   | Multiple command syntax issues (hyphens vs. underscores, missing parameters, wrong mechanism IDs). Circular wrap key backup. Contradictory PIN storage guidance. Commands unlikely to execute as written.     |
| **Completeness** | Fair   | Strong conceptual coverage and threat model. Setup steps exist but lack conversion commands, verification steps, and troubleshooting. PostgreSQL integration is skeletal. No operations/maintenance guidance. |
| **Style**        | Good   | Direct, conversational tone. No detectable AI writing patterns. Good use of tables, diagrams, and layered explanation. Consistent formatting. The em-dash usage (---) is frequent but serves clarity.         |

### Strengths

- Excellent problem framing with the BEFORE/AFTER diagram
- Strong conceptual explanations with good analogies (notary stamp)
- Comprehensive ASCII architecture diagrams
- Honest threat model including what the system does NOT protect against
- Clean layered structure from concepts through implementation to operations
- Conversational but precise tone

### Areas for Improvement

- All command syntax needs testing against actual hardware
- Wrap key backup strategy needs redesign
- PIN storage contradiction needs resolution
- Missing prerequisites, verification steps, and troubleshooting
- PostgreSQL integration needs concrete examples or removal from scope
- No operational guidance (logging, monitoring, key rotation, incident response)

---

## Prioritized Checklist

### P0: Blocking (Must Fix)

- [ ] **Step 3**: Capability names use hyphens (`sign-ecdsa`) but YubiHSM uses underscores (`sign_ecdsa`); `encrypt-ecb`, `decrypt-cbc` are not real capabilities
- [ ] **Step 10**: Wrap key self-wrapping (`get wrapped 0 200 wrapkey 200`) creates circular dependency making disaster recovery impossible
- [ ] **DR section**: Restore commands have wrong syntax and impossible bootstrap (need wrap key to import wrap key)
- [ ] **Step 7**: PKCS#11 mechanism `0x1085` (`CKM_AES_CBC_PAD`) is likely wrong; should be `0x2109` (`CKM_AES_KEY_WRAP`) or similar
- [ ] **Step 7 vs. Boot Sequence**: Contradictory guidance on HSM PIN storage (plaintext config file vs. Credential Manager)

### P1: High Priority (Should Fix)

- [ ] **Step 2**: `put authkey` and `delete` commands likely have incorrect parameter counts or session IDs
- [ ] **Step 4**: Missing public key to SSH format conversion command
- [ ] **Step 5**: Windows ssh-agent may not support PKCS#11 via `ssh-add -s`; needs verification
- [ ] **Missing section**: No prerequisites (hardware requirements, Windows edition, TPM verification)
- [ ] **Step 3**: Auth keys grant access to all HSM domains with no object-level scoping
- [ ] **Step 7**: OpenBao seal config syntax may have diverged from Vault after fork
- [ ] **Step 2**: No warning about lockout risk when deleting default auth key
- [ ] **Missing section**: No troubleshooting guidance for predictable failures

### P2: Medium Priority (Next Revision)

- [ ] **Missing section**: Key lifecycle management (rotation, retirement)
- [ ] **Missing section**: Audit logging and monitoring architecture
- [ ] **Missing section**: Incident response playbook for compromise scenarios
- [ ] **Step 8**: PostgreSQL integration needs concrete SQL examples or removal from scope
- [ ] **Throughout**: Add cross-reference links from setup steps to concept definitions
- [ ] **DR section**: Add verification steps to confirm restore succeeded
- [ ] **Throughout**: Add environment indicators above code blocks (PowerShell vs. yubihsm-shell)
- [ ] **Missing section**: Firmware verification and supply chain validation
- [ ] **Step 11**: MCP server step needs context or should move to appendix
- [ ] **Missing section**: Concurrent session management and performance characteristics

### P3: Low Priority (Nice to Have)

- [ ] **The Problem**: Define "PEM" and "exfiltration" inline
- [ ] **Concepts**: Explain AES-CCM briefly when first used
- [ ] **OpenBao**: Remove or explain "MPL 2.0" license reference
- [ ] **Step 7**: Explain mechanism hex value in a comment
- [ ] **Setup**: Add download links for all required software
- [ ] **Daily Workflow**: Replace conversational examples with actual commands
- [ ] **Structure**: Add "How to Use This Document" reading path guide
- [ ] **Step 5**: Label SSH config methods as "Persistent" vs. "Session-Based"

---

## Summary

### Statistics

| Metric               | Count |
| -------------------- | ----- |
| Total questions      | 60    |
| Cross-cutting themes | 6     |
| P0 findings          | 5     |
| P1 findings          | 8     |
| P2 findings          | 10    |
| P3 findings          | 8     |

### Overall Assessment

The document provides an excellent conceptual foundation for hardware-backed key management with strong pedagogical quality --- the problem framing, ASCII diagrams, and layered explanations are well-crafted. However, the implementation sections contain critical accuracy issues: command syntax that won't execute as written, a circular backup strategy that makes disaster recovery impossible, and contradictory PIN storage guidance that undermines the security model.

The five P0 issues must be resolved before anyone follows this guide. The most impactful fix is to build the entire stack on actual hardware and replace all commands with tested, verified versions.

### Recommended Next Steps

1. **Test all commands on real hardware** --- set up a clean Windows machine with an actual YubiHSM 2 and execute every step. Replace broken commands with working ones.
2. **Redesign the wrap key backup strategy** --- resolve the circular self-wrapping problem with a viable bootstrap mechanism.
3. **Resolve the PIN storage contradiction** --- decide whether OpenBao reads from a config file or Credential Manager and document the actual working approach.
4. **Add prerequisites section** --- hardware/software requirements with verification commands.
5. **Add operational sections** --- logging, monitoring, key rotation, and incident response.
