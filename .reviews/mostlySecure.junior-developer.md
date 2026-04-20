# Junior Developer Review: Mostly Secure

**Reviewer**: Junior Developer
**Document**: mostlySecure.md
**Date**: 2026-02-02

## Review Lens

> "What assumed knowledge am I missing that would help me understand this?"

## Questions and Concerns

**Q1**: What is a PEM file and why is it "copyable"?

- Location: Section "The Problem" (line 26)
- Why it matters: The document assumes I know what a PEM file is and why it's problematic. The term is used without explanation, and the fundamental security issue relies on understanding file formats for keys. As a junior developer, I've heard of SSH keys but don't know what PEM means or why a file format would make something more/less secure.
- Resolution: Add a brief explanation like "PEM (Privacy Enhanced Mail) is a common text-based format for storing private keys. Being a regular file, it can be copied like any other document on your system." Also explain what `.ssh/id_rsa` contains for readers who may not have set up SSH before.

**Q2**: What does "exfiltration" mean?

- Location: Section "The Problem" (line 29)
- Why it matters: This is security jargon that's not defined. I can guess from context it means "stealing," but technical documents should define terms, especially in a section explaining the core problem. If I don't understand the problem statement, I can't appreciate the solution.
- Resolution: Use plain language ("stolen") or provide a definition: "exfiltration (theft of data from a system)."

**Q3**: How do I actually use PKCS#11 "references" instead of file paths?

- Location: Section "Setup Step 5" (lines 444-457) and mentioned throughout
- Why it matters: The document says SSH will use "HSM slot ID, not a file path" but the example shows a path to a .dll file. I don't understand what a "slot ID" is, where I find it, or how the SSH client knows which key to use. The config shows `PKCS11Provider` pointing to a DLL, but no mention of how to specify which specific key on the HSM to use for authentication.
- Resolution: Show a complete example that includes the slot/key identifier. Explain: "The PKCS11Provider line tells SSH where the driver is. The driver will enumerate available keys on the HSM and present them to SSH. If you have multiple keys, you may need to use `ssh-add -s` to specify which key, or use the CertificateFile directive with a public key that references the private key on the HSM."

**Q4**: What are "capabilities" in the context of auth keys?

- Location: Section "Step 3: Create Operational Auth Keys" (lines 411-423)
- Why it matters: The command syntax shows things like `sign-ecdsa,sign-eddsa` and `none` but I don't understand what these parameters mean or what the available options are. The document shows three examples but doesn't explain the pattern or syntax rules. What goes in each position? What does "none" mean in the last position?
- Resolution: Add a syntax explanation before the examples: "Auth key syntax: `put authkey <domains> <key-id> <label> <domains> <capabilities> <delegated-capabilities>`. Capabilities limit what this auth key can do (e.g., sign-ecdsa means it can sign with ECDSA keys). Delegated capabilities (shown as 'none' here) define what auth keys THIS key can create. For security, we give operational keys no delegation rights."

**Q5**: How do I know my PC supports the required hardware features?

- Location: Section "Concepts: VBS & Credential Guard" (line 174) and Setup Step 9 (line 495)
- Why it matters: The document mentions needing "Intel VT-x / AMD-V" and TPM 2.0, but doesn't explain how to check if my computer has these features before I start this expensive setup. I might buy a $650 YubiHSM only to find my laptop can't run Credential Guard. This is a critical prerequisite that should be checked first.
- Resolution: Add a "Prerequisites" section at the beginning of Setup with commands/steps to verify: "Check TPM: Run `tpm.msc` in Windows. Check virtualization: Task Manager > Performance > CPU, look for 'Virtualization: Enabled'. Check Credential Guard compatibility: Run `msinfo32`, look for 'Virtualization-based security'."

**Q6**: What is AES-CCM and why does it matter for key wrapping?

- Location: Section "Concepts: Key Wrapping" (line 161) and Step 10 (line 506)
- Why it matters: The document mentions "AES-CCM" as the encryption method for wrapped keys but assumes I know what this is and why it's secure. As a junior, I know "AES" is encryption but not what "CCM" adds or why this specific mode is used for key wrapping versus regular data encryption.
- Resolution: Add a brief explanation: "AES-CCM (Counter with CBC-MAC) is an authenticated encryption mode that both encrypts and verifies integrity. For key wrapping, this ensures the wrapped blob hasn't been tampered with and will only decrypt if it's exactly what the HSM encrypted."

**Q7**: What happens if Step 2 fails and I'm locked out?

- Location: Section "Step 2: Initialize the YubiHSM 2" (lines 396-408)
- Why it matters: The instructions tell me to change the default password, then delete the default auth key. But what if something goes wrong between step 404 (open session with new password) and step 405 (delete old key)? What if I typo the new password? The document doesn't explain the recovery process or warn me to test the new auth key multiple times before deleting the default. This is intimidating for a first-time HSM user.
- Resolution: Add a safety note: "IMPORTANT: Before running the delete command, open a second terminal and verify you can open a session with the new auth key. Keep both sessions open. Only delete the default auth key after confirming the new one works. If you lock yourself out at this stage, you'll need to factory reset the HSM."

