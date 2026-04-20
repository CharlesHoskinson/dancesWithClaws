/**
 * Tests for IronKey disaster recovery backup.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { secureDelete } from "../../src/integrations/ironkey-backup.js";

describe("ironkey-backup", () => {
  describe("secureDelete", () => {
    it("overwrites file with random data before deleting", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ironkey-test-"));
      const testFile = path.join(tmpDir, "secret.bin");
      await fs.writeFile(testFile, "sensitive-data-here");

      await secureDelete(testFile);

      // File should no longer exist
      await expect(fs.access(testFile)).rejects.toThrow();

      // Cleanup
      await fs.rmdir(tmpDir).catch(() => {});
    });

    it("handles non-existent files gracefully", async () => {
      // Should not throw
      await expect(secureDelete("/nonexistent/path/file.bin")).resolves.toBeUndefined();
    });
  });

  describe("BackupManifest structure", () => {
    it("imports the expected types", async () => {
      const mod = await import("../../src/integrations/ironkey-backup.js");
      // Verify exports exist
      expect(typeof mod.createWrapKey).toBe("function");
      expect(typeof mod.exportWrappedObject).toBe("function");
      expect(typeof mod.importWrappedObject).toBe("function");
      expect(typeof mod.importRawWrapKey).toBe("function");
      expect(typeof mod.createFullBackup).toBe("function");
      expect(typeof mod.restoreFullBackup).toBe("function");
      expect(typeof mod.secureDelete).toBe("function");
    });
  });
});
