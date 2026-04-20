import type { HsmTransport } from "../transport/types.js";
import { decodeResponse, encodeApdu } from "../wire/apdu.js";

const CMD_DEVICE_INFO = 0x06;

export interface FirmwareVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface DeviceInfo {
  readonly firmware: FirmwareVersion;
  readonly serial: number;
  readonly logTotal: number;
  readonly logUsed: number;
  readonly algorithms: readonly number[];
}

export async function getDeviceInfo(transport: HsmTransport): Promise<DeviceInfo> {
  const rsp = decodeResponse(await transport.send(encodeApdu(CMD_DEVICE_INFO, new Uint8Array(0))));
  if (rsp.kind !== "ok") {
    throw new Error(`GET_DEVICE_INFO failed: ${rsp.code}`);
  }
  const d = rsp.data;
  if (d.length < 9) {
    throw new Error(`GET_DEVICE_INFO response too short: ${d.length}`);
  }
  const serial = (d[3]! | (d[4]! << 8) | (d[5]! << 16) | (d[6]! << 24)) >>> 0;
  return {
    firmware: { major: d[0]!, minor: d[1]!, patch: d[2]! },
    serial,
    logTotal: d[7]!,
    logUsed: d[8]!,
    algorithms: [...d.subarray(9)],
  };
}
