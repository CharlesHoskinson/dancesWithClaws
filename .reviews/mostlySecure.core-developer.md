# Core Developer Review: mostlySecure.md

**Reviewer**: Core Developer
**Date**: 2026-02-02
**Focus**: Implementation accuracy, API correctness, actual behavior vs. documented behavior

---

## Executive Summary

Reviewing this document against actual implementation behavior of YubiHSM 2, PKCS#11, OpenBao/Vault, and Windows security infrastructure. This review identifies discrepancies between documented procedures and actual API behavior, missing error cases, and configuration inaccuracies.

---

## Detailed Questions and Concerns

**Q1**: Are the YubiHSM 2 capacity and session limits accurate?

- **Location**: Hardware Components section, lines 208-210
- **Implementation reality**: The document states "Stores up to 256 key objects" and "16 concurrent authenticated sessions". Need to verify these are the actual hardware limits for YubiHSM 2 and not confusing them with YubiKey 5 limits. The 256 object limit sounds correct, but the session count needs verification as the actual concurrent session limit may vary by firmware version.
- **Resolution**: Verify against current YubiHSM 2 firmware specifications. If these limits vary by firmware version, note which version these specs apply to.

**Q2**: Is the `put authkey` command syntax actually correct?

- **Location**: Step 2 and Step 3 setup sections, lines 403-422
- **Implementation reality**: The documented syntax shows `put authkey 0 2 "admin" 1 all all <new-password>` and similar commands. The actual yubihsm-shell syntax for `put authkey` is: `put authkey <session-id> <key-id> <label> <domains> <capabilities> <delegated-capabilities> <password>`. The document shows only 6 parameters but should have 7. The "1" likely represents domains, but what about delegated capabilities? The syntax appears incomplete or incorrect.
- **Resolution**: Test these exact commands against yubihsm-shell v2.x and correct the syntax. Specify which version of yubihsm-shell these commands are for.

**Q3**: Does `delete 0 1 authkey` actually work as shown?

- **Location**: Step 2, line 405
- **Implementation reality**: The syntax `delete 0 1 authkey` appears suspicious. The actual yubihsm-shell delete command syntax is `delete <session-id> <object-id> <object-type>`. The session-id should be the currently open session (2, not 0), making it `delete 2 1 authkey`. Using session-id 0 may not work or may have special meaning not explained.
- **Resolution**: Verify the correct session-id parameter. If 0 has special meaning (like "current session"), document that explicitly.

**Q4**: Are the capability names in Step 3 actually valid?

- **Location**: Step 3, lines 414-422
- **Implementation reality**: The document uses capability names like `sign-ecdsa`, `sign-eddsa`, `encrypt-ecb`, `decrypt-ecb`, `encrypt-cbc`, `decrypt-cbc`, `export-wrapped`, `import-wrapped`. The actual YubiHSM 2 capability names use underscores, not hyphens: `sign_ecdsa`, `sign_eddsa`, `exportable_under_wrap`, `import_wrapped`, etc. Additionally, ECB and CBC modes are not separate capabilities - these are algorithm specifiers for encrypt/decrypt operations, not capability flags.
- **Resolution**: Replace with actual YubiHSM capability names from the official documentation. Correct the encryption capability names to match actual API (likely `decrypt_pkcs`, `decrypt_oaep`, or similar).

**Q5**: Is the `generate asymmetric` command syntax correct?

- **Location**: Step 4, line 428
- **Implementation reality**: The command shows `generate asymmetric 0 100 "ssh-key" 1 sign-eddsa ed25519`. The actual syntax is `generate asymmetric <session-id> <key-id> <label> <domains> <capabilities> <algorithm>`. The document lists only 6 parameters. The "1" is domains, `sign-eddsa` appears to be capabilities, but where is the algorithm specification? EdDSA is the algorithm, not Ed25519. Ed25519 is the curve. The YubiHSM 2 API may use different algorithm constants.
- **Resolution**: Verify the exact command syntax and algorithm specifier values. The algorithm parameter for EdDSA on Ed25519 may be a numeric constant or a different string.

**Q6**: How do you actually extract and convert the public key for SSH?

- **Location**: Step 4, lines 436-440
- **Implementation reality**: The document says "Extract the public key" using `get pubkey 0 100` and then "Convert to SSH format and add to authorized_keys" but provides no conversion command. The YubiHSM returns public keys in raw format (raw bytes or PEM), not SSH format. You need `ssh-keygen -i -m PKCS8 -f pubkey.pem` or use yubihsm-shell's built-in conversion if it exists. Without the actual conversion command, users will be stuck with unusable output.
- **Resolution**: Add the actual command pipeline to convert YubiHSM public key output to SSH authorized_keys format. Test it and provide the exact working command.

**Q7**: Does OpenBao actually support PKCS#11 seal with the documented syntax?

- **Location**: Step 7, lines 473-480
- **Implementation reality**: The document shows a `seal "pkcs11"` block with parameters like `lib`, `slot`, `pin`, `key_label`, `mechanism`. This looks like HashiCorp Vault syntax, but OpenBao is a fork that diverged from Vault. Need to verify: (1) Does OpenBao still support the PKCS#11 seal backend? (2) Is the configuration syntax identical to Vault? (3) Is the mechanism value `0x1085` (CKM_AES_CBC_PAD) correct for auto-unseal, or should it be a different mechanism?
- **Resolution**: Verify against OpenBao documentation (not Vault docs). Check if seal configuration diverged in the fork. Confirm the mechanism value is appropriate for the actual unsealing operation.

