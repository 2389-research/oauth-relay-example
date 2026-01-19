// ABOUTME: Relay configuration
// ABOUTME: Reads from environment with sensible defaults for local dev

import os from "os";
import path from "path";

function getDefaultTokenPath(): string {
  const platform = os.platform();
  const homeDir = os.homedir();

  switch (platform) {
    case "darwin":
      return path.join(homeDir, "Library", "Application Support", "oauth-relay-example", "tokens.json");
    case "win32":
      return path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "oauth-relay-example", "tokens.json");
    default:
      // Linux and others
      return path.join(homeDir, ".config", "oauth-relay-example", "tokens.json");
  }
}

export const config = {
  // demo-site URL for OAuth
  authServerUrl: process.env.RELAY_AUTH_SERVER_URL || "http://localhost:4100",

  // Our backend URL (note: using platform-2389 project in emulator)
  backendUrl: process.env.RELAY_BACKEND_URL || "http://127.0.0.1:5002/platform-2389/us-central1/api",

  // OAuth client ID
  clientId: process.env.RELAY_CLIENT_ID || "oauth-relay-example",

  // Requested scopes
  scopes: (process.env.RELAY_SCOPES || "notes:read notes:write").split(" "),

  // Auth flow timeout (default 2 minutes)
  authTimeout: parseInt(process.env.RELAY_AUTH_TIMEOUT || "120000", 10),

  // Token storage path
  tokenPath: process.env.RELAY_TOKEN_PATH || getDefaultTokenPath(),

  // Callback server host to bind to (use 0.0.0.0 for remote access)
  callbackHost: process.env.RELAY_CALLBACK_HOST || "127.0.0.1",

  // Callback URL hostname (what the browser redirects to - may differ from bind host)
  // Use your Tailscale IP or hostname for remote testing
  callbackUrlHost: process.env.RELAY_CALLBACK_URL_HOST || "localhost",

  // Log level
  logLevel: process.env.RELAY_LOG_LEVEL || "info",
};

export type Config = typeof config;
