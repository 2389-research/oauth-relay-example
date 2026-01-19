# OAuth Relay MCP Example - Implementation Plan

**Date:** 2026-01-19
**Design Doc:** [oauth-relay-example-design.md](./2026-01-19-oauth-relay-example-design.md)

---

## Key Decision: Using demo-site for OAuth

We are **NOT** building our own OAuth server. Instead, we use the existing `demo-site` from `../login-gator/examples/demo-site/` which provides:

- OAuth 2.1 Authorization Server
- PKCE support
- JWT token issuance
- Integration with 2389 Platform (real identity provider)

This means our backend only needs to **validate** JWTs, not issue them.

---

## Project Setup

### Repository Structure

```
oauth-relay-example/
├── packages/
│   ├── relay/              # Local MCP stdio server + OAuth client
│   └── backend/            # Firebase Functions (MCP tools only)
├── docs/
│   └── plans/              # Design docs (already created)
├── package.json            # Workspace root
└── README.md
```

### External Dependencies

```
../login-gator/examples/demo-site/    # Auth server (run separately)
../login-gator/examples/demo-mcp/     # Reference implementation
```

---

## Phase 1: Project Scaffolding

### 1.1 Initialize Workspace

- [ ] Create root `package.json` with npm workspaces
- [ ] Create `packages/relay/` directory structure
- [ ] Create `packages/backend/` directory structure

### 1.2 Configure TypeScript

- [ ] Root `tsconfig.base.json` with shared settings
- [ ] `packages/relay/tsconfig.json` extends base
- [ ] `packages/backend/tsconfig.json` extends base

### 1.3 Verify demo-site Works

- [ ] Run `cd ../login-gator/examples/demo-site && npm install && npm run dev`
- [ ] Verify http://localhost:4100 is accessible
- [ ] Test OAuth metadata endpoint: `curl http://localhost:4100/.well-known/oauth-authorization-server`
- [ ] Document any setup requirements (env vars, etc.)

---

## Phase 2: Backend - MCP Tool Endpoints

**Goal:** Firebase Functions backend that validates demo-site JWTs and provides MCP tools.

### 2.1 Firebase Setup

- [ ] Initialize Firebase project in `packages/backend/`
- [ ] Configure Firebase Functions (Node 22)
- [ ] Set up emulator for local dev (`npm run dev`)
- [ ] Create Express app structure

### 2.2 JWT Validation Middleware

**`src/middleware/jwt-auth.ts`**

