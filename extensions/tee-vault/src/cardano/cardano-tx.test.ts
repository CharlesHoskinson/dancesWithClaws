import { describe, it, expect } from "vitest";
import type { CardanoUtxo, TxOutput, ProtocolParameters } from "./types.js";
import {
  buildSimplePaymentTx,
  signTransaction,
  estimateFee,
  calculateMinUtxo,
  serializeTransaction,
  deserializeTransaction,
} from "./cardano-tx.js";

describe("cardano-tx", () => {
  const protocolParams: ProtocolParameters = {
    minFeeA: 44,
    minFeeB: 155381,
    maxTxSize: 16384,
    minUtxoValue: "1000000",
    poolDeposit: "500000000",
    keyDeposit: "2000000",
    coinsPerUtxoWord: "4310",
    maxValSize: 5000,
    priceMem: 0.0577,
    priceStep: 0.0000721,
    collateralPercent: 150,
    maxCollateralInputs: 3,
  };

  const testUtxos: CardanoUtxo[] = [
    {
      txHash: "a".repeat(64),
      outputIndex: 0,
      address: "addr1qxck...",
      lovelace: "10000000",
      assets: [],
    },
    {
      txHash: "b".repeat(64),
      outputIndex: 1,
      address: "addr1qxck...",
      lovelace: "5000000",
      assets: [],
    },
  ];

  describe("estimateFee", () => {
    it("estimates fee for simple payment", () => {
      const fee = estimateFee(300, protocolParams);
      expect(fee).toBe(BigInt(44 * 300 + 155381));
    });

    it("fee increases with transaction size", () => {
      expect(estimateFee(1000, protocolParams)).toBeGreaterThan(estimateFee(200, protocolParams));
    });
  });

  describe("calculateMinUtxo", () => {
    it("calculates minimum UTxO for ADA-only output", () => {
      const output: TxOutput = { address: "addr1qxck...", lovelace: "0", assets: [] };
      const minUtxo = calculateMinUtxo(output, protocolParams);
      expect(minUtxo).toBeGreaterThanOrEqual(BigInt(protocolParams.minUtxoValue));
    });

    it("calculates higher minimum for outputs with native assets", () => {
      const adaOnly: TxOutput = { address: "addr1qxck...", lovelace: "0" };
      const withAsset: TxOutput = {
        address: "addr1qxck...",
        lovelace: "0",
        assets: [{ policyId: "a".repeat(56), assetName: "Token", quantity: "1000" }],
      };
      expect(calculateMinUtxo(withAsset, protocolParams)).toBeGreaterThan(
        calculateMinUtxo(adaOnly, protocolParams),
      );
    });
  });

  describe("buildSimplePaymentTx", () => {
    it("builds a valid payment transaction", async () => {
      const result = await buildSimplePaymentTx({
        utxos: testUtxos,
        outputs: [{ address: "addr1q9...recipient", lovelace: "2000000" }],
        changeAddress: "addr1q9...change",
        protocolParams,
      });
      expect(result.txBody).toBeDefined();
      expect(result.txHash.length).toBe(64);
      expect(BigInt(result.fee)).toBeGreaterThan(0n);
    });

    it("selects sufficient UTxOs for payment", async () => {
      const result = await buildSimplePaymentTx({
        utxos: testUtxos,
        outputs: [{ address: "addr1q9...recipient", lovelace: "8000000" }],
        changeAddress: "addr1q9...change",
        protocolParams,
      });
      expect(result.selectedUtxos.length).toBe(1);
    });

    it("throws when insufficient funds", async () => {
      await expect(
        buildSimplePaymentTx({
          utxos: testUtxos,
          outputs: [{ address: "addr1q9...recipient", lovelace: "20000000" }],
          changeAddress: "addr1q9...change",
          protocolParams,
        }),
      ).rejects.toThrow("Insufficient funds");
    });

    it("includes change output when necessary", async () => {
      const result = await buildSimplePaymentTx({
        utxos: testUtxos,
        outputs: [{ address: "addr1q9...recipient", lovelace: "2000000" }],
        changeAddress: "addr1q9...change",
        protocolParams,
      });
      expect(result.hasChange).toBe(true);
      expect(BigInt(result.changeAmount)).toBeGreaterThan(0n);
    });
  });

  describe("signTransaction", () => {
    it("signs transaction with private key", async () => {
      const privateKey = Buffer.alloc(64);
      privateKey.fill(1);
      const signature = await signTransaction("a".repeat(64), privateKey);
      expect(signature).toBeInstanceOf(Buffer);
      expect(signature.length).toBe(64);
    });

    it("produces deterministic signatures", async () => {
      const privateKey = Buffer.alloc(64);
      privateKey.fill(1);
      const sig1 = await signTransaction("a".repeat(64), privateKey);
      const sig2 = await signTransaction("a".repeat(64), privateKey);
      expect(sig1.equals(sig2)).toBe(true);
    });

    it("produces different signatures for different transactions", async () => {
      const privateKey = Buffer.alloc(64);
      privateKey.fill(1);
      const sig1 = await signTransaction("a".repeat(64), privateKey);
      const sig2 = await signTransaction("b".repeat(64), privateKey);
      expect(sig1.equals(sig2)).toBe(false);
    });
  });

  describe("serializeTransaction", () => {
    it("serializes transaction to CBOR hex", () => {
      const txBody = {
        inputs: [{ txHash: "a".repeat(64), index: 0 }],
        outputs: [{ address: "addr1...", amount: { coin: BigInt(2000000) } }],
        fee: BigInt(200000),
      };
      const cbor = serializeTransaction(txBody);
      expect(cbor).toMatch(/^[0-9a-f]+$/i);
    });
  });

  describe("deserializeTransaction", () => {
    it("throws on invalid CBOR", () => {
      expect(() => deserializeTransaction("invalid")).toThrow();
    });

    it("throws on empty input", () => {
      expect(() => deserializeTransaction("")).toThrow();
    });
  });
});

describe("cardano-tx coin selection", () => {
  const protocolParams: ProtocolParameters = {
    minFeeA: 44,
    minFeeB: 155381,
    maxTxSize: 16384,
    minUtxoValue: "1000000",
    poolDeposit: "500000000",
    keyDeposit: "2000000",
    coinsPerUtxoWord: "4310",
    maxValSize: 5000,
    priceMem: 0.0577,
    priceStep: 0.0000721,
    collateralPercent: 150,
    maxCollateralInputs: 3,
  };

  it("uses largest-first coin selection strategy", async () => {
    const utxos: CardanoUtxo[] = [
      { txHash: "a".repeat(64), outputIndex: 0, address: "addr1...", lovelace: "1000000" },
      { txHash: "b".repeat(64), outputIndex: 0, address: "addr1...", lovelace: "5000000" },
      { txHash: "c".repeat(64), outputIndex: 0, address: "addr1...", lovelace: "3000000" },
    ];
    const result = await buildSimplePaymentTx({
      utxos,
      outputs: [{ address: "addr1...recipient", lovelace: "4000000" }],
      changeAddress: "addr1...change",
      protocolParams,
    });
    expect(result.selectedUtxos[0].lovelace).toBe("5000000");
  });
});
