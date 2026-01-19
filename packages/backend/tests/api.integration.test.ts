// ABOUTME: Integration tests for the backend API
// ABOUTME: Tests full request/response cycle with real HTTP

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as jose from "jose";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import http from "http";
import type { AddressInfo } from "net";

describe("Backend API Integration", () => {
  let server: http.Server;
  let baseUrl: string;
  const secret = new TextEncoder().encode(config.jwtSecret);

  async function createToken(
    claims: Record<string, unknown>,
    options?: { expiresIn?: string }
  ): Promise<string> {
    const jwt = new jose.SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(config.authServerUrl)
      .setAudience(config.jwtAudience);

    if (options?.expiresIn) {
      jwt.setExpirationTime(options.expiresIn);
    } else {
      jwt.setExpirationTime("1h");
    }

    return jwt.sign(secret);
  }

  beforeAll(async () => {
    const app = createApp();
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe("Health Check", () => {
    it("GET / should return status ok", async () => {
      const response = await fetch(`${baseUrl}/`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe("ok");
      expect(data.service).toBe("oauth-relay-example-backend");
    });
  });

  describe("List Tools", () => {
    it("GET /mcp/tools should return tool list", async () => {
      const response = await fetch(`${baseUrl}/mcp/tools`);
      expect(response.status).toBe(200);

      const data = await response.json() as { tools: Array<{ name: string }> };
      expect(data.tools).toHaveLength(4);
      expect(data.tools.map((t) => t.name)).toEqual(
        expect.arrayContaining(["echo", "read_notes", "create_note", "whoami"])
      );
    });

    it("should not require authentication", async () => {
      const response = await fetch(`${baseUrl}/mcp/tools`);
      expect(response.status).toBe(200);
    });
  });

  describe("Echo Tool", () => {
    it("POST /mcp/tools/echo should echo message without auth", async () => {
      const response = await fetch(`${baseUrl}/mcp/tools/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arguments: { message: "Integration test!" } }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { content: Array<{ text: string }> };
      expect(data.content[0].text).toBe("Integration test!");
    });

    it("should return 400 for missing message", async () => {
      const response = await fetch(`${baseUrl}/mcp/tools/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arguments: {} }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("invalid_request");
    });
  });

  describe("Read Notes Tool", () => {
    it("should return 401 without auth", async () => {
      const response = await fetch(`${baseUrl}/mcp/tools/read_notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arguments: {} }),
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 with wrong scope", async () => {
      const token = await createToken({
        sub: "user-integration",
        scope: "notes:write", // Wrong scope
        client_id: "test-client",
      });

      const response = await fetch(`${baseUrl}/mcp/tools/read_notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ arguments: {} }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("insufficient_scope");
    });

    it("should return notes with correct scope", async () => {
      const token = await createToken({
        sub: "user-integration-read",
        scope: "notes:read",
        client_id: "test-client",
      });

      const response = await fetch(`${baseUrl}/mcp/tools/read_notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ arguments: {} }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { content: Array<{ text: string }> };
      const notes = JSON.parse(data.content[0].text);
      expect(notes).toHaveProperty("notes");
      expect(notes).toHaveProperty("count");
    });
  });

  describe("Create Note Tool", () => {
    it("should create note with correct scope", async () => {
      const token = await createToken({
        sub: "user-integration-create",
        scope: "notes:write",
        client_id: "test-client",
      });

      const response = await fetch(`${baseUrl}/mcp/tools/create_note`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ arguments: { text: "Integration test note" } }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { content: Array<{ text: string }> };
      const result = JSON.parse(data.content[0].text);
      expect(result.success).toBe(true);
      expect(result.note.text).toBe("Integration test note");
    });
  });

  describe("Whoami Tool", () => {
    it("should return user info", async () => {
      const token = await createToken({
        sub: "user-whoami-test",
        scope: "any:scope",
        client_id: "whoami-client",
      });

      const response = await fetch(`${baseUrl}/mcp/tools/whoami`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ arguments: {} }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { content: Array<{ text: string }> };
      const result = JSON.parse(data.content[0].text);
      expect(result.userId).toBe("user-whoami-test");
      expect(result.scope).toBe("any:scope");
      expect(result.clientId).toBe("whoami-client");
    });
  });

  describe("Unknown Tool", () => {
    it("POST /mcp/tools/unknown should return 404", async () => {
      const response = await fetch(`${baseUrl}/mcp/tools/unknown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arguments: {} }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("tool_not_found");
    });
  });

  describe("CORS", () => {
    it("should return CORS headers", async () => {
      const response = await fetch(`${baseUrl}/`);

      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    });

    it("OPTIONS should return 204", async () => {
      const response = await fetch(`${baseUrl}/mcp/tools`, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(204);
    });
  });

  describe("Token Expiry", () => {
    it("should reject expired token", async () => {
      const token = await createToken(
        { sub: "user-expired", scope: "notes:read", client_id: "test" },
        { expiresIn: "-1h" }
      );

      const response = await fetch(`${baseUrl}/mcp/tools/read_notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ arguments: {} }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error_description).toBe("Token expired");
    });
  });

  describe("Full Workflow", () => {
    it("should support full notes workflow", async () => {
      const userId = `workflow-user-${Date.now()}`;
      const token = await createToken({
        sub: userId,
        scope: "notes:read notes:write",
        client_id: "test-client",
      });

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      // 1. Read notes (should be empty initially)
      let response = await fetch(`${baseUrl}/mcp/tools/read_notes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ arguments: {} }),
      });
      let data = await response.json() as { content: Array<{ text: string }> };
      let notes = JSON.parse(data.content[0].text);
      const initialCount = notes.count;

      // 2. Create a note
      response = await fetch(`${baseUrl}/mcp/tools/create_note`, {
        method: "POST",
        headers,
        body: JSON.stringify({ arguments: { text: "First note" } }),
      });
      expect(response.status).toBe(200);

      // 3. Create another note
      response = await fetch(`${baseUrl}/mcp/tools/create_note`, {
        method: "POST",
        headers,
        body: JSON.stringify({ arguments: { text: "Second note" } }),
      });
      expect(response.status).toBe(200);

      // 4. Read notes again
      response = await fetch(`${baseUrl}/mcp/tools/read_notes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ arguments: {} }),
      });
      data = await response.json() as { content: Array<{ text: string }> };
      notes = JSON.parse(data.content[0].text);

      expect(notes.count).toBe(initialCount + 2);
      expect(notes.notes.some((n: { text: string }) => n.text === "First note")).toBe(true);
      expect(notes.notes.some((n: { text: string }) => n.text === "Second note")).toBe(true);

      // 5. Verify whoami
      response = await fetch(`${baseUrl}/mcp/tools/whoami`, {
        method: "POST",
        headers,
        body: JSON.stringify({ arguments: {} }),
      });
      data = await response.json() as { content: Array<{ text: string }> };
      const whoami = JSON.parse(data.content[0].text);
      expect(whoami.userId).toBe(userId);
    });
  });

  describe("Remote Access", () => {
    it("server should be accessible on the bound address", async () => {
      // This test verifies the server is actually accepting connections
      const response = await fetch(baseUrl);
      expect(response.ok).toBe(true);
    });
  });
});