**Q8**: Is `mechanism = "0x1085"` the right PKCS#11 mechanism for Vault/OpenBao seal?

- **Location**: Step 7, line 479
- **Implementation reality**: The mechanism `0x1085` is `CKM_AES_CBC_PAD` in PKCS#11. However, Vault's PKCS#11 seal typically uses `CKM_AES_KEY_WRAP` (0x2109) or `CKM_AES_KEY_WRAP_PAD` (0x210A) for key wrapping operations, not CBC padding. Using CBC_PAD for a seal operation seems incorrect. The actual mechanism depends on what the YubiHSM supports and what Vault expects.
- **Resolution**: Check Vault/OpenBao source code or documentation for the correct mechanism value. Verify that YubiHSM 2 supports the mechanism you're specifying.

**Q9**: Is the wrap key generation command syntax correct?

- **Location**: Step 10, line 506
- **Implementation reality**: The command shows `generate wrapkey 0 200 "backup-wrap" 1 all export-wrapped,import-wrapped aes256-ccm-wrap`. This appears to have syntax issues. The wrapkey type in YubiHSM 2 is used for wrapping operations, and its capabilities should relate to what it can wrap/unwrap, not general "all" capabilities. Also, the delegated capabilities should specify what types of objects this wrap key can export (e.g., `asymmetric-key`, `wrap-key`, etc.), not comma-separated capability names. The `aes256-ccm-wrap` may not be the correct algorithm specifier.
- **Resolution**: Verify the actual `generate wrapkey` syntax. Check if the algorithm is specified as `aes256-ccm-wrap`, a numeric constant, or something else. Clarify what "delegated capabilities" means for a wrap key.

**Q10**: Does `get wrapped` actually export the wrap key itself?

- **Location**: Step 10, line 510
- **Implementation reality**: The command `get wrapped 0 200 wrapkey 200 wrap-key-backup.wrap` attempts to export wrap key 200 using itself as the wrapping key. This is circular: you're using key 200 to wrap key 200. The YubiHSM 2 might allow this, but it's conceptually odd. Typically you'd have a separate master wrap key that can export other wrap keys. If you lose the wrap key backup, you can't unwrap anything, making the entire backup useless. The restore procedure doesn't explain how you get the wrap key back into a new HSM without already having it.
- **Resolution**: Clarify the wrap key backup strategy. Either use a separate master wrap key, or explain how the wrap key itself is backed up and restored (possibly by exporting under a well-known key or using a different mechanism).

**Q11**: Is the disaster recovery restore procedure actually complete?

- **Location**: Disaster Recovery section, lines 576-582
- **Implementation reality**: Step 4 shows `put wrapped 0 <new-auth-id> wrap-key-backup.wrap`, which imports a wrapped object using auth key ID as the first parameter, but `put wrapped` syntax is actually `put wrapped <session-id> <wrap-key-id> <wrapped-data-file>`. The auth ID is wrong here - it should be the wrap key ID. But if you're restoring the wrap key itself, how do you import it without already having it? This appears to be a circular dependency that makes the recovery procedure impossible as written.
- **Resolution**: Provide a complete, tested disaster recovery procedure. If the wrap key needs to be backed up separately (in plaintext or under a different mechanism), state that explicitly and show the actual commands that work.

**Q12**: Does ssh-agent on Windows actually support PKCS#11 providers?

- **Location**: Step 5, line 456, and Daily Workflow section
- **Implementation reality**: The document shows using `ssh-add -s` to load a PKCS#11 provider into ssh-agent. On Windows, the native OpenSSH installation's ssh-agent may not support PKCS#11 providers the same way the Unix version does. Windows ssh-agent might require pageant or another agent implementation. Additionally, the PKCS#11 provider path needs to use Windows-style backslashes, but the YubiHSM connector URL and auth credentials also need to be configured somewhere (environment variables or config file) that isn't documented.
- **Resolution**: Test ssh-add with PKCS#11 on Windows OpenSSH. If it doesn't work, document the alternative (pageant, Cygwin ssh, WSL ssh-agent, etc.). Add the missing PKCS#11 configuration steps (connector URL, auth credentials).

---

## Critical Implementation Gaps

Beyond specific command syntax issues, there are several areas where the document describes behavior without explaining how it actually works:

1. **PKCS#11 configuration**: The document never explains how to configure `yubihsm_pkcs11.dll` with connector URL, auth key ID, password, etc. These are required for PKCS#11 operations to work.

2. **Error handling**: No discussion of what happens when commands fail, HSM is disconnected, sessions timeout, or auth fails.

3. **Windows service configuration**: OpenBao and yubihsm-connector need to run as Windows services for the "auto-unseal on boot" scenario to work, but service installation isn't covered.

4. **Credential Manager storage**: The document mentions storing HSM auth credentials in Windows Credential Manager but never shows how to do this or retrieve them programmatically.

5. **Version dependencies**: No mention of which versions of yubihsm-shell, yubihsm-connector, OpenBao, PostgreSQL, Windows, etc. were tested. Commands may vary between versions.

---

## Recommendation

Before publishing, create a clean Windows VM and follow this document step-by-step with actual hardware. Document every error encountered and command that doesn't work as written. Update the document with verified, tested commands that actually execute successfully.
