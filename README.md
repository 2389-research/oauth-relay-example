# OAuth Relay Pattern for MCP Servers

A reference implementation showing how to add OAuth authentication to stdio-based MCP servers.

**The Problem:** MCP servers using stdio transport can't perform OAuth flows directly - they have no way to open browsers or receive HTTP callbacks.

**The Solution:** A thin local relay that handles OAuth, stores tokens, and forwards authenticated requests to your backend.

## Architecture

```
┌─────────────┐         ┌─────────────────────────────────┐         ┌─────────────┐
│             │  stdio  │           RELAY                 │  HTTP   │             │
│ Claude Code │◄───────►│  • Opens browser for OAuth      │────────►│   BACKEND   │
│             │         │  • Catches callback on localhost│  +JWT   │  (your API) │
└─────────────┘         │  • Stores tokens locally        │         └─────────────┘
                        │  • Adds JWT to outgoing requests│
                        └─────────────────────────────────┘
                                       │
                                       │ browser
                                       ▼
                        ┌─────────────────────────────────┐
                        │          AUTH SERVER            │
                        │     (OAuth 2.1 + PKCE)          │
                        └─────────────────────────────────┘
```

**Key insight:** The relay runs locally on the user's machine. It can open browsers and bind to localhost ports. Your backend can run anywhere - serverless, containers, VMs.

## How It Works

### OAuth Flow (First Request)

```
1. User calls an authenticated tool
   │
2. Relay checks for stored token → None found
   │
3. Relay fetches /.well-known/oauth-authorization-server
   │
4. Relay generates PKCE code_verifier + code_challenge
   │
5. Relay starts temporary HTTP server on localhost:random-port
   │
6. Relay opens browser → Auth Server /authorize endpoint
   │
7. User logs in, consents
   │
8. Auth Server redirects to localhost:port/callback?code=xxx
   │
9. Relay exchanges code for tokens (with PKCE verifier)
   │
10. Relay stores tokens to disk
    │
11. Relay forwards original request with Bearer token
    │
12. Backend validates JWT, executes tool, returns result
```

### Subsequent Requests

```
1. User calls an authenticated tool
   │
2. Relay checks for stored token → Found, not expired
   │
3. Relay forwards request with Bearer token
   │
4. Backend validates JWT, executes tool, returns result
```

### Token Refresh

```
1. Relay detects token is expired (or gets 401)
   │
2. Relay calls /token with grant_type=refresh_token
   │
3. Relay stores new tokens
   │
4. Relay retries original request
```

## Connection Characteristics

| Connection | Type | Duration | Notes |
|------------|------|----------|-------|
| Claude Code ↔ Relay | stdio | Session | Only persistent connection |
| Relay → Backend | HTTP | Per-request | Stateless, scalable |
| Relay → Auth Server | HTTP | Per-request | Only during auth/refresh |
| Callback Server | HTTP | Seconds | Temporary, during OAuth only |

**Your backend is completely stateless.** Scale horizontally, run serverless, put behind a load balancer - each request is independent with the JWT carrying all auth context.

## Implementing for Your MCP Server

### What You Need

1. **Relay** (runs locally with Claude Code)
   - OAuth flow (PKCE, browser, callback)
   - Token storage
   - HTTP client to forward requests

2. **Backend** (runs anywhere)
   - JWT validation middleware
   - Your actual tool implementations
   - Tool schema definitions

3. **Auth Server** (yours or third-party)
   - OAuth 2.1 + PKCE support
   - `/.well-known/oauth-authorization-server` metadata
   - Issues JWTs with user identity

### Minimal Relay Implementation

```typescript
// 1. MCP Server setup (index.ts)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({ name: "my-relay", version: "1.0.0" }, { capabilities: { tools: {} } });
const orchestrator = new Orchestrator();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: await orchestrator.listTools() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return await orchestrator.callTool(request.params.name, request.params.arguments);
});

await orchestrator.init();
const transport = new StdioServerTransport();
await server.connect(transport);
```

