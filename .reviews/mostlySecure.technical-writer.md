# Technical Writer Review: mostlySecure.md

## Reviewer Persona

Documentation professional evaluating structure, findability, scannability, and task-orientation.

## Review Focus

"Can users find what they need and accomplish their tasks?"

---

## Questions and Concerns

**Q1**: Where is the prerequisites section, and how will users know if they can even attempt this setup?

- Location: Missing from document structure (should appear before "Setup: Step by Step")
- User impact: Users may spend hours working through the setup before discovering they lack required hardware (TPM 2.0), OS edition (Windows Pro/Enterprise for Credential Guard), or admin privileges. This wastes time and creates frustration.
- Resolution: Add a "Prerequisites" section before Step 1 listing: required Windows edition, TPM 2.0 presence, admin access, hardware requirements, software dependencies, and estimated setup time (e.g., "2-4 hours for first-time setup").

**Q2**: The TOC lists "Setup: Step by Step" but there are 11 steps with unclear time commitments per step.

- Location: Section 7 "Setup: Step by Step" and TOC entry
- User impact: Users cannot gauge time commitment, plan interruptions, or identify good stopping points. They don't know if they can complete this in one session or need to split it across days. Step 9 ("Enable Windows Hardening") may require a reboot, but this isn't flagged.
- Resolution: Add time estimates per step (e.g., "Step 1: Install YubiHSM 2 Software (15 minutes)"), indicate which steps require reboots or system changes, and provide natural breakpoints (e.g., "Steps 1-6 can be completed in one session; Steps 7-8 form a second session").

**Q3**: The relationship between sections is unclear - should users read sequentially or can they jump to setup?

- Location: Document structure overall, particularly the jump from "Concepts" to "Setup"
- User impact: Experienced users may want to skip to setup immediately, while novices need the concepts first. The document doesn't guide users on their reading path. There's no "Quick Start vs. Deep Dive" navigation aid.
- Resolution: Add a "How to Use This Document" section after the TOC explaining: "If you're familiar with HSMs and PKCS#11, jump to Setup. If these concepts are new, read Concepts first. If you want to understand the architecture, see How the Pieces Fit Together."

**Q4**: Code blocks lack clear "where to run this" indicators - terminal, shell prompt, or interactive console?

- Location: Throughout "Setup: Step by Step" (lines 392-515), particularly Steps 2-4 where commands mix shell and yubihsm-shell interactive mode
- User impact: Users cannot distinguish between commands run in cmd/PowerShell versus those run inside yubihsm-shell's interactive prompt. Step 2 shows "yubihsm>" as a prompt, but it's not explained. Users may try to paste "yubihsm> connect" literally into their terminal.
- Resolution: Add environment indicators above code blocks (e.g., "In yubihsm-shell interactive session:", "In PowerShell as Administrator:", "In Windows CMD:") and explain the "yubihsm>" prompt convention in Step 1 or 2.

**Q5**: Variables and placeholders use inconsistent notation - some have angle brackets, some don't.

- Location: Step 2 (line 403-404) uses "<new-password>" with angle brackets, Step 7 (line 477) uses "<hsm-auth-password>", but Step 3 (lines 416-422) provides no placeholder at all - just "none"
- User impact: Users are confused about which values they must replace. "none" in Step 3 looks like a literal value, not a placeholder. Some users will copy-paste literally, causing setup failures. Others will second-guess every parameter.
- Resolution: Adopt consistent placeholder notation (recommend `<angle-brackets>` or `YOUR_VALUE_HERE` in ALL_CAPS) and add a note: "Values shown as `<placeholder>` must be replaced with your own values. Do not include the angle brackets."

**Q6**: Step 5 provides two different methods for SSH configuration without explaining when to use which.

- Location: Step 5 "Configure SSH to Use the HSM" (lines 444-457)
- User impact: Users don't know whether to edit ~/.ssh/config OR use ssh-add, or both. The document presents alternatives without decision criteria. Different methods have different persistence (config file = permanent, ssh-add = session-only), but this isn't explained.
- Resolution: Restructure as "Method 1: Persistent (Recommended)" and "Method 2: Session-Based" with clear pros/cons. Add: "Use Method 1 if you want HSM SSH for all sessions. Use Method 2 for testing before committing to config changes."

**Q7**: Step 4 says "Convert to SSH format" but provides no conversion instructions or tool references.

