// ABOUTME: Unit tests for OAuth callback server
// ABOUTME: Tests server startup, callback handling, and shutdown

import { describe, it, expect, afterEach } from "vitest";
import { CallbackServer } from "./callback-server.js";

describe("CallbackServer", () => {
  let server: CallbackServer;
  let shutdown: (() => void) | null = null;

  afterEach(async () => {
    // Clean up any running server
    if (shutdown) {
      shutdown();
      shutdown = null;
    }
  });

  describe("start", () => {
    it("should start on a random available port", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      shutdown = result.shutdown;

      expect(result.port).toBeGreaterThan(0);
      expect(result.port).toBeLessThan(65536);
      expect(typeof result.waitForCallback).toBe("function");
      expect(typeof result.shutdown).toBe("function");
    });

    it("should bind to specified host", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000, { host: "127.0.0.1" });
      shutdown = result.shutdown;

      expect(result.host).toBe("127.0.0.1");
    });

    it("should use RELAY_CALLBACK_HOST env var if set", async () => {
      const originalEnv = process.env.RELAY_CALLBACK_HOST;
      process.env.RELAY_CALLBACK_HOST = "0.0.0.0";

      try {
        server = new CallbackServer();
        const result = await server.start("test-state", 10000);
        shutdown = result.shutdown;

        expect(result.host).toBe("0.0.0.0");
      } finally {
        if (originalEnv === undefined) {
          delete process.env.RELAY_CALLBACK_HOST;
        } else {
          process.env.RELAY_CALLBACK_HOST = originalEnv;
        }
      }
    });

    it("should accept connections on the assigned port", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      shutdown = result.shutdown;

      const response = await fetch(`http://127.0.0.1:${result.port}/`);
      expect(response.status).toBe(404); // No route for /
    });
  });

  describe("callback handling", () => {
    it("should resolve with code and state on valid callback", async () => {
      server = new CallbackServer();
      const result = await server.start("valid-state", 10000);
      shutdown = result.shutdown;

      // Simulate callback in background
      const callbackPromise = result.waitForCallback();

      // Make callback request
      await fetch(
        `http://127.0.0.1:${result.port}/callback?code=auth-code-123&state=valid-state`
      );

      const callbackResult = await callbackPromise;
      expect(callbackResult.code).toBe("auth-code-123");
      expect(callbackResult.state).toBe("valid-state");
      shutdown = null; // Server shuts itself down after callback
    });

    it("should reject on state mismatch", async () => {
      server = new CallbackServer();
      const result = await server.start("expected-state", 10000);
      shutdown = result.shutdown;

      // Make callback with wrong state
      const response = await fetch(
        `http://127.0.0.1:${result.port}/callback?code=auth-code&state=wrong-state`
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("State mismatch");
    });

    it("should reject on missing code", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      shutdown = result.shutdown;

      const response = await fetch(
        `http://127.0.0.1:${result.port}/callback?state=test-state`
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Missing code or state");
    });

    it("should reject on missing state", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      shutdown = result.shutdown;

      const response = await fetch(
        `http://127.0.0.1:${result.port}/callback?code=auth-code`
      );

      expect(response.status).toBe(400);
    });

    it("should handle error callback from auth server", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      shutdown = result.shutdown;

      // Start waiting for callback before making request
      const callbackPromise = result.waitForCallback();

      // Simulate error callback - don't await this
      fetch(
        `http://127.0.0.1:${result.port}/callback?error=access_denied&error_description=User+denied+access`
      ).catch(() => {}); // Ignore fetch errors if server closes

      await expect(callbackPromise).rejects.toThrow("Authorization denied: access_denied - User denied access");
      shutdown = null; // Server shuts itself down after error
    });

    it("should return success HTML on valid callback", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      shutdown = result.shutdown;

      const response = await fetch(
        `http://127.0.0.1:${result.port}/callback?code=auth-code&state=test-state`
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Authorization Successful");
      expect(html).toContain("close this window");
      shutdown = null;
    });

    it("should return error HTML on error callback", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      shutdown = result.shutdown;

      // We need to catch the callback promise rejection
      const callbackPromise = result.waitForCallback().catch(() => {});

      const response = await fetch(
        `http://127.0.0.1:${result.port}/callback?error=server_error&error_description=Something+went+wrong`
      );

      await callbackPromise; // Wait for the rejection to be handled

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Authorization Failed");
      expect(html).toContain("server_error");
      expect(html).toContain("Something went wrong");
      shutdown = null;
    });
  });

  describe("timeout", () => {
    it("should reject callback promise on timeout", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 100); // 100ms timeout
      shutdown = result.shutdown;

      const callbackPromise = result.waitForCallback();

      await expect(callbackPromise).rejects.toThrow("Authorization timed out");
      shutdown = null; // Server shuts itself down on timeout
    });
  });

  describe("shutdown", () => {
    it("should close server on explicit shutdown", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      const port = result.port;

      result.shutdown();
      shutdown = null;

      // Server should be closed
      await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    });

    it("should handle multiple shutdown calls gracefully", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);

      // Multiple shutdowns should not throw
      expect(() => result.shutdown()).not.toThrow();
      expect(() => result.shutdown()).not.toThrow();
      expect(() => result.shutdown()).not.toThrow();
      shutdown = null;
    });
  });

  describe("404 handling", () => {
    it("should return 404 for unknown paths", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      shutdown = result.shutdown;

      const response = await fetch(`http://127.0.0.1:${result.port}/unknown`);
      expect(response.status).toBe(404);
    });

    it("should return 404 for root path", async () => {
      server = new CallbackServer();
      const result = await server.start("test-state", 10000);
      shutdown = result.shutdown;

      const response = await fetch(`http://127.0.0.1:${result.port}/`);
      expect(response.status).toBe(404);
    });
  });
});
