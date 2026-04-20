import type { Scp03Session } from "../session.js";
import type { ObjectType } from "../types/object.js";

const CMD_LIST_OBJECTS = 0x48;

const FILTER_TAG_ID = 0x01;
const FILTER_TAG_TYPE = 0x02;

export interface ListObjectsFilter {
  readonly id?: number;
  readonly type?: ObjectType;
}

export interface ObjectListEntry {
  readonly id: number;
  readonly type: ObjectType;
  readonly sequence: number;
}

export async function listObjects(
  session: Scp03Session,
  filter: ListObjectsFilter = {},
): Promise<ObjectListEntry[]> {
  const parts: number[] = [];
  if (filter.id !== undefined) {
    parts.push(FILTER_TAG_ID, (filter.id >> 8) & 0xff, filter.id & 0xff);
  }
  if (filter.type !== undefined) {
    parts.push(FILTER_TAG_TYPE, filter.type);
  }
  const rsp = await session.sendCommand(CMD_LIST_OBJECTS, new Uint8Array(parts));
  if (rsp.length % 4 !== 0) {
    throw new Error(`listObjects response not a multiple of 4: ${rsp.length}`);
  }
  const entries: ObjectListEntry[] = [];
  for (let i = 0; i < rsp.length; i += 4) {
    entries.push({
      id: (rsp[i]! << 8) | rsp[i + 1]!,
      type: rsp[i + 2]! as ObjectType,
      sequence: rsp[i + 3]!,
    });
  }
  return entries;
}
