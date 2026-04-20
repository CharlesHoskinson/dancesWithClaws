# Security Audit: Mostly Secure Documentation

**Reviewer**: Security Auditor
**Date**: 2026-02-02
**Document**: mostlySecure.md

## Executive Summary

This document describes a hardware-backed key management architecture using YubiHSM 2, OpenBao, and encrypted backups. While the architecture shows strong security principles, the documentation has critical gaps in threat modeling, authentication boundaries, and operational security procedures that could lead to exploitable vulnerabilities.

## Questions and Concerns

**Q1**: What prevents the SCP03 authentication credential from being stolen during initial setup or storage?

- Location: "Step 2: Initialize the YubiHSM 2" (lines 398-408) and "Concepts > SCP03" (lines 134-155)
- Threat model: The SCP03 auth password is created and used in plaintext via command line (`yubihsm> session open 2 <new-password>`). If this password is intercepted during initial setup (screen recording malware, shoulder surfing, command history), or if it's stored insecurely before being placed in Credential Manager, an attacker with the HSM device gains full access to all keys.
- Resolution: Document requires explicit guidance on: (1) secure password generation offline/air-gapped, (2) clearing command history after setup, (3) when exactly the password gets stored in Credential Manager, (4) verification that Credential Guard is active BEFORE the password is first entered on the system, (5) what protections exist during the initial setup phase before Credential Guard contains the credential.

**Q2**: What attack surface exists through the yubihsm-connector's HTTP endpoint on localhost:12345?

- Location: "Software Components > YubiHSM Connector" (lines 237-245) and architecture diagrams
- Threat model: The connector exposes an unauthenticated HTTP endpoint on `http://127.0.0.1:12345`. Any malicious process running on the same machine can connect to this endpoint and attempt to communicate with the HSM. While the HSM requires SCP03 authentication, the document doesn't explain: (1) what operations are exposed pre-authentication, (2) if there are DoS vectors (session exhaustion, malformed packets), (3) if the connector has been audited for memory corruption vulnerabilities, (4) if localhost-only binding is enforced and verified.
- Resolution: Need security guidance on: hardening the connector (firewall rules, process isolation), monitoring for suspicious connection attempts, rate limiting failed auth attempts, and explicit statement about what attack surface exists at the connector layer vs. the HSM layer.

**Q3**: How are the granular HSM capabilities actually enforced, and what happens if they're misconfigured?

- Location: "Step 3: Create Operational Auth Keys" (lines 411-423)
- Threat model: The document shows creating auth keys with limited capabilities (e.g., `sign-ecdsa,sign-eddsa none` for SSH). However, it doesn't explain: (1) what happens if someone makes a typo in the capability list, (2) if the HSM validates these at auth-time or use-time, (3) what the error messages reveal about valid capabilities (information disclosure), (4) if an auth key with no explicit capabilities defaults to "all" or "none", (5) how to audit existing auth key capabilities after creation.
- Resolution: Document needs: examples of misconfiguration and their security impact, how to verify capabilities were set correctly, command to list all auth keys and their permissions (audit procedure), explicit warning about capability syntax errors, and whether capabilities can be modified without re-creating the auth key.

**Q4**: What's the security impact of the OpenBao configuration file containing the HSM PIN in plaintext?

- Location: "Step 7: Install and Configure OpenBao" (lines 469-480)
- Threat model: The OpenBao seal configuration shows `pin = "<hsm-auth-password>"` in an HCL configuration file. This file must be stored on disk somewhere for OpenBao to read at startup. Questions: (1) Where is this file stored and what are its permissions? (2) Can any process/user read it? (3) Is it included in backups? (4) The document says the password should be in Credential Manager (boot sequence, line 365), but this config shows it in plaintext - which is correct? (5) If both exist, which takes precedence?
- Resolution: Clarify the actual secret storage mechanism for OpenBao. If the config file needs the PIN, document: file path, required ACLs, exclusion from backups, rotation procedures. If Credential Manager is used instead, show the correct configuration syntax. Address the apparent contradiction between the config example and the boot sequence description.

**Q5**: How is the wrap key itself protected during the backup process?

- Location: "Step 10: Create Backup on IronKey" (lines 504-515)
- Threat model: Line 510 shows exporting the wrap key itself as `wrap-key-backup.wrap`. The document states "get wrapped 0 200 wrapkey 200" exports the wrap key wrapped by... itself? This seems circular. If the wrap key is self-wrapped, an attacker with the wrapped blob can unwrap it without any other secrets. If it's wrapped by a different key, what key is that, and where is it stored?
- Resolution: Explain the wrap key protection mechanism clearly: (1) Is the wrap key self-wrapped or wrapped by another key? (2) If another key, where does that key come from and how is it protected? (3) What prevents an attacker who steals the IronKey from unwrapping the wrap key and then all other keys? (4) Is the IronKey PIN the only protection, or is there additional cryptographic protection?

