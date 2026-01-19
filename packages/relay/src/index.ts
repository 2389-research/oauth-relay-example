#!/usr/bin/env node
// ABOUTME: MCP stdio server entry point
// ABOUTME: Creates the MCP server and wires up the orchestrator

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Orchestrator } from "./orchestrator.js";

async function main() {
  console.error("[relay] Starting OAuth Relay MCP Server...");

  // Create orchestrator
  const orchestrator = new Orchestrator();
  await orchestrator.init();

  // Create MCP server
  const server = new Server(
    {
      name: "oauth-relay-example",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("[relay] Received list_tools request");
    const tools = await orchestrator.listTools();
    return { tools };
  });

  // Handle call tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[relay] Received call_tool request: ${name}`);

    try {
      const result = await orchestrator.callTool(name, args || {});
      return {
        content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[relay] Tool call failed: ${errorMessage}`);
      return {
        content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Handle shutdown signals
  process.on("SIGINT", async () => {
    console.error("[relay] Received SIGINT, shutting down...");
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.error("[relay] Received SIGTERM, shutting down...");
    await server.close();
    process.exit(0);
  });

  // Connect and start serving
  console.error("[relay] Connecting to stdio transport...");
  await server.connect(transport);
  console.error("[relay] Server ready and listening for requests");
}

main().catch((err) => {
  console.error("[relay] Fatal error:", err);
  process.exit(1);
});
