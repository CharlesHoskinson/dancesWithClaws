import type { Scp03Session } from "../session.js";

const CMD_FACTORY_RESET = 0x08;

/**
 * Wipes the device to factory state. Request and response payloads are both
 * empty. The device reboots after executing the command, so the SCP03 session
 * keys, session ID, and any open transport connection are all dead on return.
 *
 * The driver marks the session CLOSED before returning. Callers MUST discard
 * the transport and open a fresh one (using factory-password-derived keys or
 * whatever new admin was provisioned post-reset) before doing more work.
 */
export async function factoryReset(session: Scp03Session): Promise<void> {
  const rsp = await session.sendCommand(CMD_FACTORY_RESET, new Uint8Array(0));
  if (rsp.length !== 0) {
    throw new Error(`factoryReset bad response length: ${rsp.length}`);
  }
  session.markClosed();
}
