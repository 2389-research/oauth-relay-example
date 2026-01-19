// ABOUTME: Local HTTP server for OAuth callback
// ABOUTME: Listens on a random port for the authorization code redirect

import http from "http";
import { URL } from "url";
import escapeHtml from "escape-html";

export interface CallbackResult {
  code: string;
  state: string;
}

export interface CallbackError {
  error: string;
  errorDescription?: string;
}

export type CallbackResponse = CallbackResult | CallbackError;

const SUCCESS_HTML = `<!DOCTYPE html
<html>
<head>
  <title>Authorization Successful</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #22c55e; margin-bottom: 1rem; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorization Successful</h1>
    <p>You can close this window and return to your terminal.</p>
  </div>
</body>
</html>`;

const ERROR_HTML = (error: string, description?: string) => `<!DOCTYPE html>
<html>
<head>
  <title>Authorization Failed</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #ef4444; margin-bottom: 1rem; }
    p { color: #666; }
    .error { font-family: monospace; background: #fee2e2; padding: 0.5rem 1rem; border-radius: 4px; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorization Failed</h1>
    <p>Something went wrong during authorization.</p>
    <div class="error">${escapeHtml(error)}${description ? `: ${escapeHtml(description)}` : ""}</div>
  </div>
</body>
</html>`;

export interface CallbackServerOptions {
  host?: string; // Default: "127.0.0.1", use "0.0.0.0" for remote access
  port?: number; // Default: 0 (random available port)
}

export class CallbackServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private host: string = "127.0.0.1";

  /**
   * Start the callback server on a random available port.
   * Returns the port and a promise that resolves when a callback is received.
   */
  async start(
    expectedState: string,
    timeoutMs: number,
    options: CallbackServerOptions = {}
  ): Promise<{
    port: number;
    host: string;
    waitForCallback: () => Promise<CallbackResult>;
    shutdown: () => void;
  }> {
    this.host = options.host || process.env.RELAY_CALLBACK_HOST || "127.0.0.1";
    const listenPort = options.port || 0;

    return new Promise((resolveStart, rejectStart) => {
      const server = http.createServer();
      this.server = server;

      let callbackPromiseResolve: (result: CallbackResult) => void;
      let callbackPromiseReject: (error: Error) => void;

      const callbackPromise = new Promise<CallbackResult>((resolve, reject) => {
        callbackPromiseResolve = resolve;
        callbackPromiseReject = reject;
      });

      // Timeout for the callback
      const timeout = setTimeout(() => {
        callbackPromiseReject(new Error("Authorization timed out"));
        this.shutdown();
      }, timeoutMs);

      server.on("request", (req, res) => {
        if (!req.url) {
          res.writeHead(400);
          res.end("Bad request");
          return;
        }

        const url = new URL(req.url, `http://localhost:${this.port}`);

        // Only handle /callback path
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        // Handle error response from auth server
        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(ERROR_HTML(error, errorDescription || undefined));
          clearTimeout(timeout);
          callbackPromiseReject(new Error(`Authorization denied: ${error}${errorDescription ? ` - ${errorDescription}` : ""}`));
          this.shutdown();
          return;
        }

        // Validate required params
        if (!code || !state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(ERROR_HTML("invalid_request", "Missing code or state"));
          return;
        }

        // Validate state matches
        if (state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(ERROR_HTML("invalid_state", "State mismatch - possible CSRF attack"));
          return;
        }

        // Success!
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(SUCCESS_HTML);

        clearTimeout(timeout);
        callbackPromiseResolve({ code, state });
        this.shutdown();
      });

      server.on("error", (err) => {
        rejectStart(err);
      });

      // Listen on specified host and port
      server.listen(listenPort, this.host, () => {
        const address = server.address();
        if (typeof address === "object" && address !== null) {
          this.port = address.port;
          resolveStart({
            port: this.port,
            host: this.host,
            waitForCallback: () => callbackPromise,
            shutdown: () => this.shutdown(),
          });
        } else {
          rejectStart(new Error("Failed to get server address"));
        }
      });
    });
  }

  /**
   * Shut down the callback server.
   */
  shutdown(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