```typescript
// 2. Orchestrator - coordinates auth + forwarding (orchestrator.ts)
class Orchestrator {
  private tokenStore = new TokenStore();
  private authManager = new AuthManager();
  private httpClient = new HttpClient();

  async callTool(name: string, args: Record<string, unknown>) {
    let tokens = await this.tokenStore.load();

    // Get token if needed
    if (!tokens || isExpired(tokens)) {
      tokens = await this.authManager.authenticate();
      await this.tokenStore.save(tokens);
    }

    // Forward to backend
    try {
      return await this.httpClient.callTool(name, args, tokens.accessToken);
    } catch (err) {
      if (err instanceof UnauthorizedError && tokens.refreshToken) {
        // Try refresh
        tokens = await this.authManager.refresh(tokens.refreshToken);
        await this.tokenStore.save(tokens);
        return await this.httpClient.callTool(name, args, tokens.accessToken);
      }
      throw err;
    }
  }
}
```

```typescript
// 3. Auth Manager - handles OAuth flow (auth/manager.ts)
class AuthManager {
  async authenticate(): Promise<TokenSet> {
    // 1. Fetch OAuth metadata
    const metadata = await this.fetchMetadata();

    // 2. Generate PKCE
    const { codeVerifier, codeChallenge } = generatePkce();

    // 3. Start callback server
    const { port, waitForCallback } = await startCallbackServer();

    // 4. Build authorization URL
    const authUrl = new URL(metadata.authorization_endpoint);
    authUrl.searchParams.set("client_id", this.clientId);
    authUrl.searchParams.set("redirect_uri", `http://localhost:${port}/callback`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("scope", this.scopes.join(" "));

    // 5. Open browser
    await openBrowser(authUrl.toString());

    // 6. Wait for callback
    const { code } = await waitForCallback();

    // 7. Exchange code for tokens
    return await this.exchangeCode(code, codeVerifier, port);
  }
}
```

```typescript
// 4. PKCE Implementation (auth/pkce.ts)
import crypto from "crypto";

export function generatePkce() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}
```

### Minimal Backend Implementation

```typescript
// 1. JWT Validation Middleware (middleware/jwt-auth.ts)
import * as jose from "jose";

export function jwtAuth(options: { required: boolean }) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      if (options.required) {
        return res.status(401).json({ error: "unauthorized" });
      }
      return next();
    }

    try {
      const token = authHeader.slice(7);
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret, {
        issuer: process.env.AUTH_SERVER_URL,
      });

      req.user = { id: payload.sub, scope: payload.scope };
      next();
    } catch (err) {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}
```

```typescript
// 2. Tool Routes (routes.ts)
app.get("/mcp/tools", (req, res) => {
  res.json({ tools: getToolSchemas() });
});

