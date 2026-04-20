# Domain Expert Review: mostlySecure.md

**Reviewer**: Senior Engineer (Hardware Security, Cryptography, Windows Security Infrastructure)
**Review Date**: 2026-02-02
**Document**: mostlySecure.md

## Review Lens

"Is this technically accurate and complete enough for production use?"

---

## Questions and Concerns

**Q1**: The SCP03 encryption claim needs verification regarding USB transport security

- Location: Lines 138-155, "Concepts > SCP03" section
- Why it matters: The document states "All subsequent communication is encrypted and integrity-protected, even over USB" (line 139). However, SCP03 provides secure channel establishment but doesn't necessarily encrypt the USB transport layer itself. An attacker with physical USB access or a malicious USB device between the connector and HSM could potentially observe or manipulate USB frames. This matters for production because physical security assumptions need to be explicit.
- Resolution: Clarify what is actually encrypted (the command/response payload) vs. the USB transport layer. Add a note about physical USB security requirements and whether USB-level encryption is actually provided by YubiHSM 2's implementation.

**Q2**: Missing discussion of YubiHSM 2 key attestation and how to verify keys were generated on-device

- Location: Lines 426-432, "Step 4: Generate SSH Key on the HSM"
- Why it matters: In production environments, you need cryptographic proof that keys were actually generated inside the HSM and not injected from outside. Without attestation verification, an attacker who compromises the setup process could generate keys externally, import them to the HSM, and you'd never know. This completely defeats the "non-extractable" security model.
- Resolution: Add information about YubiHSM 2's attestation capabilities (if available), how to request and verify attestation certificates, and what to do if attestation isn't available (operational security procedures to ensure setup happens on trusted machines).

**Q3**: The wrap key export scenario creates a critical single point of failure that's under-discussed

- Location: Lines 505-515, "Step 10: Create Backup on IronKey", line 510 specifically
- Why it matters: Line 510 exports the wrap key itself as a wrapped blob. But what wraps the wrap key? If it's self-wrapped or wrapped by the same key, this creates a circular dependency. More critically, the document doesn't discuss that exporting a wrap key means you now have an offline copy of the master secret that can unwrap ALL other keys. If an attacker gets both the IronKey and defeats its PIN protection (or you lose/forget the PIN), you lose everything. The risk/benefit tradeoff of exportable vs. non-exportable wrap keys isn't discussed.
- Resolution: Explain exactly how the wrap key is exported (self-wrap? different wrap key?). Discuss the security implications of exportable wrap keys. Consider recommending a non-exportable wrap key for production with a separate key-escrow HSM for true disaster recovery.

**Q4**: No discussion of YubiHSM 2 firmware authenticity, updates, or supply chain security

- Location: Lines 205-217, "Hardware Components > YubiHSM 2"
- Why it matters: In production, you need to verify that the HSM firmware is authentic and hasn't been tampered with during supply chain. Additionally, firmware updates may be necessary for security patches, but updates also represent a risk (downgrade attacks, malicious firmware). The document doesn't mention how to verify device authenticity, check firmware version, or safely perform updates.
- Resolution: Add a section on firmware verification, supply chain validation (how to order directly from Yubico, verify packaging), and firmware update procedures including backup requirements before updates.

**Q5**: The PKCS#11 PIN handling and storage mechanism is critically underspecified

- Location: Lines 473-480, "Step 7: Install and Configure OpenBao", line 477 specifically
- Why it matters: Line 477 shows `pin = "<hsm-auth-password>"` hardcoded in a configuration file. This is a disaster for production. The auth password for the HSM is now sitting in plaintext in a config file, likely backed up, possibly in version control. This completely undermines Credential Guard protection. The document mentions storing credentials in Credential Manager (line 359) but doesn't explain how to integrate this with PKCS#11 PIN requirements or OpenBao configuration.
- Resolution: Provide concrete instructions for storing PKCS#11 PINs securely (Credential Manager integration, environment variable protection, or runtime prompt mechanisms). Explain OpenBao's credential provider options. Show actual production-safe configuration examples.

**Q6**: Concurrent session management and key operation contention isn't addressed

- Location: Lines 210, "16 concurrent authenticated sessions"
- Why it matters: The document mentions 16 concurrent sessions as a feature but doesn't discuss what happens when multiple processes try to use the same key simultaneously. In production, SSH operations, OpenBao operations, and PostgreSQL encryption might all hit the HSM concurrently. What are the performance characteristics? Are there queue timeouts? What happens if all 16 sessions are exhausted? This affects reliability and capacity planning.
- Resolution: Add a section on performance characteristics, expected operation latency for different key types, concurrent operation limits, and error handling when sessions are exhausted. Provide guidance on monitoring HSM session usage.

**Q7**: The auth key capability model is dangerously oversimplified

- Location: Lines 411-423, "Step 3: Create Operational Auth Keys"
- Why it matters: The examples show auth keys with very limited capabilities (sign-only, encrypt-only), but they grant access to "1" (all domains) and operate on objects with no label restrictions. In production, this means the "ssh-signer" auth key can sign with ANY key in the HSM, not just the SSH key. An application compromise could abuse these overly broad permissions. The document doesn't explain domain filtering, object label matching, or how to properly scope auth key permissions to specific key IDs.
- Resolution: Explain YubiHSM 2's capability model in detail, including domain filtering and label-based access control. Provide examples showing how to restrict an auth key to only operate on specific key objects. Add a warning about the risks of capability over-provisioning.

