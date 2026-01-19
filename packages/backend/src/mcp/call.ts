// ABOUTME: Tool execution logic
// ABOUTME: Implements the actual behavior of each MCP tool

import { AuthenticatedRequest, hasScope } from "../middleware/jwt-auth.js";
import { Response } from "express";
import { getTool } from "./tools.js";

// In-memory mock storage for notes (POC only)
const notesStore = new Map<string, Array<{ id: string; text: string; createdAt: string }>>();

function getUserNotes(userId: string) {
  if (!notesStore.has(userId)) {
    notesStore.set(userId, []);
  }
  return notesStore.get(userId)!;
}

// Tool implementations
type ToolHandler = (
  req: AuthenticatedRequest,
  args: Record<string, unknown>
) => { content: Array<{ type: "text"; text: string }> };

const toolHandlers: Record<string, ToolHandler> = {
  echo: (_req, args) => {
    const message = args.message as string;
    return {
      content: [{ type: "text", text: message }],
    };
  },

  read_notes: (req, _args) => {
    const userId = req.user!.sub;
    const notes = getUserNotes(userId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ notes, count: notes.length }, null, 2),
        },
      ],
    };
  },

  create_note: (req, args) => {
    const userId = req.user!.sub;
    const text = args.text as string;
    const notes = getUserNotes(userId);

    const newNote = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
    };
    notes.push(newNote);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, note: newNote }, null, 2),
        },
      ],
    };
  },

  whoami: (req, _args) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              userId: req.user!.sub,
              scope: req.user!.scope,
              clientId: req.user!.clientId,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// Main handler for POST /mcp/tools/:name
export function handleToolCall(req: AuthenticatedRequest, res: Response): void {
  const toolName = req.params.name as string;
  const tool = getTool(toolName);

  // Check tool exists
  if (!tool) {
    res.status(404).json({
      error: "tool_not_found",
      error_description: `Unknown tool: ${toolName}`,
    });
    return;
  }

  // Check auth requirement
  if (tool.requiresAuth && !req.user) {
    res.status(401).json({
      error: "unauthorized",
      error_description: `Tool '${toolName}' requires authentication`,
    });
    return;
  }

  // Check scope requirement
  if (tool.requiredScope && !hasScope(req, tool.requiredScope)) {
    res.status(403).json({
      error: "insufficient_scope",
      error_description: `Tool '${toolName}' requires scope: ${tool.requiredScope}`,
    });
    return;
  }

  // Extract arguments
  const args = req.body.arguments || {};

  // Validate required arguments
  const required = tool.inputSchema.required || [];
  for (const param of required) {
    if (args[param] === undefined) {
      res.status(400).json({
        error: "invalid_request",
        error_description: `Missing required argument: ${param}`,
      });
      return;
    }
  }

  // Execute tool
  const handler = toolHandlers[toolName];
  if (!handler) {
    res.status(500).json({
      error: "internal_error",
      error_description: `Tool handler not implemented: ${toolName}`,
    });
    return;
  }

  try {
    const result = handler(req, args);
    res.json(result);
  } catch (err) {
    console.error(`Tool execution error (${toolName}):`, err);
    res.status(500).json({
      error: "tool_execution_error",
      error_description: `Failed to execute tool: ${toolName}`,
    });
  }
}
