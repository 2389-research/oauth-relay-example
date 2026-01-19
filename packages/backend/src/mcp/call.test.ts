// ABOUTME: Unit tests for MCP tool call handler
// ABOUTME: Tests tool execution, auth requirements, and error handling

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/jwt-auth.js";
import { handleToolCall } from "./call.js";

describe("Tool Call Handler", () => {
  function createMockRequest(
    toolName: string,
    args: Record<string, unknown> = {},
    user?: { sub: string; scope: string; clientId: string }
  ): AuthenticatedRequest {
    return {
      params: { name: toolName },
      body: { arguments: args },
      user,
    } as unknown as AuthenticatedRequest;
  }

  function createMockResponse(): Response & {
    statusCode?: number;
    jsonData?: unknown;
  } {
    const res: Partial<Response> & { statusCode?: number; jsonData?: unknown } = {
      status: vi.fn(function (code: number) {
        res.statusCode = code;
        return res as Response;
      }),
      json: vi.fn(function (data: unknown) {
        res.jsonData = data;
        return res as Response;
      }),
    };
    return res as Response & { statusCode?: number; jsonData?: unknown };
  }

  describe("echo tool", () => {
    it("should echo message back without auth", () => {
      const req = createMockRequest("echo", { message: "Hello, World!" });
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.json).toHaveBeenCalledWith({
        content: [{ type: "text", text: "Hello, World!" }],
      });
    });

    it("should require message argument", () => {
      const req = createMockRequest("echo", {});
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        error: "invalid_request",
        error_description: "Missing required argument: message",
      });
    });

    it("should work with auth provided", () => {
      const req = createMockRequest(
        "echo",
        { message: "Authenticated echo" },
        { sub: "user-123", scope: "notes:read", clientId: "test" }
      );
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.json).toHaveBeenCalledWith({
        content: [{ type: "text", text: "Authenticated echo" }],
      });
    });
  });

  describe("read_notes tool", () => {
    it("should require authentication", () => {
      const req = createMockRequest("read_notes", {});
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({
        error: "unauthorized",
        error_description: "Tool 'read_notes' requires authentication",
      });
    });

    it("should require notes:read scope", () => {
      const req = createMockRequest("read_notes", {}, {
        sub: "user-123",
        scope: "notes:write", // Wrong scope
        clientId: "test",
      });
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toEqual({
        error: "insufficient_scope",
        error_description: "Tool 'read_notes' requires scope: notes:read",
      });
    });

    it("should return notes for authenticated user with correct scope", () => {
      const req = createMockRequest("read_notes", {}, {
        sub: "user-123",
        scope: "notes:read",
        clientId: "test",
      });
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.jsonData as { content: Array<{ type: string; text: string }> };
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe("text");

      const notes = JSON.parse(response.content[0].text);
      expect(notes).toHaveProperty("notes");
      expect(notes).toHaveProperty("count");
      expect(Array.isArray(notes.notes)).toBe(true);
    });
  });

  describe("create_note tool", () => {
    it("should require authentication", () => {
      const req = createMockRequest("create_note", { text: "New note" });
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.statusCode).toBe(401);
    });

    it("should require notes:write scope", () => {
      const req = createMockRequest("create_note", { text: "New note" }, {
        sub: "user-123",
        scope: "notes:read", // Wrong scope
        clientId: "test",
      });
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toEqual({
        error: "insufficient_scope",
        error_description: "Tool 'create_note' requires scope: notes:write",
      });
    });

    it("should require text argument", () => {
      const req = createMockRequest("create_note", {}, {
        sub: "user-123",
        scope: "notes:write",
        clientId: "test",
      });
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        error: "invalid_request",
        error_description: "Missing required argument: text",
      });
    });

    it("should create note for authenticated user with correct scope", () => {
      const req = createMockRequest("create_note", { text: "My new note" }, {
        sub: "user-456",
        scope: "notes:write",
        clientId: "test",
      });
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.jsonData as { content: Array<{ type: string; text: string }> };
      const result = JSON.parse(response.content[0].text);

      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
      expect(result.note.text).toBe("My new note");
      expect(result.note.id).toBeDefined();
      expect(result.note.createdAt).toBeDefined();
    });
  });

  describe("whoami tool", () => {
    it("should require authentication", () => {
      const req = createMockRequest("whoami", {});
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.statusCode).toBe(401);
    });

    it("should return user info for any authenticated user", () => {
      const req = createMockRequest("whoami", {}, {
        sub: "user-789",
        scope: "some:scope",
        clientId: "my-client",
      });
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.jsonData as { content: Array<{ type: string; text: string }> };
      const result = JSON.parse(response.content[0].text);

      expect(result.userId).toBe("user-789");
      expect(result.scope).toBe("some:scope");
      expect(result.clientId).toBe("my-client");
    });
  });

  describe("unknown tool", () => {
    it("should return 404 for unknown tool", () => {
      const req = createMockRequest("unknown_tool", {});
      const res = createMockResponse();

      handleToolCall(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toEqual({
        error: "tool_not_found",
        error_description: "Unknown tool: unknown_tool",
      });
    });
  });

  describe("notes persistence", () => {
    it("should persist notes across calls for same user", () => {
      const user = { sub: "persistent-user", scope: "notes:read notes:write", clientId: "test" };

      // Create a note
      const createReq = createMockRequest("create_note", { text: "Persistent note" }, user);
      const createRes = createMockResponse();
      handleToolCall(createReq, createRes);

      // Read notes
      const readReq = createMockRequest("read_notes", {}, user);
      const readRes = createMockResponse();
      handleToolCall(readReq, readRes);

      const response = readRes.jsonData as { content: Array<{ type: string; text: string }> };
      const result = JSON.parse(response.content[0].text);

      expect(result.count).toBeGreaterThan(0);
      expect(result.notes.some((n: { text: string }) => n.text === "Persistent note")).toBe(true);
    });

    it("should keep notes separate between users", () => {
      const user1 = { sub: "user-1", scope: "notes:read notes:write", clientId: "test" };
      const user2 = { sub: "user-2", scope: "notes:read notes:write", clientId: "test" };

      // User 1 creates a note
      const create1 = createMockRequest("create_note", { text: "User 1 note" }, user1);
      handleToolCall(create1, createMockResponse());

      // User 2 creates a note
      const create2 = createMockRequest("create_note", { text: "User 2 note" }, user2);
      handleToolCall(create2, createMockResponse());

      // Check user 1's notes
      const read1 = createMockRequest("read_notes", {}, user1);
      const res1 = createMockResponse();
      handleToolCall(read1, res1);
      const notes1 = JSON.parse((res1.jsonData as { content: Array<{ text: string }> }).content[0].text);

      // Check user 2's notes
      const read2 = createMockRequest("read_notes", {}, user2);
      const res2 = createMockResponse();
      handleToolCall(read2, res2);
      const notes2 = JSON.parse((res2.jsonData as { content: Array<{ text: string }> }).content[0].text);

      // Verify separation
      expect(notes1.notes.every((n: { text: string }) => n.text !== "User 2 note")).toBe(true);
      expect(notes2.notes.every((n: { text: string }) => n.text !== "User 1 note")).toBe(true);
    });
  });
});
