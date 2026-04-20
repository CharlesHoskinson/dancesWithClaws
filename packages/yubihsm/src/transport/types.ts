export interface HsmTransport {
  send(apdu: Uint8Array): Promise<Uint8Array>;
  close(): Promise<void>;
}

export type ApduHandler = (apdu: Uint8Array) => Promise<Uint8Array>;
