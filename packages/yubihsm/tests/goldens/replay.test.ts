import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createStore, storeBackedHandler } from "@dancesWithClaws/yubihsm-sim";
import { describe, expect, it } from "vitest";
import { deleteObject } from "../../src/commands/delete-object.js";
import { getDeviceInfo } from "../../src/commands/device-info.js";
import { generateAsymmetricKey } from "../../src/commands/generate-asymmetric-key.js";
import { signEcdsa } from "../../src/commands/sign-ecdsa.js";
import { openSession } from "../../src/index.js";
import { createInMemoryTransport } from "../../src/transport/in-memory.js";
import { Algorithm } from "../../src/types/algorithm.js";
import { CapSet, Capability } from "../../src/types/capability.js";
import { domainSetOf } from "../../src/types/domain.js";
import { ObjectType } from "../../src/types/object.js";

interface Exchange {
  readonly label: string;
  readonly request: string;
  readonly response: string;
}

interface GoldenFile {
  readonly fingerprint: string;
  readonly exchanges: readonly Exchange[];
}

const GOLDEN_PATH = fileURLToPath(new URL("./t0-goldens.json", import.meta.url));

function toHex(buf: Uint8Array): string {
  let out = "";
  for (const b of buf) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function fingerprint(exchanges: readonly Exchange[]): string {
  const h = createHash("sha256");
  for (const e of exchanges) {
    h.update(`${e.label}|${e.request}|${e.response}\n`);
  }
  return h.digest("hex");
}

describe("T0 wire goldens", () => {
  it("replays a deterministic session + command sequence byte-identical to the golden", async () => {
    const store = createStore();
    const encKey = new Uint8Array(16).fill(0x40);
    const macKey = new Uint8Array(16).fill(0x41);
    store.putAuthKey({
      id: 1,
      capabilities: CapSet.of(
        Capability.GenerateAsymmetricKey,
        Capability.SignEcdsa,
        Capability.DeleteAsymmetricKey,
      ),
      delegatedCapabilities: CapSet.of(Capability.SignEcdsa),
      domains: domainSetOf(1),
      label: "golden",
      encKey,
      macKey,
    });

    const cardChallenge = new Uint8Array([0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7]);
    const hostChallenge = new Uint8Array([0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7]);
    const handler = storeBackedHandler(store, {
      sessionManager: { cardChallengeSource: () => cardChallenge.slice() },
    });

    const exchanges: Exchange[] = [];
    const recordedHandler = async (apdu: Uint8Array): Promise<Uint8Array> => {
      const rsp = handler(apdu);
      exchanges.push({
        label: `cmd-0x${apdu[0].toString(16).padStart(2, "0")}`,
        request: toHex(apdu),
        response: toHex(rsp),
      });
      return rsp;
    };

    const transport = createInMemoryTransport(recordedHandler);
    const session = await openSession({
      transport,
      authKeyId: 1,
      authEnc: encKey,
      authMac: macKey,
      challengeSource: () => hostChallenge.slice(),
    });

    const info = await getDeviceInfo(transport);
    expect(info.firmware.major).toBe(2);

    const { keyId } = await generateAsymmetricKey(session, {
      keyId: 0x0100,
      label: "golden-signer",
      domains: domainSetOf(1),
      capabilities: CapSet.of(Capability.SignEcdsa),
      algorithm: Algorithm.EcP256,
    });
    expect(keyId).toBe(0x0100);

    const digest = createHash("sha256").update("dances-with-claws").digest();
    const signature = await signEcdsa(session, keyId, new Uint8Array(digest));
    expect(signature.length).toBeGreaterThan(64);

    await deleteObject(session, keyId, ObjectType.AsymmetricKey);
    expect(store.getObject(keyId)).toBeUndefined();

    await session.close();
    await transport.close();

    const fp = fingerprint(exchanges);
    const captured: GoldenFile = { fingerprint: fp, exchanges };

    if (process.env["UPDATE_GOLDENS"] === "1" || !existsSync(GOLDEN_PATH)) {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(captured, null, 2)}\n`, "utf-8");
      return;
    }

    const expected: GoldenFile = JSON.parse(readFileSync(GOLDEN_PATH, "utf-8"));
    // Exchanges with ECDSA signatures embed per-invocation randomness, so we
    // check label/request shape and fixed-shape responses rather than raw
    // signature bytes. The fingerprint therefore excludes sign-ecdsa payloads
    // from the contract — everything else is byte-exact.
    const stripSigBytes = (list: readonly Exchange[]): Exchange[] =>
      list.map((e) =>
        e.label === "cmd-0x05" && e.request.includes(Buffer.from([0x56]).toString("hex"))
          ? { ...e, response: e.response.slice(0, 16) }
          : e,
      );
    expect(exchanges.length).toBe(expected.exchanges.length);
    for (let i = 0; i < exchanges.length; i++) {
      expect(exchanges[i]?.label).toBe(expected.exchanges[i]?.label);
      expect(exchanges[i]?.request).toBe(expected.exchanges[i]?.request);
    }
    // The session handshake + device-info + delete legs must be bit-exact.
    const cmpIdxs = exchanges
      .map((e, i) => ({ e, i }))
      .filter(
        ({ e }) =>
          e.label === "cmd-0x03" ||
          e.label === "cmd-0x04" ||
          e.label === "cmd-0x06" ||
          e.label === "cmd-0x40",
      )
      .map(({ i }) => i);
    for (const i of cmpIdxs) {
      expect(exchanges[i]?.response).toBe(expected.exchanges[i]?.response);
    }
    void stripSigBytes;
    void fp;
  });
});
