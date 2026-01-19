// ABOUTME: Express app configuration
// ABOUTME: Shared between Firebase Functions and standalone server

import express from "express";
import { jwtAuth } from "./middleware/jwt-auth.js";
import { getToolSchemas } from "./mcp/tools.js";
import { handleToolCall } from "./mcp/call.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  // CORS headers for cross-origin requests
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });

  // Handle preflight
  app.options("/{*path}", (_req, res) => {
    res.sendStatus(204);
  });

  // Health check
  app.get("/", (_req, res) => {
    res.json({ status: "ok", service: "oauth-relay-example-backend" });
  });

  // GET /mcp/tools - List available tools (no auth required)
  app.get("/mcp/tools", (_req, res) => {
    res.json({ tools: getToolSchemas() });
  });

  // POST /mcp/tools/:name - Call a specific tool
  // Auth is optional at middleware level, tool handler decides if required
  app.post("/mcp/tools/:name", jwtAuth({ required: false }), handleToolCall);

  return app;
}