app.post("/mcp/tools/:name", jwtAuth({ required: false }), async (req, res) => {
  const tool = getTool(req.params.name);

  if (tool.requiresAuth && !req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const result = await tool.handler(req.body.arguments, req.user);
  res.json(result);
});
```

## Token Storage

Tokens are stored in OS-specific secure locations:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/{app-name}/tokens.json` |
| Windows | `%APPDATA%/{app-name}/tokens.json` |
| Linux | `~/.config/{app-name}/tokens.json` |

Files are created with `0600` permissions (owner read/write only).

```typescript
// Token storage implementation
import { homedir, platform } from "os";
import { join } from "path";
import { mkdir, writeFile, readFile, chmod } from "fs/promises";

function getTokenPath(appName: string): string {
  switch (platform()) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", appName, "tokens.json");
    case "win32":
      return join(process.env.APPDATA || homedir(), appName, "tokens.json");
    default:
      return join(homedir(), ".config", appName, "tokens.json");
  }
}

async function saveTokens(tokens: TokenSet): Promise<void> {
  const path = getTokenPath("my-app");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(tokens), { mode: 0o600 });
}
```

## Security Considerations

### PKCE is Required

Always use PKCE (Proof Key for Code Exchange). It prevents authorization code interception attacks, which is especially important for public clients (no client secret).

```typescript
// PKCE flow summary:
// 1. Generate random code_verifier
// 2. Hash it to create code_challenge
// 3. Send code_challenge to /authorize
// 4. Send code_verifier to /token
// 5. Server verifies hash(code_verifier) == code_challenge
```

### Token Storage

- Store tokens with restricted file permissions
- Consider encrypting at rest for sensitive environments
- Clear tokens on logout/revocation

### JWT Validation

Always validate:
- Signature (using shared secret or public key)
- Issuer (`iss` claim)
- Expiration (`exp` claim)
- Audience (`aud` claim) if applicable

### Callback Server

- Bind to `127.0.0.1` by default (not `0.0.0.0`)
- Use random ports to avoid conflicts
- Shut down immediately after receiving callback
- Validate the `state` parameter to prevent CSRF

## Production Deployment

### Auth Server + Backend Combined

In production, your auth server and backend are typically the same service:

```typescript
// Single Express app handling both
app.get("/.well-known/oauth-authorization-server", ...);
app.get("/authorize", ...);
app.post("/token", ...);
app.get("/mcp/tools", ...);
app.post("/mcp/tools/:name", ...);
```

Configure the relay to point both URLs to the same host:

```json
{
  "env": {
    "RELAY_AUTH_SERVER_URL": "https://api.yourservice.com",
    "RELAY_BACKEND_URL": "https://api.yourservice.com"
  }
}
```

### Serverless Backend

The backend is stateless - perfect for serverless:

```typescript
// Firebase Functions
export const api = onRequest(app);

// AWS Lambda
export const handler = serverless(app);

// Vercel
export default app;
```

### Environment Variables

**Relay (user's machine):**
```bash
RELAY_AUTH_SERVER_URL=https://api.yourservice.com
RELAY_BACKEND_URL=https://api.yourservice.com
RELAY_CLIENT_ID=your-client-id
RELAY_SCOPES="read write"
```

**Backend (your server):**
```bash
JWT_SECRET=your-signing-secret
AUTH_SERVER_URL=https://api.yourservice.com  # For issuer validation
```

## This Repository

This repo contains a working reference implementation:

```
oauth-relay-example/
├── packages/
│   ├── relay/                  # Local MCP stdio server
│   │   └── src/
│   │       ├── index.ts        # MCP entry point
│   │       ├── orchestrator.ts # Auth + forwarding coordination
│   │       ├── auth/           # OAuth flow
│   │       │   ├── manager.ts  # OAuth orchestration
│   │       │   ├── pkce.ts     # PKCE implementation
│   │       │   ├── browser.ts  # Cross-platform browser open
│   │       │   └── callback-server.ts
│   │       ├── token/          # Token persistence
│   │       │   ├── store.ts
│   │       │   └── types.ts
│   │       └── http/           # Backend communication
│   │           └── client.ts
│   │
│   └── backend/                # Example backend (Firebase)
│       └── src/
│           ├── app.ts          # Express app
│           ├── middleware/
│           │   └── jwt-auth.ts # JWT validation
│           └── mcp/
│               ├── tools.ts    # Tool definitions
│               └── call.ts     # Tool implementations
```

### Running the Example

1. **Start the auth server** (uses demo-site from login-gator):
   ```bash
   cd ../login-gator/examples/demo-site
   npm install && npm run dev
   ```

2. **Start the backend**:
   ```bash
   npm run dev:backend:standalone
   ```

3. **Build the relay**:
   ```bash
   npm install && npm run build
   ```

4. **Configure Claude Code** (`~/.claude.json`):
   ```json
   {
     "mcpServers": {
       "oauth-relay-example": {
         "command": "node",
         "args": ["packages/relay/dist/index.js"],
         "cwd": "/path/to/oauth-relay-example",
         "env": {
           "RELAY_AUTH_SERVER_URL": "http://localhost:4100",
           "RELAY_BACKEND_URL": "http://localhost:5002"
         }
       }
     }
   }
   ```

5. **Test**: Call `whoami` tool - browser opens for login, returns user info.

### Tests

```bash
npm test              # Run all 120 tests
npm run test:relay    # Relay tests only
npm run test:backend  # Backend tests only
```

## FAQ

**Q: Can the relay and backend be the same process?**

A: Technically yes, but you lose the benefits. The relay must run locally (for browser access), so you'd be running your business logic on every user's machine. The split lets your backend scale independently.

**Q: What if the user's browser doesn't open?**

A: The relay logs the authorization URL. Users can copy/paste it manually. Consider adding a CLI prompt as fallback.

**Q: How do I handle multiple users on the same machine?**

A: Token storage is per-user by default (uses home directory). For shared machines, consider parameterizing the storage path.

**Q: Can I use this with identity providers like Auth0, Okta, etc.?**

A: Yes, any OAuth 2.1 / OpenID Connect provider that supports PKCE should work. Just point `RELAY_AUTH_SERVER_URL` at your provider.

**Q: What about token encryption?**

A: This implementation stores tokens as plain JSON with filesystem permissions. For higher security requirements, consider using the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service).

## License

MIT
