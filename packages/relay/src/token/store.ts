// ABOUTME: Token persistence store
// ABOUTME: Securely stores OAuth tokens on disk with restricted permissions

import fs from "fs/promises";
import path from "path";
import { TokenSet } from "./types.js";
import { config } from "../config.js";

export class TokenStore {
  private tokenPath: string;

  constructor(tokenPath?: string) {
    this.tokenPath = tokenPath || config.tokenPath;
  }

  /**
   * Load tokens from disk.
   * Returns null if no tokens are stored or if loading fails.
   */
  async load(): Promise<TokenSet | null> {
    try {
      const data = await fs.readFile(this.tokenPath, "utf-8");
      const parsed = JSON.parse(data);

      // Validate structure
      if (
        typeof parsed.accessToken !== "string" ||
        typeof parsed.refreshToken !== "string" ||
        typeof parsed.expiresAt !== "number" ||
        typeof parsed.scope !== "string"
      ) {
        console.error("[token-store] Invalid token format");
        return null;
      }

      return parsed as TokenSet;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist - normal for first run
        return null;
      }
      console.error("[token-store] Failed to load tokens:", err);
      return null;
    }
  }

  /**
   * Save tokens to disk with restricted permissions.
   * Uses atomic write (write to temp file, then rename) to prevent corruption.
   */
  async save(tokens: TokenSet): Promise<void> {
    try {
      // Ensure directory exists with restricted permissions
      const dir = path.dirname(this.tokenPath);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });

      // Atomic write: write to temp file first, then rename
      const tempPath = `${this.tokenPath}.tmp`;
      const data = JSON.stringify(tokens);
      await fs.writeFile(tempPath, data, { mode: 0o600 });
      await fs.rename(tempPath, this.tokenPath);
    } catch (err) {
      console.error("[token-store] Failed to save tokens:", err);
      throw err;
    }
  }

  /**
   * Clear stored tokens.
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.tokenPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[token-store] Failed to clear tokens:", err);
        throw err;
      }
      // File doesn't exist - nothing to clear
    }
  }
}
