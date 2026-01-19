// ABOUTME: Unit tests for token types and utilities
// ABOUTME: Tests token expiration checking

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenSet, isTokenExpired } from "./types.js";

describe("Token Types", () => {
  describe("isTokenExpired", () => {
    const baseToken: TokenSet = {
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      expiresAt: 0, // Will be set in each test
      scope: "notes:read",
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return true for expired token", () => {
      vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

      const token: TokenSet = {
        ...baseToken,
        expiresAt: new Date("2024-01-15T11:00:00Z").getTime(), // 1 hour ago
      };

      expect(isTokenExpired(token)).toBe(true);
    });

    it("should return false for valid token", () => {
      vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

      const token: TokenSet = {
        ...baseToken,
        expiresAt: new Date("2024-01-15T13:00:00Z").getTime(), // 1 hour from now
      };

      expect(isTokenExpired(token)).toBe(false);
    });

    it("should consider token expired within default buffer (60 seconds)", () => {
      vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

      const token: TokenSet = {
        ...baseToken,
        // Expires in 30 seconds - within default 60s buffer
        expiresAt: new Date("2024-01-15T12:00:30Z").getTime(),
      };

      expect(isTokenExpired(token)).toBe(true);
    });

    it("should not consider token expired outside default buffer", () => {
      vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

      const token: TokenSet = {
        ...baseToken,
        // Expires in 2 minutes - outside default 60s buffer
        expiresAt: new Date("2024-01-15T12:02:00Z").getTime(),
      };

      expect(isTokenExpired(token)).toBe(false);
    });

    it("should respect custom buffer time", () => {
      vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

      const token: TokenSet = {
        ...baseToken,
        // Expires in 2 minutes
        expiresAt: new Date("2024-01-15T12:02:00Z").getTime(),
      };

      // With 5 minute buffer, token should be considered expired
      expect(isTokenExpired(token, 5 * 60 * 1000)).toBe(true);

      // With 1 minute buffer, token should not be expired
      expect(isTokenExpired(token, 60 * 1000)).toBe(false);
    });

    it("should return true when expiresAt equals current time", () => {
      const now = new Date("2024-01-15T12:00:00Z").getTime();
      vi.setSystemTime(now);

      const token: TokenSet = {
        ...baseToken,
        expiresAt: now,
      };

      expect(isTokenExpired(token)).toBe(true);
    });

    it("should handle zero buffer correctly", () => {
      vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

      const token: TokenSet = {
        ...baseToken,
        // Expires in 1 second
        expiresAt: new Date("2024-01-15T12:00:01Z").getTime(),
      };

      // With zero buffer, token should not be expired
      expect(isTokenExpired(token, 0)).toBe(false);

      // Advance time by 2 seconds
      vi.advanceTimersByTime(2000);

      // Now it should be expired
      expect(isTokenExpired(token, 0)).toBe(true);
    });
  });
});
