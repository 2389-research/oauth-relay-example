// ABOUTME: Unit tests for MCP tool definitions
// ABOUTME: Tests tool schemas and utility functions

import { describe, it, expect } from "vitest";
import { tools, getTool, getToolSchemas } from "./tools.js";

describe("MCP Tools", () => {
  describe("tools array", () => {
    it("should have 4 tools defined", () => {
      expect(tools).toHaveLength(4);
    });

    it("should have echo tool", () => {
      const echo = tools.find((t) => t.name === "echo");
      expect(echo).toBeDefined();
      expect(echo?.description).toContain("Echo");
      expect(echo?.requiresAuth).toBe(false);
    });

    it("should have read_notes tool", () => {
      const readNotes = tools.find((t) => t.name === "read_notes");
      expect(readNotes).toBeDefined();
      expect(readNotes?.requiresAuth).toBe(true);
      expect(readNotes?.requiredScope).toBe("notes:read");
    });

    it("should have create_note tool", () => {
      const createNote = tools.find((t) => t.name === "create_note");
      expect(createNote).toBeDefined();
      expect(createNote?.requiresAuth).toBe(true);
      expect(createNote?.requiredScope).toBe("notes:write");
    });

    it("should have whoami tool", () => {
      const whoami = tools.find((t) => t.name === "whoami");
      expect(whoami).toBeDefined();
      expect(whoami?.requiresAuth).toBe(true);
      expect(whoami?.requiredScope).toBeUndefined();
    });

    it("should have valid input schemas for all tools", () => {
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });
  });

  describe("getTool", () => {
    it("should return tool by name", () => {
      const echo = getTool("echo");
      expect(echo).toBeDefined();
      expect(echo?.name).toBe("echo");
    });

    it("should return undefined for unknown tool", () => {
      const unknown = getTool("unknown_tool");
      expect(unknown).toBeUndefined();
    });

    it("should find all defined tools", () => {
      expect(getTool("echo")).toBeDefined();
      expect(getTool("read_notes")).toBeDefined();
      expect(getTool("create_note")).toBeDefined();
      expect(getTool("whoami")).toBeDefined();
    });
  });

  describe("getToolSchemas", () => {
    it("should return schemas without auth info", () => {
      const schemas = getToolSchemas();

      expect(schemas).toHaveLength(4);

      for (const schema of schemas) {
        expect(schema.name).toBeDefined();
        expect(schema.description).toBeDefined();
        expect(schema.inputSchema).toBeDefined();
        // Should NOT include requiresAuth or requiredScope
        expect((schema as Record<string, unknown>).requiresAuth).toBeUndefined();
        expect((schema as Record<string, unknown>).requiredScope).toBeUndefined();
      }
    });

    it("should have correct schema for echo", () => {
      const schemas = getToolSchemas();
      const echo = schemas.find((s) => s.name === "echo");

      expect(echo).toBeDefined();
      expect(echo?.inputSchema.properties).toHaveProperty("message");
      expect(echo?.inputSchema.required).toContain("message");
    });

    it("should have correct schema for create_note", () => {
      const schemas = getToolSchemas();
      const createNote = schemas.find((s) => s.name === "create_note");

      expect(createNote).toBeDefined();
      expect(createNote?.inputSchema.properties).toHaveProperty("text");
      expect(createNote?.inputSchema.required).toContain("text");
    });

    it("should have empty required array for read_notes", () => {
      const schemas = getToolSchemas();
      const readNotes = schemas.find((s) => s.name === "read_notes");

      expect(readNotes).toBeDefined();
      expect(readNotes?.inputSchema.required).toBeUndefined();
    });
  });

  describe("tool input schemas", () => {
    it("echo should require message string", () => {
      const echo = getTool("echo");
      expect(echo?.inputSchema.properties.message).toEqual({
        type: "string",
        description: expect.any(String),
      });
      expect(echo?.inputSchema.required).toContain("message");
    });

    it("read_notes should have empty properties", () => {
      const readNotes = getTool("read_notes");
      expect(Object.keys(readNotes?.inputSchema.properties || {})).toHaveLength(0);
    });

    it("create_note should require text string", () => {
      const createNote = getTool("create_note");
      expect(createNote?.inputSchema.properties.text).toEqual({
        type: "string",
        description: expect.any(String),
      });
      expect(createNote?.inputSchema.required).toContain("text");
    });

    it("whoami should have empty properties", () => {
      const whoami = getTool("whoami");
      expect(Object.keys(whoami?.inputSchema.properties || {})).toHaveLength(0);
    });
  });
});
