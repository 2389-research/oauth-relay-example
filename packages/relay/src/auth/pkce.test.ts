// ABOUTME: Unit tests for PKCE implementation
// ABOUTME: Verifies verifier generation and challenge computation

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { createPkceChallenge } from "./pkce.js";

describe("PKCE", () => {
  describe("createPkceChallenge", () => {
    it("should generate a verifier and challenge", () => {
      const { verifier, challenge } = createPkceChallenge();

      expect(verifier).toBeDefined();
      expect(challenge).toBeDefined();
      expect(typeof verifier).toBe("string");
      expect(typeof challenge).toBe("string");
    });

    it("should generate verifier with correct length (base64url of 48 bytes)", () => {
      const { verifier } = createPkceChallenge();

      // 48 bytes in base64url = 64 characters (above RFC 7636 minimum of 43)
      expect(verifier.length).toBe(64);
    });

    it("should generate challenge with correct length (base64url of SHA-256 hash)", () => {
      const { challenge } = createPkceChallenge();

      // SHA-256 = 32 bytes, base64url encoded = 43 characters
      expect(challenge.length).toBe(43);
    });

    it("should generate unique verifiers each time", () => {
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const { verifier } = createPkceChallenge();
        results.add(verifier);
      }
      // All verifiers should be unique
      expect(results.size).toBe(100);
    });

    it("should generate valid base64url characters in verifier", () => {
      const { verifier } = createPkceChallenge();
      // Base64url uses A-Z, a-z, 0-9, -, _
      const base64urlRegex = /^[A-Za-z0-9_-]+$/;
      expect(verifier).toMatch(base64urlRegex);
    });

    it("should generate valid base64url characters in challenge", () => {
      const { challenge } = createPkceChallenge();
      const base64urlRegex = /^[A-Za-z0-9_-]+$/;
      expect(challenge).toMatch(base64urlRegex);
    });

    it("should compute challenge as SHA-256 hash of verifier", () => {
      const { verifier, challenge } = createPkceChallenge();

      // Manually compute the expected challenge
      const expectedHash = crypto.createHash("sha256").update(verifier).digest();
      const expectedChallenge = expectedHash.toString("base64url");

      expect(challenge).toBe(expectedChallenge);
    });

    it("should produce different challenges for different verifiers", () => {
      const pkce1 = createPkceChallenge();
      const pkce2 = createPkceChallenge();

      expect(pkce1.verifier).not.toBe(pkce2.verifier);
      expect(pkce1.challenge).not.toBe(pkce2.challenge);
    });
  });
});
