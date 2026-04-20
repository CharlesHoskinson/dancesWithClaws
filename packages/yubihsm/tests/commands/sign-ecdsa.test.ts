import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import { createSimulator, createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, expect, it } from "vitest";
import {
  Algorithm,
  CapSet,
  Capability,
  createHttpTransport,
  domainSetOf,
  generateAsymmetricKey,
  openSession,
  signEcdsa,
} from "../../src/index.js";

describe("signEcdsa (wrapped session command)", () => {
  it("produces a signature that verifies against the generated public key", async () => {
    const store = createStore();
    const encKey = new Uint8Array(16).fill(0x40);
    const macKey = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 2,
      capabilities: CapSet.of(Capability.GenerateAsymmetricKey, Capability.SignEcdsa),
      delegatedCapabilities: CapSet.of(Capability.SignEcdsa),
      domains: domainSetOf(1),
      label: "admin",
      encKey,
      macKey,
    });
    const sim = createSimulator(storeBackedHandler(store));
    const port = await sim.start();
    const transport = createHttpTransport({ url: `http://127.0.0.1:${port}` });
    const session = await openSession({
      transport,
      authKeyId: 2,
      authEnc: encKey,
      authMac: macKey,
    });

    const { keyId } = await generateAsymmetricKey(session, {
      label: "signer",
      domains: domainSetOf(1),
      capabilities: CapSet.of(Capability.SignEcdsa),
      algorithm: Algorithm.EcP256,
    });

    const message = Buffer.from("dancesWithClaws signs this message", "utf8");
    const digest = createHash("sha256").update(message).digest();
    const signature = await signEcdsa(session, keyId, digest);
    expect(signature.length).toBeGreaterThan(64);
    expect(signature.length).toBeLessThanOrEqual(72);

    const stored = store.getObject(keyId);
    const publicKey = createPublicKey({
      key: Buffer.from(stored!.publicKey!),
      format: "der",
      type: "spki",
    });
    const ok = cryptoVerify(null, digest, { key: publicKey, dsaEncoding: "der" }, signature);
    expect(ok).toBe(true);

    await session.close();
    await transport.close();
    await sim.stop();
  });
});