- [ ] Extract Bearer token from Authorization header
- [ ] Verify JWT signature (use demo-site's secret or public key)
- [ ] Check issuer matches demo-site URL
- [ ] Check expiry
- [ ] Attach decoded token to request
- [ ] Return 401 on invalid token

Reference: `../login-gator/examples/demo-mcp/src/auth.ts`

### 2.3 List Tools Endpoint

**`GET /mcp/tools`**

- [ ] No auth required (discovery)
- [ ] Return tool schemas

```typescript
{
  tools: [
    { name: "echo", description: "Echo a message back", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
    { name: "read_notes", description: "Read notes for the authenticated user", inputSchema: { type: "object", properties: {} } },
    { name: "create_note", description: "Create a new note", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
    { name: "whoami", description: "Get current user info", inputSchema: { type: "object", properties: {} } }
  ]
}
```

### 2.4 Call Tool Endpoint

**`POST /mcp/tools/:name`**

- [ ] Require auth for all tools except `echo`
- [ ] Validate tool exists
- [ ] Validate scope requirements
- [ ] Execute tool logic
- [ ] Return result

### 2.5 Implement Tool Logic

- [ ] `echo` - Return `{ message: input.message }` (no auth required)
- [ ] `read_notes` - Return mock notes array (requires `notes:read` scope)
- [ ] `create_note` - Return created note object (requires `notes:write` scope)
- [ ] `whoami` - Return user info from JWT claims (any auth)

### 2.6 Test Backend with curl

```bash
# Get a token manually from demo-site first, then:

# List tools (no auth)
curl http://localhost:5001/mcp/tools

# Echo (no auth)
curl -X POST http://localhost:5001/mcp/tools/echo \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"message": "hello"}}'

# Read notes (with auth)
curl -X POST http://localhost:5001/mcp/tools/read_notes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"arguments": {}}'
```

---

## Phase 3: Relay - Foundation

**Goal:** Build the core relay components that don't depend on OAuth.

### 3.1 Project Setup

- [ ] Initialize Node.js project in `packages/relay/`
- [ ] Add dependencies: `@modelcontextprotocol/sdk`
- [ ] Configure TypeScript
- [ ] Set up build scripts (`npm run build`, `npm run dev`)

### 3.2 PKCE Implementation

**`src/auth/pkce.ts`**

- [ ] `createPkceChallenge()` → `{ verifier: string, challenge: string }`
- [ ] Use `crypto.randomBytes(32)` for verifier
- [ ] Use `crypto.createHash('sha256')` for challenge
- [ ] Base64url encoding

### 3.3 Cross-Platform Browser Open

**`src/auth/browser.ts`**

- [ ] `openBrowser(url: string): Promise<void>`
- [ ] macOS: `open "url"`
- [ ] Windows: `start "" "url"`
- [ ] Linux: `xdg-open "url"`
- [ ] Handle errors gracefully (browser might still open even if command fails)

### 3.4 Callback Server

**`src/auth/callback-server.ts`**

- [ ] `CallbackServer` class
- [ ] `start()` → `{ port, waitForCallback, shutdown }`
- [ ] Listen on port 0 (random available port)
- [ ] Handle `/callback` route
- [ ] Extract `code`, `state`, `error` from query params
- [ ] Render success/error HTML pages
- [ ] Validate state matches expected
- [ ] Shutdown method to close server

### 3.5 Token Store

**`src/token/store.ts`**

- [ ] `TokenStore` class
- [ ] OS-specific default paths:
  - macOS: `~/Library/Application Support/oauth-relay-example/tokens.json`
  - Windows: `%APPDATA%/oauth-relay-example/tokens.json`
  - Linux: `~/.config/oauth-relay-example/tokens.json`
- [ ] `load(): Promise<TokenSet | null>`
- [ ] `save(tokens: TokenSet): Promise<void>`
- [ ] `clear(): Promise<void>`
- [ ] Create directory with mode 0o700
- [ ] Write file with mode 0o600

### 3.6 Configuration

**`src/config.ts`**

- [ ] Read from environment variables
- [ ] Provide sensible defaults for local dev
- [ ] Export typed config object

```typescript
interface Config {
  authServerUrl: string;     // default: http://localhost:4100
  backendUrl: string;        // default: http://localhost:5001
  clientId: string;          // default: oauth-relay-example
  scopes: string[];          // default: ["notes:read", "notes:write"]
  authTimeout: number;       // default: 120000 (2 min)
  tokenPath?: string;        // optional override
}
```

---

## Phase 4: Relay - OAuth Flow

**Goal:** Implement OAuth client that talks to demo-site.

### 4.1 Auth Manager

**`src/auth/manager.ts`**

- [ ] `AuthManager` class
- [ ] `authenticate(): Promise<TokenSet>` - Full OAuth flow
  - Fetch OAuth metadata from demo-site
  - Generate PKCE challenge
  - Start callback server
  - Build authorization URL
  - Open browser
  - Wait for callback (with timeout)
  - Exchange code for tokens
  - Return tokens
- [ ] `refresh(refreshToken: string): Promise<TokenSet>` - Refresh flow
  - POST to demo-site /token with refresh_token grant
  - Return new tokens
- [ ] Handle errors:
  - Timeout (2 min default)
  - User denial (error=access_denied)
  - Network errors
  - Invalid responses

### 4.2 HTTP Client

**`src/http/client.ts`**

- [ ] `HttpClient` class
- [ ] `listTools(): Promise<Tool[]>` - No auth needed
- [ ] `callTool(name: string, args: unknown, token: string): Promise<ToolResult>`
- [ ] Handle 401 responses (throw `UnauthorizedError`)
- [ ] Handle network errors

### 4.3 Orchestrator

**`src/orchestrator.ts`**

- [ ] `Orchestrator` class - Coordinates everything
- [ ] `listTools(): Promise<Tool[]>` - Forward to backend
- [ ] `callTool(name: string, args: unknown): Promise<ToolResult>`
  - Check token store
  - If no token → authenticate
  - If expired → try refresh → if fails → authenticate
  - Forward request with token
  - If 401 → try refresh → if fails → authenticate → retry
- [ ] Prevent concurrent auth flows (single pending auth)

### 4.4 MCP Entry Point

**`src/index.ts`**

- [ ] Create MCP `Server` instance
- [ ] Create `Orchestrator` instance
- [ ] Register `ListToolsRequestSchema` handler
- [ ] Register `CallToolRequestSchema` handler
- [ ] Create `StdioServerTransport`
- [ ] Connect server to transport
- [ ] Handle process signals for clean shutdown

---

## Phase 5: Integration Testing

### 5.1 Local Dev Setup Script

Create `scripts/dev.sh`:

```bash
#!/bin/bash
# Start all services for local development

echo "Starting demo-site (auth server)..."
(cd ../login-gator/examples/demo-site && npm run dev) &
DEMO_SITE_PID=$!

echo "Starting backend..."
(cd packages/backend && npm run dev) &
BACKEND_PID=$!

echo "Services started. Press Ctrl+C to stop all."
trap "kill $DEMO_SITE_PID $BACKEND_PID" EXIT
wait
```

### 5.2 Manual Testing Checklist

- [ ] Start all services with dev script
- [ ] Configure Claude Code with relay
- [ ] Test `echo` (no auth needed)
- [ ] Test auth flow triggers on `read_notes`
- [ ] Complete auth in browser
- [ ] Verify `read_notes` returns data
- [ ] Test `create_note`
- [ ] Test `whoami`
- [ ] Restart relay, verify token persists
- [ ] Wait for token expiry, verify refresh works

### 5.3 Error Scenarios

- [ ] Close browser during auth → timeout error
- [ ] Invalid tool name → helpful error
- [ ] Backend down → network error
- [ ] demo-site down → auth error

### 5.4 Cross-Platform

- [ ] Test on macOS
- [ ] Test on Linux (or WSL)
- [ ] Test on Windows (if available)

---

## Phase 6: Polish

### 6.1 Logging

- [ ] Add debug logging to relay (auth flow steps)
- [ ] Use `RELAY_LOG_LEVEL` env var
- [ ] Log to stderr (not stdout - that's for MCP)

### 6.2 Error Messages

- [ ] Friendly error messages for common failures
- [ ] Include troubleshooting hints

### 6.3 Documentation

- [ ] README.md with:
  - Quick start guide
  - Prerequisites (demo-site, etc.)
  - Environment variables
  - Claude Code configuration
  - Troubleshooting

### 6.4 Plugin Configuration

- [ ] Create `.claude-plugin/plugin.json`
- [ ] Test installation in Claude Code
- [ ] Verify tools appear and work

---

## Estimated Effort by Phase

| Phase | Description | Complexity | Notes |
|-------|-------------|------------|-------|
| 1 | Scaffolding | Low | Quick setup |
| 2 | Backend MCP | Low-Medium | No OAuth, just JWT validation |
| 3 | Relay Foundation | Medium | Core components |
| 4 | Relay OAuth | Medium-High | Main complexity |
| 5 | Integration | Medium | Testing + debugging |
| 6 | Polish | Low | Cleanup |

**Total estimate:** Phases can be done in ~2-3 focused sessions.

---

## Dependencies

### Relay (`packages/relay/package.json`)

```json
{
  "name": "oauth-relay-example-relay",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0"
  }
}
```

### Backend (`packages/backend/package.json`)

```json
{
  "name": "oauth-relay-example-backend",
  "dependencies": {
    "express": "^5.0.0",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^6.0.0",
    "jose": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/express": "^5.0.0"
  }
}
```

---

## Definition of Done

### Minimum Viable

- [ ] Can authenticate via browser using 2389 Platform
- [ ] Can call all 4 tools successfully
- [ ] Token persists across relay restarts
- [ ] Token refresh works automatically
- [ ] Works on macOS

### Full Completion

- [ ] All error flows handled gracefully
- [ ] Works on macOS, Linux, Windows
- [ ] README with setup instructions
- [ ] Can install as Claude Code plugin

---

## Getting Started

```bash
# 1. Verify demo-site works
cd ../login-gator/examples/demo-site
npm install
npm run dev
# Should be running on http://localhost:4100

# 2. Start Phase 1 - Scaffolding
cd oauth-relay-example
# Create package.json, directories, tsconfig files

# 3. Phase 2 - Backend
cd packages/backend
# Initialize Firebase, implement JWT validation + tools

# 4. Phase 3-4 - Relay
cd packages/relay
# Build components, wire together

# 5. Phase 5-6 - Test and polish
```

---

## Reference Files

When implementing, reference these existing files:

| What | Where |
|------|-------|
| JWT validation | `../login-gator/examples/demo-mcp/src/auth.ts` |
| MCP server setup | `../login-gator/examples/demo-mcp/src/index.ts` |
| OAuth endpoints | `../login-gator/examples/demo-site/src/oauth.ts` |
| Token structure | `../login-gator/examples/demo-site/src/oauth.ts` |
| demo-site config | `../login-gator/examples/demo-site/src/config.ts` |