**Q6**: What audit logging exists, and what security events would go undetected?

- Location: "Software Components > OpenBao" (line 256) and "Data Flow: Storing Encrypted Data" (line 346)
- Threat model: The document mentions OpenBao has audit logging, but doesn't detail: (1) what's logged at the HSM level (raw USB traffic, SCP03 sessions, failed auth attempts), (2) what's logged at the connector level, (3) what's logged by OpenBao, (4) how logs are protected from tampering, (5) where logs are stored (on the encrypted disk that an attacker might have access to?), (6) if critical events trigger alerts.
- Resolution: Comprehensive audit logging section needed: what events are logged at each layer, log storage location and protection, retention policy, examples of suspicious patterns to monitor (e.g., repeated auth failures, session creation spikes, key operations at unusual times), SIEM integration guidance, and how to detect if an attacker is using keys during a live session hijack.

**Q7**: What happens during the window between "compromised OS" and "notice HSM is being used"?

- Location: "What This Does NOT Protect Against" (lines 631-633, 635-638)
- Threat model: The document admits that a live session hijacker can use the HSM while present, and that theft mitigation depends on "noticing the theft and generating new keys." Neither provides actionable defense. Questions: (1) In the compromise window (hours? days? weeks?), what damage can the attacker do? (2) How do you detect unauthorized HSM usage in real-time? (3) What's the incident response procedure when you suspect compromise? (4) Can you remotely revoke/disable the HSM or SSH public keys? (5) Where are those SSH public keys deployed (authorized_keys on remote servers) and how quickly can they be revoked across all systems?
- Resolution: Add incident response section covering: detection methods for active HSM abuse, procedure to immediately revoke credentials (script to remove public keys from all known servers?), command to disable/delete auth keys from the HSM remotely, monitoring setup to alert on unusual HSM activity, and realistic assessment of damage window (what can attacker accomplish before detection).

**Q8**: Where is the MCP server SSH authentication actually happening and what secrets does it have access to?

- Location: "Step 11: Update MCP Server Config" (lines 518-538)
- Threat model: The MCP SSH server config shows connection to 20.245.79.3 as user hoskinson, relying on ssh-agent for auth. Questions: (1) Does the MCP server run as your user or a separate service account? (2) Can it access your ssh-agent socket? (3) If Claude (or a compromised MCP server) requests SSH operations, does it get full access to sign with your HSM-backed key? (4) Is there any authorization boundary between Claude's requests and HSM usage? (5) What prevents a malicious AI agent or compromised MCP from silently SSH'ing to other servers and exfiltrating data?
- Resolution: Document the trust boundary between AI agents and HSM access. Explain: authentication flow from MCP -> ssh-agent -> HSM, what authorization checks exist (are there any?), whether MCP has unrestricted access to sign arbitrary challenges, suggested mitigations (separate auth key for AI agents with logging? time-based restrictions? manual approval for SSH operations?), and whether this violates the principle of least privilege.

**Q9**: How do you verify the YubiHSM firmware hasn't been tampered with, and what's the supply chain risk?

- Location: "Hardware Components > YubiHSM 2" (lines 205-217)
- Threat model: The entire security model depends on trusting the HSM hardware. Questions: (1) How do you verify the HSM is authentic and not a sophisticated fake? (2) Can the firmware be extracted and analyzed? (3) Does the HSM support firmware attestation or secure boot? (4) What if Yubico's signing keys were compromised and malicious firmware was distributed? (5) Is there a mechanism to detect a hardware implant or supply chain interdiction?
- Resolution: Add supply chain security section covering: how to verify authentic Yubico device (serial number validation, purchase from authorized resellers), firmware verification procedures, whether firmware can be updated and if updates are signed, detection methods for hardware tampering, and realistic assessment of this threat vector (given this is a $650 device, sophisticated attackers could potentially create convincing counterfeits).

**Q10**: What protects the PostgreSQL data encryption keys in OpenBao's storage backend?

- Location: "Software Components > PostgreSQL + pgcrypto" (lines 259-262) and "Step 8: Install and Configure PostgreSQL" (lines 484-492)
- Threat model: OpenBao manages encryption keys that PostgreSQL uses via pgcrypto. But where does OpenBao store these keys? Questions: (1) What is OpenBao's storage backend (file? database?)? (2) Are those keys encrypted at rest in OpenBao's storage? (3) If yes, by what? The HSM wrap key? (4) If OpenBao is "unsealed" via HSM, does that mean all stored keys become accessible? (5) Can an attacker with filesystem access read OpenBao's storage and extract the database encryption keys?
- Resolution: Clarify OpenBao's storage security model: backend type and location, encryption at rest for OpenBao's storage, how the HSM seal protects storage contents, what data would be exposed if OpenBao's storage files were exfiltrated while OpenBao is unsealed vs sealed, and whether database encryption keys ever exist in plaintext outside the HSM.

