// Cardano API Types

export interface AddressInfo {
  address: string;
  balance: string;
  stake_address?: string;
  script_address: boolean;
  utxo_set: UtxoSet[];
}

export interface UtxoSet {
  tx_hash: string;
  tx_index: number;
  value: string;
  asset_list?: Asset[];
  datum_hash?: string;
  inline_datum?: unknown;
  reference_script?: unknown;
}

export interface Asset {
  policy_id: string;
  asset_name: string;
  quantity: string;
  fingerprint?: string;
}

export interface TxInfo {
  tx_hash: string;
  block_hash: string;
  block_height: number;
  epoch_no: number;
  epoch_slot: number;
  absolute_slot: number;
  tx_timestamp: number;
  tx_block_index: number;
  tx_size: number;
  total_output: string;
  fee: string;
  deposit: string;
  invalid_before?: string;
  invalid_after?: string;
  inputs: TxInput[];
  outputs: TxOutput[];
}

export interface TxInput {
  tx_hash: string;
  tx_index: number;
  value: string;
  datum_hash?: string;
  asset_list?: Asset[];
}

export interface TxOutput {
  payment_addr: { cred: string; network: number; bech32: string };
  stake_addr?: string;
  tx_hash: string;
  tx_index: number;
  value: string;
  datum_hash?: string;
  asset_list?: Asset[];
}

export interface PoolInfo {
  pool_id_bech32: string;
  pool_id_hex: string;
  margin: number;
  fixed_cost: string;
  pledge: string;
  meta_json?: { name?: string; ticker?: string; description?: string; homepage?: string };
  pool_status: string;
  live_stake?: string;
  live_delegators?: number;
  live_saturation?: number;
  block_count?: number;
  retiring_epoch?: number;
}

export interface EpochInfo {
  epoch_no: number;
  out_sum: string;
  fees: string;
  tx_count: number;
  blk_count: number;
  start_time: number;
  end_time: number;
}

export interface AssetInfo {
  policy_id: string;
  asset_name: string;
  asset_name_ascii: string;
  fingerprint: string;
  minting_tx_hash: string;
  total_supply: string;
  mint_cnt: number;
  burn_cnt: number;
  creation_time: number;
  token_registry_metadata?: {
    name?: string;
    description?: string;
    ticker?: string;
    url?: string;
    decimals?: number;
  };
}
