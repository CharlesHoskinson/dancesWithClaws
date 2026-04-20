import type { Scp03Session } from "../session.js";
import { ObjectType } from "../types/object.js";

const CMD_DELETE_OBJECT = 0x58;

export async function deleteObject(
  session: Scp03Session,
  objectId: number,
  objectType: ObjectType,
): Promise<void> {
  if (objectId < 0 || objectId > 0xffff) {
    throw new Error(`objectId out of range: ${objectId}`);
  }
  const payload = new Uint8Array(3);
  payload[0] = (objectId >> 8) & 0xff;
  payload[1] = objectId & 0xff;
  payload[2] = objectType;
  await session.sendCommand(CMD_DELETE_OBJECT, payload);
}