**Q8**: How do I convert the HSM public key to SSH format?

- Location: Section "Step 4: Generate SSH Key on the HSM" (line 434-440)
- Why it matters: The document says "Extract the public key" and then "Convert to SSH format" but provides no command or tool for the conversion. The `get pubkey` command presumably outputs in some HSM-specific format, but I don't know what that looks like or how to convert it to the format that goes in `authorized_keys`. This is a missing step that will block me from completing the setup.
- Resolution: Provide the conversion command or tool. Example: "The `get pubkey` command outputs in PEM format. Convert it to SSH format using: `ssh-keygen -i -m PKCS8 -f pubkey.pem > id_ed25519.pub`. Then copy the contents to the remote server's `~/.ssh/authorized_keys` file."

**Q9**: What is MPL 2.0 and why does it matter that OpenBao uses it?

- Location: Section "Software Components: OpenBao" (line 248)
- Why it matters: The document mentions "MPL 2.0" as if it's significant, but doesn't explain what this license means or why it's relevant to the reader. As a junior, I don't know the landscape of software licenses or why this particular one is worth mentioning compared to alternatives.
- Resolution: Either remove the license detail (not essential for understanding the setup) or briefly explain: "MPL 2.0 (Mozilla Public License 2.0) is a permissive open-source license that allows commercial use. Unlike HashiCorp's recent license changes that restrict certain commercial uses, OpenBao remains fully open-source."

**Q10**: What is "mechanism 0x1085"?

- Location: Section "Step 7: Install and Configure OpenBao" (line 479)
- Why it matters: The configuration example shows `mechanism = "0x1085"` but doesn't explain what this hex value represents or how I would know to use this specific value versus others. Is this always the same value? Is it specific to YubiHSM? The document doesn't explain where this number comes from or what mechanisms are available.
- Resolution: Add an explanation: "The mechanism value 0x1085 corresponds to CKM_AES_KEY_WRAP in the PKCS#11 specification, which tells OpenBao to use AES key wrapping for the unseal operation. This is the standard mechanism for YubiHSM 2 with OpenBao/Vault."

**Q11**: Where do I download OpenBao and the YubiHSM software?

- Location: Steps 1 and 7 (lines 384-389, 469-481)
- Why it matters: The document says "Download and install from Yubico" and "Install OpenBao for Windows" but provides no URLs, package names, or guidance on which version to get. As a junior, I might find multiple options (SDK vs. tools vs. libraries) and not know which to choose. Without links, I'll spend time searching and may install the wrong components.
- Resolution: Provide specific download links or package names. Example: "Download from https://developers.yubico.com/YubiHSM2/Releases/ - you need three components: (1) yubihsm-connector installer, (2) yubihsm-shell installer, (3) PKCS#11 library DLL. For OpenBao, visit https://openbao.org/downloads/ and get the Windows AMD64 binary."

**Q12**: How does PostgreSQL actually use the HSM through OpenBao?

- Location: Section "Step 8: Install and Configure PostgreSQL" (lines 483-492)
- Why it matters: The document shows enabling pgcrypto and says "Application-level encryption uses keys retrieved from OpenBao at runtime" but provides no concrete example of how to actually encrypt a column or how the application queries OpenBao for keys. The data flow diagram at line 327 shows the concept, but I need to see actual SQL or code to understand the implementation. This gap means I can't actually set up encrypted database columns after finishing the setup.
- Resolution: Add a complete example showing: (1) How to configure the PostgreSQL connection to OpenBao (environment variables? connection string?), (2) Sample SQL that encrypts/decrypts a column using OpenBao-managed keys, (3) Whether this requires custom application code or if pgcrypto can directly integrate with OpenBao.

---

## Summary

As a Junior Developer, I find this document intimidating despite its comprehensive scope. The core concepts are well-explained with helpful diagrams, but the setup section assumes significant prior knowledge about:

1. **Cryptographic concepts**: Terms like PEM, exfiltration, AES-CCM, and mechanism IDs are used without definition
2. **Command syntax**: Many commands show examples without explaining the parameter structure or available options
3. **Missing steps**: Critical steps like public key format conversion and PostgreSQL-OpenBao integration are glossed over
4. **Prerequisites**: No guidance on checking hardware compatibility before investing in expensive equipment
5. **Error recovery**: Limited discussion of what to do when steps fail, particularly during the critical HSM initialization
6. **Resource locations**: No download links or specific version guidance for software components

The document would significantly benefit from:

- A prerequisites checklist at the beginning
- Definitions of security jargon when first introduced
- Complete, runnable examples for each setup step
- Troubleshooting guidance for common failure points
- Links to official documentation for each component

The conceptual sections (Concepts, How the Pieces Fit Together) are excellent for understanding the "why." The setup section needs more hand-holding for the "how" to be accessible to developers new to HSM and key management systems.
