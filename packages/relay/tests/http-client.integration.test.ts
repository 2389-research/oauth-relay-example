// ABOUTME: Integration tests for HTTP client
// ABOUTME: Tests communication with backend using mock server

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "http";
import type { AddressInfo } from "net";

// Mock config before importing HttpClient
vi.mock("../src/config.js", () => ({
  config: {
    backendUrl: "", // Will be set in beforeAll
  },
}));

describe("HttpClient Integration", () => {
  let server: http.Server;
  let serverUrl: string;

  // Mock backend responses
  const mockTools = [
    { name: "test_tool", description: "Test tool", inputSchema: { type: "object", properties: {} } },
  ];

  beforeAll(async () => {
    // Create mock backend server
    server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");

      if (req.url === "/mcp/tools" && req.method === "GET") {
        res.writeHead(200);
        res.end(JSON.stringify({ tools: mockTools }));
        return;
      }

      if (req.url === "/mcp/tools/echo" && req.method === "POST") {
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
        if (!auth || !auth.startsWith("Bearer ")) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: "unauthorized", error_description: "Missing token" }));
          return;
        }

        if (auth === "Bearer valid-token") {
          res.writeHead(200);
          res.end(JSON.stringify({ content: [{ type: "text", text: "protected data" }] }));
        } else {
          res.writeHead(401);
          res.end(JSON.stringify({ error: "unauthorized", error_description: "Invalid token" }));
        }
        return;
      }

      if (req.url === "/mcp/tools/forbidden" && req.method === "POST") {
        res.writeHead(403);
        res.end(JSON.stringify({ error: "insufficient_scope", error_description: "Needs admin scope" }));
        return;
      }

      if (req.url === "/mcp/tools/not_found" && req.method === "POST") {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "tool_not_found" }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "not_found" }));
    });

    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${address.port}`;

    // Update the mocked config
    const { config } = await import("../src/config.js");
    (config as { backendUrl: string }).backendUrl = serverUrl;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe("listTools", () => {
    it("should fetch tools from backend", async () => {
      const { HttpClient } = await import("../src/http/client.js");
      const client = new HttpClient();
      const tools = await client.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("test_tool");
    });
  });

  describe("callTool", () => {
    it("should call tool without auth", async () => {
      const { HttpClient } = await import("../src/http/client.js");
      const client = new HttpClient();
      const result = await client.callTool("echo", { message: "hello" });

      expect(result.content[0].text).toBe("hello");
    });

    it("should call tool with auth token", async () => {
      const { HttpClient } = await import("../src/http/client.js");
      const client = new HttpClient();
      const result = await client.callTool("protected", {}, "valid-token");

      expect(result.content[0].text).toBe("protected data");
    });

    it("should throw UnauthorizedError on 401", async () => {
      const { HttpClient, UnauthorizedError } = await import("../src/http/client.js");
      const client = new HttpClient();

      await expect(client.callTool("protected", {}, "invalid-token")).rejects.toThrow(UnauthorizedError);
    });

    it("should throw on 403", async () => {
      const { HttpClient } = await import("../src/http/client.js");
      const client = new HttpClient();

      await expect(client.callTool("forbidden", {}, "valid-token")).rejects.toThrow("Insufficient scope");
    });

    it("should throw on 404", async () => {
      const { HttpClient } = await import("../src/http/client.js");
      const client = new HttpClient();

      await expect(client.callTool("not_found", {})).rejects.toThrow();
    });
  });
});
