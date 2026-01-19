// ABOUTME: HTTP client for communicating with the backend
// ABOUTME: Handles listing tools and calling tools with authentication

import { config } from "../config.js";

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class HttpClient {
  private backendUrl: string;

  constructor() {
    this.backendUrl = config.backendUrl;
  }

  /**
   * List available tools from the backend.
   * Does not require authentication.
   */
  async listTools(): Promise<Tool[]> {
    const response = await fetch(`${this.backendUrl}/mcp/tools`);

    if (!response.ok) {
      throw new Error(`Failed to list tools: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { tools: Tool[] };
    return data.tools;
  }

  /**
   * Call a tool on the backend.
   * Requires authentication for most tools.
   */
  async callTool(name: string, args: unknown, token?: string): Promise<ToolResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.backendUrl}/mcp/tools/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ arguments: args }),
    });

    if (response.status === 401) {
      const error = await response.json().catch(() => ({ error_description: "Unauthorized" }));
      throw new UnauthorizedError((error as { error_description?: string }).error_description || "Unauthorized");
    }

    if (response.status === 403) {
      const error = await response.json().catch(() => ({ error_description: "Forbidden" }));
      throw new Error(`Insufficient scope: ${(error as { error_description?: string }).error_description || "Forbidden"}`);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error_description: response.statusText }));
      throw new Error(`Tool call failed: ${(error as { error_description?: string }).error_description || response.statusText}`);
    }

    return (await response.json()) as ToolResult;
  }
}
