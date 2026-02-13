/**
 * Session-scoped in-memory unlock state with auto-lock.
 *
 * The VMK is held in memory only while the vault is unlocked.
 * It is explicitly zeroed on lock or when the auto-lock timer fires.
 */

import type { BackendType, UnlockedState } from "../types.js";
import { DEFAULT_AUTO_LOCK_TIMEOUT_MS } from "../constants.js";
import { zeroBuffer } from "../crypto/key-hierarchy.js";

let state: UnlockedState | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;
let autoLockTimeoutMs = DEFAULT_AUTO_LOCK_TIMEOUT_MS;

/** Set the auto-lock timeout. 0 means disabled. */
export function setAutoLockTimeout(ms: number): void {
  autoLockTimeoutMs = Math.max(0, ms);
  resetAutoLockTimer();
}

/** Get the current auto-lock timeout. */
export function getAutoLockTimeout(): number {
  return autoLockTimeoutMs;
}

/** Unlock the vault by storing the VMK in memory. */
export function unlock(vmk: Buffer, backend: BackendType): void {
  // Zero any existing VMK first
  if (state) {
    zeroBuffer(state.vmk);
  }
  state = {
    vmk: Buffer.from(vmk), // Copy so caller can zero their buffer
    unlockedAt: Date.now(),
    backend,
  };
  resetAutoLockTimer();
}

/** Lock the vault, zeroing the VMK from memory. */
export function lock(): void {
  clearAutoLockTimer();
  if (state) {
    zeroBuffer(state.vmk);
    state = null;
  }
}

/** Check if the vault is currently unlocked. */
export function isUnlocked(): boolean {
  return state !== null;
}

/** Get the VMK. Throws if vault is locked. */
export function getVmk(): Buffer {
  if (!state) {
    throw new Error("Vault is locked");
  }
  resetAutoLockTimer();
  return state.vmk;
}

/** Get the current backend type. */
export function getBackend(): BackendType | null {
  return state?.backend ?? null;
}

/** Get unlock timestamp. */
export function getUnlockedAt(): number | null {
  return state?.unlockedAt ?? null;
}

function resetAutoLockTimer(): void {
  clearAutoLockTimer();
  if (autoLockTimeoutMs > 0 && state) {
    autoLockTimer = setTimeout(() => {
      lock();
    }, autoLockTimeoutMs);
    // Don't keep the process alive just for the timer
    if (autoLockTimer && typeof autoLockTimer === "object" && "unref" in autoLockTimer) {
      autoLockTimer.unref();
    }
  }
}

function clearAutoLockTimer(): void {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}