**Q8**: No discussion of audit logging, tamper detection, or forensic capabilities

- Location: Lines 255-256, "Software Components > OpenBao" mentions audit logging, but HSM-level logging is absent
- Why it matters: In production security systems, you need comprehensive audit trails for compliance and incident response. The document mentions OpenBao audit logs but doesn't discuss whether the YubiHSM 2 itself maintains any operation logs, how long they persist, whether they're signed/tamper-proof, or how to extract them for analysis. After a security incident, you need to know exactly what operations were performed with which keys. Additionally, there's no discussion of tamper-evident features or how to detect if the HSM has been physically compromised.
- Resolution: Document YubiHSM 2's audit logging capabilities (if any), including how to enable, retrieve, and analyze logs. Explain tamper detection features. Describe procedures for correlating HSM operations with application-level logs from OpenBao and other components for complete audit trails.

**Q9**: The disaster recovery procedure has untested failure modes

- Location: Lines 568-583, "Disaster Recovery > Scenario: YubiHSM 2 Dies"
- Why it matters: The recovery procedure assumes you can successfully import wrapped keys into a new HSM, but several failure modes aren't addressed: What if the new HSM has different firmware that's incompatible with the old wrapped format? What if the wrap key import succeeds but subsequent key imports fail partway through? What if the IronKey has bit rot after 5 years in a safe? In production, disaster recovery procedures must be regularly tested, but the document doesn't recommend testing frequency, validation procedures, or incremental recovery strategies.
- Resolution: Add a section on disaster recovery testing procedures, including recommended test frequency (quarterly?), validation steps to ensure wrapped keys are actually recoverable, and versioning strategies to handle HSM firmware compatibility across years of backups. Recommend keeping wrapped backups in multiple formats if firmware compatibility is a concern.

**Q10**: Missing discussion of key lifecycle management and rotation

- Location: Nowhere in the document
- Why it matters: Production systems require key rotation policies. SSH keys should be rotated periodically, encryption keys have lifetime limits based on data volume encrypted, and auth credentials should be changed after personnel changes. The document shows how to generate and use keys but never discusses rotation strategies, how to update authorized_keys on remote servers when rotating SSH keys, or how to re-encrypt data when rotating encryption keys. The complexity of rotating HSM-backed keys is significantly higher than rotating file-based keys.
- Resolution: Add a section on key lifecycle management covering: rotation frequency recommendations by key type, procedures for rotating SSH keys including authorized_keys update automation, strategies for encryption key rotation (versioned key IDs? gradual re-encryption?), and how to retire/delete old keys from the HSM safely.

**Q11**: The OpenBao and PostgreSQL integration lacks concrete implementation details

- Location: Lines 327-347, "Data Flow: Storing Encrypted Data" and lines 486-492, "Step 8"
- Why it matters: The document describes a high-level flow where "OpenBao asks HSM to encrypt the data via PKCS#11" but provides no concrete implementation. Does this mean PostgreSQL queries OpenBao REST API for every encryption operation? What about transaction performance and latency? Is OpenBao acting as a KMS with envelope encryption (returning data keys) or doing the actual encryption? The pgcrypto extension is mentioned but not actually configured. In production, this integration is where most implementation bugs occur, and the vague description would leave operators guessing.
- Resolution: Provide concrete implementation examples showing: PostgreSQL configuration to use OpenBao as a key provider, actual SQL examples using pgcrypto with OpenBao-managed keys, performance characteristics and caching strategies, and error handling when OpenBao is unavailable during a transaction.

**Q12**: The threat model ignores several real-world attack vectors

- Location: Lines 614-628, "Threat Model: What This Protects Against" and lines 630-648, "What This Does NOT Protect Against"
- Why it matters: The threat model lists protection against "USB sniffing" via SCP03 but doesn't address USB device firmware attacks (BadUSB-style attacks where the YubiHSM itself is compromised during manufacturing or via firmware update). It also doesn't address side-channel attacks (power analysis, timing attacks, EM radiation) which are relevant for HSMs in high-security environments. The "Compromised OS (root shell)" entry says attackers "cannot extract keys for later use" but doesn't mention they could install persistent access to use the HSM indefinitely until detected. The document also doesn't discuss supply chain attacks on the software components (malicious yubihsm-connector, compromised OpenBao binary).
- Resolution: Expand the threat model to include: firmware-level attacks and mitigation strategies, side-channel attack relevance (or explicitly state they're out of scope for this threat model), persistent compromise scenarios where attackers maintain long-term HSM access, and software supply chain security measures (signature verification for all components, reproducible builds, etc.).

---

## Overall Assessment

The document provides a good conceptual foundation for hardware-backed key management but lacks the production-hardening details necessary for secure deployment. The most critical gaps are:

1. **Credential management**: Hardcoded PINs in config files defeat the entire security model
2. **Key lifecycle**: No discussion of rotation, retirement, or long-term key management
3. **Operational procedures**: Missing performance characteristics, monitoring, and failure handling
4. **Security verification**: No attestation, audit logging, or tamper detection procedures
5. **Integration depth**: High-level flows without concrete implementation details that operators need

This reads as a well-researched proof-of-concept guide, but would require significant additional detail before being production-ready. An operator following this guide would successfully build a working system but would likely discover critical security and operational gaps during the first incident or audit.
