// ABOUTME: Integration tests for orchestrator
// ABOUTME: Tests token management and tool forwarding with mocked dependencies

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import http from "http";
import type { AddressInfo } from "net";
import { TokenSet } from "../src/token/types.js";

describe("Orchestrator Integration", () => {
  let tempDir: string;
  let tokenPath: string;
  let mockBackend: http.Server;
  let backendUrl: string;

  const validToken: TokenSet = {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: Date.now() + 3600000, // 1 hour
    scope: "notes:read notes:write",
  };

  const expiredToken: TokenSet = {
    accessToken: "expired-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: Date.now() - 3600000, // 1 hour ago
    scope: "notes:read notes:write",
  };

  beforeEach(async () => {
    // Create temp directory for tokens
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "orchestrator-test-"));
    tokenPath = path.join(tempDir, "tokens.json");

    // Create mock backend
    mockBackend = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");

      if (req.url === "/mcp/tools" && req.method === "GET") {
        res.writeHead(200);
        res.end(JSON.stringify({ tools: [{ name: "echo" }] }));
        return;
      }

      if (req.url === "/mcp/tools/echo" && req.method === "POST") {
        const auth = req.headers.authorization;

        // Reject invalid or expired tokens
        if (auth === "Bearer expired-access-token" || auth === "Bearer invalid-token") {
          res.writeHead(401);
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const { arguments: args } = JSON.parse(body);
          res.writeHead(200);
          res.end(JSON.stringify({ content: [{ type: "text", text: args.message }] }));
        });
        return;
      }

      if (req.url === "/mcp/tools/protected" && req.method === "POST") {
        const auth = req.headers.authorization;
        if (!auth || auth !== "Bearer test-access-token") {
          res.writeHead(401);
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ content: [{ type: "text", text: "protected" }] }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "not_found" }));
    });

    mockBackend.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => mockBackend.once("listening", resolve));
    const address = mockBackend.address() as AddressInfo;
    backendUrl = `http://127.0.0.1:${address.port}`;

    // Mock config
    vi.doMock("../src/config.js", () => ({
      config: {
        authServerUrl: "http://localhost:4100",
        backendUrl,
        clientId: "test-client",
        scopes: ["notes:read", "notes:write"],
        authTimeout: 5000,
        tokenPath,
        callbackHost: "127.0.0.1",
        callbackUrlHost: "localhost",
        logLevel: "info",
      },
    }));
  });

  afterEach(async () => {
    vi.resetModules();

    await new Promise<void>((resolve, reject) => {
      mockBackend.close((err) => (err ? reject(err) : resolve()));
    });

    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe("init", () => {
    it("should load stored tokens on init", async () => {
      // Pre-store tokens
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify(validToken));

      const { Orchestrator } = await import("../src/orchestrator.js");
      const orchestrator = new Orchestrator();
      await orchestrator.init();

      // Verify by calling a tool that doesn't need auth
      const result = await orchestrator.callTool("echo", { message: "test" });
      expect(result.content[0].text).toBe("test");
    });

    it("should handle missing token file gracefully", async () => {
      const { Orchestrator } = await import("../src/orchestrator.js");
      const orchestrator = new Orchestrator();

      // Should not throw
      await expect(orchestrator.init()).resolves.not.toThrow();
    });
  });

  describe("listTools", () => {
    it("should forward list tools to backend", async () => {
      const { Orchestrator } = await import("../src/orchestrator.js");
      const orchestrator = new Orchestrator();
      await orchestrator.init();

      const tools = await orchestrator.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("echo");
    });
  });

  describe("callTool", () => {
    it("should call tool without auth when no token stored", async () => {
      const { Orchestrator } = await import("../src/orchestrator.js");
      const orchestrator = new Orchestrator();
      await orchestrator.init();

      const result = await orchestrator.callTool("echo", { message: "no-auth" });
      expect(result.content[0].text).toBe("no-auth");
    });

    it("should use stored token for calls", async () => {
      // Pre-store tokens
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify(validToken));

      const { Orchestrator } = await import("../src/orchestrator.js");
      const orchestrator = new Orchestrator();
      await orchestrator.init();

      const result = await orchestrator.callTool("protected", {});
      expect(result.content[0].text).toBe("protected");
    });
  });

  describe("token persistence", () => {
    it("should use tokens from disk across orchestrator instances", async () => {
      // Store tokens
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify(validToken));

      // First instance
      const { Orchestrator: Orch1 } = await import("../src/orchestrator.js");
      const orch1 = new Orch1();
      await orch1.init();

      const result1 = await orch1.callTool("protected", {});
      expect(result1.content[0].text).toBe("protected");

      // Clear module cache and create second instance
      vi.resetModules();
      vi.doMock("../src/config.js", () => ({
        config: {
          authServerUrl: "http://localhost:4100",
          backendUrl,
          clientId: "test-client",
          scopes: ["notes:read", "notes:write"],
          authTimeout: 5000,
          tokenPath,
          callbackHost: "127.0.0.1",
          callbackUrlHost: "localhost",
          logLevel: "info",
        },
      }));

      const { Orchestrator: Orch2 } = await import("../src/orchestrator.js");
      const orch2 = new Orch2();
      await orch2.init();

      // Should still have the token
      const result2 = await orch2.callTool("protected", {});
      expect(result2.content[0].text).toBe("protected");
    });
  });
});