**Q11**: What's the security boundary between different applications using the HSM?

- Location: "Layer Diagram" (lines 282-299) and general architecture
- Threat model: Multiple applications (SSH client, OpenBao, PostgreSQL) all use the same YubiHSM via PKCS#11. Questions: (1) Do they use different auth keys with different capabilities, or the same auth key? (2) Can a compromised SSH client access database encryption keys? (3) Can a compromised OpenBao instance sign SSH challenges? (4) What isolation exists between different consumers of the HSM? (5) If they share an auth key/session, what's the blast radius of one component's compromise?
- Resolution: Document application isolation model: which auth keys are used by which components (reference back to Step 3), whether separate SCP03 sessions provide isolation, how capabilities limit blast radius, example scenario showing what a compromised component CAN and CANNOT do, and best practices for multi-application HSM usage.

**Q12**: How is the HSM's finite session limit (16 concurrent) handled under DoS or error conditions?

- Location: "Hardware Components > YubiHSM 2" (line 210)
- Threat model: The HSM supports 16 concurrent authenticated sessions. Questions: (1) What happens when all 16 sessions are in use and a legitimate application needs one? (2) Can a malicious process open 16 sessions and lock out legitimate use? (3) Do sessions have timeouts, or do they stay open until explicitly closed? (4) If a process crashes mid-session, is that session slot leaked? (5) Is there a way to forcibly close sessions or reset the HSM without physical access?
- Resolution: Document session management best practices: session lifecycle (open/use/close pattern), timeout behavior, how to detect session exhaustion, command to list active sessions, procedure to close stale sessions, mitigation for session exhaustion DoS, and whether the connector implements connection pooling or per-request sessions.

---

## Critical Gaps Summary

### High Severity Issues

1. **Credential bootstrapping problem** (Q1): The initial setup procedure doesn't protect the master secret during its most vulnerable phase
2. **Localhost attack surface** (Q2): Unauthenticated HTTP endpoint accessible to all local processes
3. **Wrap key circularity** (Q5): Backup cryptography may be fundamentally flawed
4. **Secret in config files** (Q4): Contradictory guidance on where HSM auth passwords are stored

### Medium Severity Issues

5. **No incident response** (Q7): Acknowledged vulnerabilities (live session hijacking, physical theft) have no mitigation procedures
6. **Missing audit architecture** (Q6): Cannot detect active attacks or conduct forensics after breach
7. **Undefined trust boundaries** (Q8, Q11): Multiple components share HSM access with unclear isolation
8. **Session exhaustion DoS** (Q12): Finite resource can be exhausted, no recovery mechanism documented

### Architectural Questions

9. **OpenBao storage security** (Q10): Unclear if the key management system itself has secure storage
10. **Capability enforcement gaps** (Q3): Misconfiguration could grant excessive permissions silently
11. **Supply chain trust** (Q9): No verification procedures for hardware authenticity
12. **AI agent access control** (Q8): MCP server may have unrestricted HSM access with no authorization layer

## Recommendations

### Immediate Actions Needed

1. Add "Setup Security" section covering initial credential generation in a secure environment
2. Document the complete authentication credential lifecycle (generation → storage → rotation → revocation)
3. Clarify wrap key cryptography with explicit key hierarchy diagram
4. Add "Security Monitoring" section with concrete detection strategies and alert examples
5. Create "Incident Response Playbook" for compromise scenarios
6. Add "Security Audit Procedures" showing how to verify configuration matches security requirements

### Architecture Improvements

1. Consider separating connector per application or adding authentication to connector endpoint
2. Implement and document session pooling/management to prevent DoS
3. Define and document clear trust boundaries between components using different auth keys
4. Add authorization layer between AI agents and HSM access (e.g., interactive approval for sensitive operations)

### Documentation Standards

1. Every example command should include security implications
2. Every configuration option should state security vs. convenience tradeoffs
3. Threat model section should include realistic attacker capabilities and detection strategies
4. Include "What could go wrong" subsections in each setup step

---

## Overall Assessment

**Architecture Quality**: Strong foundation with defense-in-depth approach
**Documentation Completeness**: 60% - covers happy path well, but missing critical security edge cases
**Operational Readiness**: 40% - insufficient guidance for secure deployment, monitoring, and incident response
**Risk Level if Deployed As-Written**: Medium-High due to unaddressed credential protection gaps and lack of security monitoring

The document describes a sophisticated security architecture but fails to address key operational security concerns that could undermine the hardware security benefits. Most critically, it doesn't adequately protect the authentication credentials that control access to the HSM, doesn't provide detection mechanisms for active attacks, and doesn't define clear security boundaries between components. Before deploying this system in a production environment, all twelve questions above should be addressed with concrete, tested procedures.
