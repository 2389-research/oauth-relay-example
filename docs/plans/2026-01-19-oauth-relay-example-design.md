# OAuth Relay MCP Example - Design Document

**Date:** 2026-01-19
**Status:** Draft
**Author:** Claude + Dylan

## Problem Statement

We need to validate that a local stdio MCP server can successfully:
1. Perform OAuth 2.1 + PKCE authentication via browser
2. Store and manage tokens locally
3. Relay authenticated requests to a remote backend
4. Handle token refresh and re-authentication flows

This example will prove out the pattern before integrating with the real botboard.biz system.

## Goals

1. **Prove the pattern works** - Local OAuth relay with stdio transport
2. **Use real OAuth** - Test against demo-site (same pattern as botboard.biz will use)
3. **Cross-platform** - Works on macOS, Linux, and Windows
4. **Complete flows** - Auth, refresh, error handling, re-auth
5. **Minimal new code** - Leverage existing demo-site for OAuth

## Non-Goals

- Production-ready security (this is a proof of concept)
- Integration with botboard.biz (that's the next project)
- Complex business logic (just echo/notes-style tools)

---

## External Dependency: demo-site

### Location

```
../login-gator/examples/demo-site/
```

### What It Provides

demo-site is a working OAuth 2.1 Authorization Server that:
- Authenticates users via 2389 Platform (OIDC)
- Issues JWT access tokens and refresh tokens
- Supports PKCE (required)
- Has a notes API we can test against

### Running demo-site

```bash
cd ../login-gator/examples/demo-site
npm install
npm run dev
# Runs on http://localhost:4100
```

### Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/.well-known/oauth-authorization-server` | OAuth metadata |
| `/authorize` | Authorization endpoint (redirects to 2389 Platform) |
| `/token` | Token endpoint (code exchange, refresh) |
| `/api/notes` | Notes API (for testing authenticated calls) |

### Token Structure (from demo-site)

```typescript
{
  sub: string;        // User ID from 2389 Platform
  scope: string;      // "notes:read notes:write"
  client_id: string;  // Client identifier
  iat: number;        // Issued at
  exp: number;        // Expires (1 hour)
  iss: string;        // "http://localhost:4100"
  aud: string;        // Resource server URL
}
```

---

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM OVERVIEW                                 │
│                                                                              │
│  ┌────────────────────┐                                                      │
│  │   2389 Platform    │  ← Real identity provider (Google OAuth behind it)  │
│  │   (OpenID Provider)│                                                      │
│  └─────────┬──────────┘                                                      │
│            │ OIDC                                                            │
│            ▼                                                                 │
│  ┌────────────────────┐                                                      │
│  │     demo-site      │  ← EXISTING - from ../login-gator/examples/         │
│  │  (Auth Server)     │     Handles OAuth, issues JWTs                       │
│  │  localhost:4100    │                                                      │
│  └─────────┬──────────┘                                                      │
│            │ OAuth 2.1 + PKCE                                                │
│            │                                                                 │
│  ┌─────────┴──────────────────────────────────────────────────────────────┐ │
│  │                        oauth-relay-example/                             │ │
│  │                                                                         │ │
│  │  ┌──────────────┐          ┌──────────────┐                            │ │
│  │  │    relay/    │          │   backend/   │                            │ │
│  │  │              │  HTTP    │              │                            │ │
│  │  │ Local stdio  │ -------> │  MCP Tools   │                            │ │
│  │  │ MCP server   │  + JWT   │  (Firebase)  │                            │ │
│  │  │ + OAuth flow │          │              │                            │ │
│  │  └──────────────┘          └──────────────┘                            │ │
│  │        ▲                                                                │ │
│  │        │ stdio                                                          │ │
│  │  ┌─────┴────────┐                                                       │ │
│  │  │ Claude Code  │                                                       │ │
│  │  └──────────────┘                                                       │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What We Build vs What We Reuse

| Component | Source | What It Does |
|-----------|--------|--------------|
| **2389 Platform** | Existing | Real identity provider |
| **demo-site** | Existing (`../login-gator/examples/demo-site`) | OAuth Authorization Server |
| **relay** | **We build** | Local MCP server + OAuth client |
| **backend** | **We build** | MCP tool endpoints on Firebase |

### Components We Build

#### 1. Relay (`relay/`)

The local MCP server that:
- Speaks MCP protocol over stdio to Claude Code
- Handles OAuth flow (browser, callback server, PKCE)
- Authenticates against demo-site
- Stores tokens locally
- Forwards authenticated requests to our backend

```
relay/
├── src/
│   ├── index.ts              # Entry point, stdio MCP server
│   ├── orchestrator.ts       # Coordinates auth + forwarding
│   ├── auth/
│   │   ├── manager.ts        # OAuth flow orchestration
│   │   ├── pkce.ts           # PKCE challenge/verifier
│   │   ├── callback-server.ts # Temporary localhost server
│   │   └── browser.ts        # Cross-platform browser open
│   ├── token/
│   │   ├── store.ts          # Token persistence
│   │   └── types.ts          # Token interfaces
│   ├── http/
│   │   └── client.ts         # HTTP client to backend
│   └── config.ts             # Configuration
├── package.json
└── tsconfig.json
```

#### 2. Backend (`backend/`)

A minimal Firebase Functions backend that:
- Provides MCP tool endpoints
- Validates JWTs (issued by demo-site)
- Returns mock data for testing

**Note:** We do NOT build OAuth endpoints - demo-site handles that.

```
backend/
├── src/
│   ├── index.ts              # Firebase Functions entry
│   ├── mcp/
│   │   ├── tools.ts          # GET /mcp/tools (list)
│   │   └── call.ts           # POST /mcp/tools/:name (execute)
│   ├── middleware/
│   │   └── jwt-auth.ts       # JWT validation (verifies demo-site tokens)
│   └── config.ts             # Configuration
├── firebase.json
├── package.json
└── tsconfig.json
```

---

## OAuth Flow Details

### Using demo-site

The relay acts as an OAuth client to demo-site:

1. **Discovery:** Fetch `http://localhost:4100/.well-known/oauth-authorization-server`
2. **Authorize:** Open browser to `http://localhost:4100/authorize?...`
3. **User authenticates:** demo-site redirects to 2389 Platform, user logs in
4. **Callback:** demo-site redirects back to relay's localhost callback
5. **Token exchange:** Relay POSTs to `http://localhost:4100/token`
6. **Use token:** Relay sends JWT to our backend

### Required OAuth Parameters

```typescript
// Authorization request
{
  response_type: "code",
  client_id: "oauth-relay-example",  // Register with demo-site
  redirect_uri: "http://localhost:PORT/callback",
  state: "<random>",
  code_challenge: "<PKCE challenge>",
  code_challenge_method: "S256",
  scope: "notes:read notes:write"
}
```

### Demo-site Client Registration

demo-site supports dynamic client registration (RFC 7591), but for simplicity we can hardcode our client in demo-site's config or use its existing test client.

**Option A:** Use demo-site's existing client (if any)
**Option B:** Register dynamically on first auth
**Option C:** Add our client to demo-site's allowed list

Recommendation: Start with Option C (simplest for POC).

---

## MCP Tools

Simple tools to prove the pattern. These mirror demo-site's notes API:

### 1. `echo`
- **Scope:** none (always allowed)
- **Input:** `{ message: string }`
- **Output:** Returns the message back
- **Purpose:** Test basic connectivity (no auth)

### 2. `read_notes`
- **Scope:** `notes:read`
- **Input:** `{}`
- **Output:** List of notes for the user
- **Purpose:** Test authenticated read
- **Backend:** Calls demo-site's `GET /api/notes` (or our own mock)

### 3. `create_note`
- **Scope:** `notes:write`
- **Input:** `{ text: string }`
- **Output:** Created note
- **Purpose:** Test authenticated write
- **Backend:** Calls demo-site's `POST /api/notes` (or our own mock)

### 4. `whoami`
- **Scope:** any authenticated
- **Input:** `{}`
- **Output:** User info from token
- **Purpose:** Test token extraction

---

## State Flows

### Flow 1: First Time Use (No Token)

```
1. User: "echo hello"
2. Relay: Check token store → empty
3. Relay: Start OAuth flow
   a. Fetch demo-site OAuth metadata
   b. Start callback server on random port
   c. Open browser to demo-site/authorize
   d. Wait for callback (2 min timeout)
4. Browser: demo-site redirects to 2389 Platform
5. User: Logs in with Google (via 2389 Platform)
6. Browser: 2389 Platform redirects back to demo-site
7. Browser: demo-site redirects to localhost:PORT/callback?code=XXX
8. Relay: Receives callback
   a. POST to demo-site/token with code + PKCE verifier
   b. Receive access_token + refresh_token
   c. Store tokens locally
9. Relay: Forward original request with Bearer token
10. Backend: Validate token (signed by demo-site), execute tool
11. Relay: Return result to Claude Code
12. User sees: "hello"
```

### Flow 2: Has Valid Token

```
1. User: "read_notes"
2. Relay: Check token store → found, not expired
3. Relay: Forward request with Bearer token
4. Backend: Validate token, return notes
5. Relay: Return result to Claude Code
6. User sees: [list of notes]
```

### Flow 3: Token Expired, Refresh Succeeds

```
1. User: "create_note 'hello world'"
2. Relay: Check token store → found, EXPIRED
3. Relay: Attempt refresh
   a. POST to demo-site/token with refresh_token
   b. Receive new access_token
   c. Update token store
4. Relay: Forward request with new Bearer token
5. Backend: Validate token, create note, return result
6. User sees: { id: "...", text: "hello world" }
```

### Flow 4: Token Expired, Refresh Fails

```
1. User: "whoami"
2. Relay: Check token store → found, EXPIRED
3. Relay: Attempt refresh → 401 (refresh token revoked)
4. Relay: Clear token store
5. Relay: Start OAuth flow (same as Flow 1)
6. [User re-authenticates via 2389 Platform]
7. Relay: Forward request with new token
8. User sees: { userId: "...", ... }
```

### Flow 5: Backend Rejects Token Mid-Session

```
1. User: "read_notes"
2. Relay: Check token store → found, not expired locally
3. Relay: Forward request with Bearer token
4. Backend: 401 Unauthorized (token revoked server-side)
5. Relay: Attempt refresh → success/fail
6. If success: retry request
7. If fail: trigger re-auth flow
```

### Flow 6: Auth Timeout

```
1. User: "echo hello"
2. Relay: Check token store → empty
3. Relay: Start OAuth flow
   a. Start callback server
   b. Open browser to demo-site
   c. Wait for callback...
4. [2 minutes pass, no callback]
5. Relay: Timeout, shut down callback server
6. Relay: Return error to Claude Code
7. User sees: "Authentication timed out. Please try again."
```

### Flow 7: User Denies Authorization

```
1. User: "echo hello"
2. Relay: Start OAuth flow, open browser
3. User: Clicks "Deny" (or closes browser)
4. demo-site: Redirects to callback?error=access_denied
5. Relay: Receives error callback
6. Relay: Return error to Claude Code
7. User sees: "Authorization denied by user."
```

---

## Configuration

### Relay Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RELAY_AUTH_SERVER_URL` | No | `http://localhost:4100` | demo-site URL |
| `RELAY_BACKEND_URL` | No | `http://localhost:5001` | Our backend URL |
| `RELAY_CLIENT_ID` | No | `oauth-relay-example` | OAuth client ID |
| `RELAY_TOKEN_PATH` | No | OS-specific | Token storage path |
| `RELAY_AUTH_TIMEOUT` | No | `120000` | Auth timeout (ms) |
| `RELAY_LOG_LEVEL` | No | `info` | Log level |

### Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SERVER_URL` | No | `http://localhost:4100` | demo-site URL (for JWT validation) |
| `JWT_SECRET` | Yes | - | Shared secret with demo-site |

### Demo-site Configuration

demo-site needs to know about our client. Check `../login-gator/examples/demo-site/src/config.ts` for how to add allowed clients/redirect URIs.

---

## Development Setup

### Prerequisites

1. **2389 Platform account** - For real authentication
2. **Node.js 22+** - For all packages
3. **Firebase CLI** - For backend emulator

### Running the Full Stack

```bash
# Terminal 1: Start demo-site (auth server)
cd ../login-gator/examples/demo-site
npm install
npm run dev
# → http://localhost:4100

# Terminal 2: Start our backend (Firebase emulator)
cd oauth-relay-example/backend
npm install
npm run dev
# → http://localhost:5001

# Terminal 3: Test relay manually (or configure in Claude Code)
cd oauth-relay-example/relay
npm install
npm run dev
```

### Configuring Claude Code

```json
{
  "mcpServers": {
    "oauth-relay-example": {
      "command": "node",
      "args": ["/path/to/oauth-relay-example/relay/dist/index.js"],
      "env": {
        "RELAY_AUTH_SERVER_URL": "http://localhost:4100",
        "RELAY_BACKEND_URL": "http://localhost:5001"
      }
    }
  }
}
```

---

## Testing Strategy

### 1. Unit Tests (Relay)

- `pkce.ts` - PKCE generation
- `token/store.ts` - Token persistence (mock filesystem)
- `orchestrator.ts` - State machine logic (mocked dependencies)

### 2. Unit Tests (Backend)

- `jwt-auth.ts` - Token validation
- `mcp/call.ts` - Tool execution

### 3. Integration Tests

- Full OAuth flow with real HTTP (relay + demo-site + backend)
- Token refresh flow
- Error handling flows

### 4. Manual Testing

1. Start demo-site: `cd ../login-gator/examples/demo-site && npm run dev`
2. Start backend: `cd backend && npm run dev`
3. Configure Claude Code with relay
4. Test each tool manually
5. Test auth expiry by shortening token lifetime

---

## Development Phases

### Phase 1: Setup & Backend
- Set up monorepo structure
- Create Firebase Functions project
- Implement JWT validation middleware (verify demo-site tokens)
- Implement MCP tool endpoints
- Test with curl using manually-obtained token

### Phase 2: Relay Foundation
- Set up Node.js project with stdio MCP
- Implement PKCE helper
- Implement callback server
- Implement cross-platform browser open
- Implement token store
- Test each component in isolation

### Phase 3: Relay OAuth Integration
- Implement auth manager (talks to demo-site)
- Implement orchestrator
- Wire everything together
- End-to-end testing with demo-site

### Phase 4: Error Handling & Polish
- Implement all error flows
- Add timeouts and retry logic
- Add logging
- Test on all platforms
- Write documentation

---

## Success Criteria

1. **Auth flow works** - Can authenticate via browser using 2389 Platform
2. **Token persistence** - Tokens survive relay restart
3. **Token refresh** - Automatic refresh when expired
4. **Re-auth** - Triggers new auth when refresh fails
5. **Cross-platform** - Works on macOS, Linux, Windows
6. **Error handling** - Graceful failures with helpful messages
7. **Claude Code integration** - Can install as plugin and use tools

---

## Open Questions (Resolved)

1. ~~**Mock auth vs real IdP?**~~
   - **Decision:** Use real IdP via demo-site
   - This validates the exact pattern botboard.biz will use

2. **Monorepo vs separate repos?**
   - Recommendation: Monorepo for simplicity during development

3. **Firebase vs other backend?**
   - Recommendation: Firebase to match production target

4. **Token storage security?**
   - For POC: File with restricted permissions
   - For production: Consider system keychain

---

## Related Files

- **demo-site source:** `../login-gator/examples/demo-site/`
- **demo-mcp reference:** `../login-gator/examples/demo-mcp/` (for MCP patterns)
- **MCP spec:** https://modelcontextprotocol.io/llms-full.txt

---

## Next Steps

1. Review and approve this design
2. Check demo-site client registration requirements
3. Create project structure
4. Begin Phase 1 implementation