- Location: Step 4 "Generate SSH Key on the HSM" (lines 426-440), specifically line 440
- User impact: Users are left with a raw public key from the HSM but no actionable way to convert it to SSH's authorized_keys format. This is a critical step - without it, SSH authentication will fail - yet it's treated as a throwaway comment. Users will get stuck here and abandon the setup or search external documentation.
- Resolution: Add explicit conversion command (e.g., "Use ssh-keygen -i to convert" or provide the exact yubihsm-shell export command that outputs SSH format) or link to Yubico documentation on this step. Include example output so users can verify their result.

**Q8**: The "Daily Workflow" section uses conversational examples but lacks mapping to actual commands.

- Location: Section 8 "Daily Workflow" (lines 541-564), particularly lines 556-559
- User impact: The workflow says '"SSH into logan" → ssh-agent signs via HSM, transparent' but doesn't show the actual command. Users who skimmed the setup won't know whether to run "ssh logan", "ssh hoskinson@20.245.79.3", or something else. The quotes suggest natural language, but this isn't a voice-activated system. Users need concrete examples.
- Resolution: Rewrite with actual commands mapped to outcomes: "$ ssh logan → (ssh-agent uses HSM key) → authenticated", "$ psql -c 'SELECT pgp_sym_encrypt(...)' → (OpenBao retrieves key from HSM) → data encrypted". Add a note: "These commands assume you've completed setup Steps 5 and 11."

**Q9**: The disaster recovery procedures lack verification steps - how do users know the restore worked?

- Location: Section 9 "Disaster Recovery" (lines 569-610), specifically "Scenario: YubiHSM 2 Dies" (lines 572-583)
- User impact: Users follow 8 steps to restore keys to a new HSM, but step 8 just says "Back in business" without any validation procedure. Users have no way to confirm the keys work until they try to SSH and it fails. Then they don't know which step went wrong. This creates anxiety and troubleshooting nightmares.
- Resolution: Add Step 9 to each scenario: "Verify restoration: Extract public key from restored HSM (yubihsm> get pubkey 0 100), compare with original public key fingerprint, attempt SSH connection to test server." Include expected success indicators.

**Q10**: Cross-references in the document don't follow a consistent pattern - some use section names, others use concepts.

- Location: Throughout document, e.g., Step 7 mentions "auto-unseal via the YubiHSM" (line 471) without linking back to the SCP03 or PKCS#11 concepts sections
- User impact: Users encounter terminology in setup steps that was defined earlier in Concepts, but there's no way to quickly jump back for a refresher. They must manually scroll or search. This breaks workflow and creates friction, especially for complex terms like "wrapped key export" (Step 10, line 508) which was explained in the Key Wrapping concept (lines 157-172).
- Resolution: Add markdown links to first occurrence of key terms in procedural sections: "auto-unseal via [PKCS#11](#pkcs11)", "export each key as a [wrapped blob](#key-wrapping)". Alternatively, add a glossary section with anchors and link all specialized terms.

**Q11**: The document has no troubleshooting section - what happens when things go wrong?

- Location: Missing from document structure (should appear after "Setup" or as subsections within steps)
- User impact: Users encounter predictable failure modes (connector won't start, HSM not detected, authentication fails, PKCS#11 DLL not found) with no guidance on diagnosis or resolution. They must Google, ask in forums, or abandon setup. Common issues like "Windows Firewall blocking port 12345" or "USB selective suspend interfering with HSM" are not addressed.
- Resolution: Add "Troubleshooting Common Issues" section with problem/solution pairs organized by setup step. Include: "Connector fails to start → check Windows Services, verify USB connection", "SSH auth fails → run ssh -vvv to see PKCS#11 debug output", "OpenBao won't unseal → verify HSM auth credential in Credential Manager".

**Q12**: The MCP server configuration in Step 11 appears disconnected from the rest of the setup flow.

- Location: Step 11 "Update MCP Server Config" (lines 517-538)
- User impact: This step suddenly introduces ".claude.json" and "MCP server" concepts that weren't mentioned in the problem statement, stack overview, or prerequisites. Users who aren't using Claude or MCP will be confused about whether this step is mandatory. The step says "No key path needed" but doesn't explain why this is better than the previous configuration or what changed.
- Resolution: Either: (1) Move this to an "Integration Examples" appendix and make it clearly optional, or (2) Add "MCP Integration" to the stack overview and explain what MCP is in a Concepts subsection. Add a note: "Skip this step if you're not using Claude with the SSH MCP server. The general principle (using ssh-agent instead of PEM files) applies to all SSH integrations."
