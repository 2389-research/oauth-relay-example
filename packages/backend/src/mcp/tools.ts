// ABOUTME: MCP tool definitions and schemas
// ABOUTME: Defines the tools available through the backend

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  requiresAuth: boolean;
  requiredScope?: string;
}

export const tools: Tool[] = [
  {
    name: "echo",
    description: "Echo a message back - useful for testing connectivity",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to echo" },
      },
      required: ["message"],
    },
    requiresAuth: false,
  },
  {
    name: "read_notes",
    description: "Read notes for the authenticated user",
    inputSchema: {
      type: "object",
      properties: {},
    },
    requiresAuth: true,
    requiredScope: "notes:read",
  },
  {
    name: "create_note",
    description: "Create a new note for the authenticated user",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The note text content" },
      },
      required: ["text"],
    },
    requiresAuth: true,
    requiredScope: "notes:write",
  },
  {
    name: "whoami",
    description: "Get information about the currently authenticated user",
    inputSchema: {
      type: "object",
      properties: {},
    },
    requiresAuth: true,
  },
];

// Get tool by name
export function getTool(name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}

// Get public tool schemas (for list endpoint)
export function getToolSchemas() {
  return tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}
