// ABOUTME: Unit tests for token store
// ABOUTME: Tests token persistence, loading, and clearing

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { TokenStore } from "./store.js";
import { TokenSet } from "./types.js";

describe("TokenStore", () => {
  let tempDir: string;
  let tokenPath: string;
  let store: TokenStore;

  const sampleTokens: TokenSet = {
    accessToken: "test-access-token-12345",
    refreshToken: "test-refresh-token-67890",
    expiresAt: Date.now() + 3600000, // 1 hour from now
    scope: "notes:read notes:write",
  };

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-store-test-"));
    tokenPath = path.join(tempDir, "tokens.json");
    store = new TokenStore(tokenPath);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("load", () => {
    it("should return null when no tokens exist", async () => {
      const result = await store.load();
      expect(result).toBeNull();
    });

    it("should load tokens from disk", async () => {
      // Write tokens directly to file
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify(sampleTokens));

      const result = await store.load();
      expect(result).toEqual(sampleTokens);
    });

    it("should return null for invalid JSON", async () => {
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, "not valid json");

      const result = await store.load();
      expect(result).toBeNull();
    });

    it("should return null for invalid token structure", async () => {
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify({ invalid: "structure" }));

      const result = await store.load();
      expect(result).toBeNull();
    });

    it("should return null when accessToken is missing", async () => {
      const incomplete = { ...sampleTokens };
      delete (incomplete as Partial<TokenSet>).accessToken;
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify(incomplete));

      const result = await store.load();
      expect(result).toBeNull();
    });

    it("should return null when refreshToken is missing", async () => {
      const incomplete = { ...sampleTokens };
      delete (incomplete as Partial<TokenSet>).refreshToken;
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify(incomplete));

      const result = await store.load();
      expect(result).toBeNull();
    });
  });

  describe("save", () => {
    it("should save tokens to disk", async () => {
      await store.save(sampleTokens);

      const content = await fs.readFile(tokenPath, "utf-8");
      const saved = JSON.parse(content);
      expect(saved).toEqual(sampleTokens);
    });

    it("should create parent directories if they do not exist", async () => {
      const nestedPath = path.join(tempDir, "nested", "deep", "tokens.json");
      const nestedStore = new TokenStore(nestedPath);

      await nestedStore.save(sampleTokens);

      const content = await fs.readFile(nestedPath, "utf-8");
      const saved = JSON.parse(content);
      expect(saved).toEqual(sampleTokens);
    });

    it("should overwrite existing tokens", async () => {
      await store.save(sampleTokens);

      const newTokens: TokenSet = {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresAt: Date.now() + 7200000,
        scope: "notes:read",
      };
      await store.save(newTokens);

      const result = await store.load();
      expect(result).toEqual(newTokens);
    });

    it("should create file with restricted permissions on Unix", async () => {
      // Skip on Windows where permissions work differently
      if (process.platform === "win32") {
        return;
      }

      await store.save(sampleTokens);

      const stats = await fs.stat(tokenPath);
      // Check that only owner has read/write (0600 = 384 in decimal)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe("clear", () => {
    it("should delete token file", async () => {
      await store.save(sampleTokens);

      // Verify file exists
      const existsBefore = await fs.access(tokenPath).then(() => true).catch(() => false);
      expect(existsBefore).toBe(true);

      await store.clear();

      // Verify file is deleted
      const existsAfter = await fs.access(tokenPath).then(() => true).catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it("should not throw when file does not exist", async () => {
      // Should not throw
      await expect(store.clear()).resolves.not.toThrow();
    });

    it("should result in load returning null", async () => {
      await store.save(sampleTokens);
      await store.clear();

      const result = await store.load();
      expect(result).toBeNull();
    });
  });

  describe("round-trip", () => {
    it("should save and load tokens correctly", async () => {
      await store.save(sampleTokens);
      const loaded = await store.load();
      expect(loaded).toEqual(sampleTokens);
    });

    it("should handle multiple save/load cycles", async () => {
      for (let i = 0; i < 5; i++) {
        const tokens: TokenSet = {
          accessToken: `token-${i}`,
          refreshToken: `refresh-${i}`,
          expiresAt: Date.now() + i * 1000,
          scope: `scope-${i}`,
        };

        await store.save(tokens);
        const loaded = await store.load();
        expect(loaded).toEqual(tokens);
      }
    });
  });
});
