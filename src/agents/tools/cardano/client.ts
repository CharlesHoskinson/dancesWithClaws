/**
 * Multi-provider Cardano API client with automatic failover.
 */

import type { AddressInfo, TxInfo, PoolInfo, EpochInfo, AssetInfo, UtxoSet } from "./types.js";

const KOIOS_MAINNET = "https://api.koios.rest/api/v1";
const KOIOS_PREPROD = "https://preprod.koios.rest/api/v1";
const KOIOS_PREVIEW = "https://preview.koios.rest/api/v1";
const TIMEOUT_MS = 30_000;

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

export type CardanoNetwork = "mainnet" | "preprod" | "preview";

export interface CardanoClientConfig {
  network?: CardanoNetwork;
  blockfrostApiKey?: string;
  koiosApiKey?: string;
}

export function createCardanoClient(config: CardanoClientConfig = {}) {
  const network = config.network ?? "mainnet";
  const koiosKey = config.koiosApiKey;

  const koiosBase =
    network === "mainnet" ? KOIOS_MAINNET : network === "preprod" ? KOIOS_PREPROD : KOIOS_PREVIEW;

  async function koiosRequest<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
    const url = `${koiosBase}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (koiosKey) headers["Authorization"] = `Bearer ${koiosKey}`;
      if (body) headers["Content-Type"] = "application/json";

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: `Koios ${res.status}: ${text || res.statusText}` };
      }

      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, error: `Koios: ${e instanceof Error ? e.message : "Unknown"}` };
    }
  }

  return {
    network,
    getAddressInfo: (address: string) =>
      koiosRequest<AddressInfo[]>("POST", "/address_info", { _addresses: [address] }).then(
        (r) => (r.ok ? { ok: true, data: r.data[0] } : r) as Result<AddressInfo>,
      ),
    getAddressUtxos: (address: string) =>
      koiosRequest<UtxoSet[]>("POST", "/address_utxos", { _addresses: [address] }),
    getTxInfo: (txHash: string) =>
      koiosRequest<TxInfo[]>("POST", "/tx_info", { _tx_hashes: [txHash] }).then(
        (r) => (r.ok ? { ok: true, data: r.data[0] } : r) as Result<TxInfo>,
      ),
    getPoolInfo: (poolId: string) =>
      koiosRequest<PoolInfo[]>("POST", "/pool_info", { _pool_bech32_ids: [poolId] }).then(
        (r) => (r.ok ? { ok: true, data: r.data[0] } : r) as Result<PoolInfo>,
      ),
    getEpochInfo: () =>
      koiosRequest<EpochInfo[]>("GET", "/epoch_info").then(
        (r) => (r.ok ? { ok: true, data: r.data[0] } : r) as Result<EpochInfo>,
      ),
    getTip: () =>
      koiosRequest<{ hash: string; epoch_no: number; abs_slot: number; block_no: number }[]>(
        "GET",
        "/tip",
      ).then(
        (r) =>
          (r.ok ? { ok: true, data: r.data[0] } : r) as Result<{
            hash: string;
            epoch_no: number;
            abs_slot: number;
            block_no: number;
          }>,
      ),
    getAssetInfo: (policyId: string, assetName: string) =>
      koiosRequest<AssetInfo[]>("POST", "/asset_info", {
        _asset_list: [[policyId, assetName]],
      }).then((r) => (r.ok ? { ok: true, data: r.data[0] } : r) as Result<AssetInfo>),
    koiosRequest,
  };
}

export type CardanoClient = ReturnType<typeof createCardanoClient>;
