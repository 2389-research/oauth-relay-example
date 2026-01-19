// ABOUTME: Standalone Express server for testing
// ABOUTME: Binds to 0.0.0.0 for remote access via Tailscale

import { createApp } from "./app.js";

const app = createApp();
const port = parseInt(process.env.PORT || "5002", 10);
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`[backend] Standalone server running on http://${host}:${port}`);
  console.log(`[backend] Health check: http://${host}:${port}/`);
  console.log(`[backend] List tools: http://${host}:${port}/mcp/tools`);
});
