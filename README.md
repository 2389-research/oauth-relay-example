# OAuth Relay MCP Example

A proof-of-concept demonstrating how a local stdio MCP server can:
1. Perform OAuth 2.1 + PKCE authentication via browser
2. Store and manage tokens locally
3. Relay authenticated requests to a remote backend
4. Handle token refresh and re-authentication flows

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM OVERVIEW                                 │
│                                                                              │
│  ┌────────────────────┐                                                      │
│  │   2389 Platform    │  ← Real identity provider                            │
│  │   (OpenID Provider)│                                                      │
│  └─────────┬──────────┘                                                      │
│            │ OIDC                                                            │
│            ▼                                                                 │
│  ┌────────────────────┐                                                      │
│  │     demo-site      │  ← From ../login-gator/examples/demo-site            │
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

## Prerequisites

1. **Node.js 22+**
2. **Firebase CLI** - `npm install -g firebase-tools`
3. **demo-site** - Clone and set up `../login-gator/examples/demo-site`

## Quick Start

### 1. Start demo-site (Auth Server)

```bash
cd ../login-gator/examples/demo-site
npm install
npm run dev
# Runs on http://localhost:4100
```

### 2. Start the Backend (Firebase Emulator)

```bash
cd packages/backend
npm run build
firebase emulators:start --only functions
# Runs on http://127.0.0.1:5002
```

### 3. Configure Claude Code

Add to `~/.claude.json` or `.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "oauth-relay-example": {
      "command": "node",
      "args": ["packages/relay/dist/index.js"],
      "cwd": "/path/to/oauth-relay-example",
      "env": {
        "RELAY_AUTH_SERVER_URL": "http://localhost:4100",
        "RELAY_BACKEND_URL": "http://127.0.0.1:5002/platform-2389/us-central1/api"
      }
    }
  }
}
```

### 4. Test the Tools

Once configured, Claude Code will have access to these tools:

- **echo** - Test connectivity (no auth required)
- **read_notes** - Read notes for the authenticated user
- **create_note** - Create a new note
- **whoami** - Get current user info

When you use a tool requiring authentication, the relay will:
1. Open your browser to the 2389 Platform login page
2. After login, redirect back to the local callback server
3. Store the tokens for future requests

## Available Tools

| Tool | Auth Required | Scope | Description |
|------|--------------|-------|-------------|
| `echo` | No | - | Echo a message back |
| `read_notes` | Yes | `notes:read` | Read user's notes |
| `create_note` | Yes | `notes:write` | Create a new note |
| `whoami` | Yes | - | Get user info |

## Environment Variables

### Relay

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAY_AUTH_SERVER_URL` | `http://localhost:4100` | demo-site URL |
| `RELAY_BACKEND_URL` | `http://127.0.0.1:5002/platform-2389/us-central1/api` | Backend URL |
| `RELAY_CLIENT_ID` | `oauth-relay-example` | OAuth client ID |
| `RELAY_SCOPES` | `notes:read notes:write` | Requested scopes |
| `RELAY_AUTH_TIMEOUT` | `120000` | Auth timeout in ms |
| `RELAY_TOKEN_PATH` | OS-specific | Token storage path |
| `RELAY_CALLBACK_HOST` | `127.0.0.1` | Host for callback server to bind |
| `RELAY_CALLBACK_URL_HOST` | `localhost` | Hostname in OAuth redirect URI |
| `RELAY_LOG_LEVEL` | `info` | Log level |

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_SERVER_URL` | `http://localhost:4100` | demo-site URL |
| `JWT_SECRET` | `demo-site-secret-change-in-production` | JWT signing secret |
| `JWT_AUDIENCE` | `http://localhost:4200` | Expected JWT audience |

## Project Structure

```
oauth-relay-example/
├── packages/
│   ├── relay/                  # Local MCP stdio server + OAuth client
│   │   └── src/
│   │       ├── index.ts        # MCP entry point
│   │       ├── orchestrator.ts # Coordinates auth + tool calls
│   │       ├── config.ts       # Configuration
│   │       ├── auth/           # OAuth flow components
│   │       │   ├── manager.ts  # OAuth orchestration
│   │       │   ├── pkce.ts     # PKCE implementation
│   │       │   ├── browser.ts  # Cross-platform browser open
│   │       │   └── callback-server.ts # Localhost callback
│   │       ├── token/          # Token management
│   │       │   ├── store.ts    # Secure token persistence
│   │       │   └── types.ts    # Token interfaces
│   │       └── http/           # Backend communication
│   │           └── client.ts   # HTTP client
│   │
│   └── backend/                # Firebase Functions backend
│       └── src/
│           ├── index.ts        # Express app + Firebase export
│           ├── config.ts       # Configuration
│           ├── middleware/     # JWT validation
│           │   └── jwt-auth.ts
│           └── mcp/            # Tool endpoints
│               ├── tools.ts    # Tool definitions
│               └── call.ts     # Tool implementations
│
├── scripts/
│   └── dev.sh                  # Development helper script
│
├── docs/
│   └── plans/                  # Design documents
│
└── README.md
```

## Token Storage

Tokens are stored securely in an OS-specific location:

- **macOS**: `~/Library/Application Support/oauth-relay-example/tokens.json`
- **Windows**: `%APPDATA%/oauth-relay-example/tokens.json`
- **Linux**: `~/.config/oauth-relay-example/tokens.json`

Files are created with restricted permissions (0600).

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build specific package
cd packages/relay && npm run build
cd packages/backend && npm run build

# Run relay in development mode
cd packages/relay && npm run dev

# Run backend emulator
cd packages/backend && npm run dev
```

## Testing

### Automated Tests

Both packages include comprehensive unit and integration tests using Vitest.

```bash
# Run all tests
npm test

# Run only relay tests
npm run test:relay

# Run only backend tests
npm run test:backend

# Watch mode (in package directory)
cd packages/relay && npm run test:watch
cd packages/backend && npm run test:watch
```

**Test Coverage:**

| Package | Unit Tests | Integration Tests |
|---------|------------|-------------------|
| Relay | PKCE, Token Store, Callback Server | HTTP Client, Orchestrator |
| Backend | JWT Auth, Tools, Tool Handler | Full API Flow |

### Manual Testing

1. Start all services (demo-site, backend, relay)
2. Configure Claude Code with the relay
3. Test `echo` - should work without auth
4. Test `read_notes` - should trigger browser auth
5. Complete auth in browser
6. Test `create_note`, `whoami`

### curl Testing (Backend)

```bash
# List tools (no auth)
curl http://127.0.0.1:5002/platform-2389/us-central1/api/mcp/tools

# Echo (no auth)
echo '{"arguments":{"message":"Hello"}}' > /tmp/req.json
curl -X POST http://127.0.0.1:5002/platform-2389/us-central1/api/mcp/tools/echo \
  -H 'Content-Type: application/json' \
  -d @/tmp/req.json
```

## Remote Access (Tailscale)

Both services support binding to `0.0.0.0` for remote access via Tailscale or other VPNs.

### Backend - Standalone Mode

The backend has a standalone mode that bypasses Firebase emulator and binds to all interfaces:

```bash
# Start standalone backend on 0.0.0.0:5002
npm run dev:backend:standalone

# Or with custom port/host
PORT=8080 HOST=0.0.0.0 npm run dev:backend:standalone
```

### Relay - Remote Callback

For OAuth flow to work from a remote machine, configure the callback server to bind to all interfaces and use your Tailscale hostname in the redirect URI:

```bash
export RELAY_CALLBACK_HOST=0.0.0.0                    # Bind to all interfaces
export RELAY_CALLBACK_URL_HOST=your-hostname.ts.net  # Use in redirect URI
export RELAY_BACKEND_URL=http://your-hostname.ts.net:5002  # Remote backend
```

### Environment Variables for Remote Access

| Variable | Description |
|----------|-------------|
| `HOST` (backend) | Host to bind to (default: `0.0.0.0` in standalone) |
| `PORT` (backend) | Port to bind to (default: `5002`) |
| `RELAY_CALLBACK_HOST` | Host for callback server to bind (default: `127.0.0.1`) |
| `RELAY_CALLBACK_URL_HOST` | Hostname to use in OAuth redirect URI (default: `localhost`) |

### Example: Remote Testing Setup

On the server machine (where backend runs):

```bash
# Start backend in standalone mode
cd oauth-relay-example
npm run dev:backend:standalone
# Now accessible at http://server.ts.net:5002
```

On the client machine (where relay runs):

```bash
export RELAY_BACKEND_URL=http://server.ts.net:5002
export RELAY_CALLBACK_HOST=0.0.0.0
export RELAY_CALLBACK_URL_HOST=client.ts.net  # Or your IP
npm run dev:relay
```

## Design Decisions

1. **Using demo-site for OAuth**: Rather than building our own OAuth server, we reuse the existing demo-site which provides a complete OAuth 2.1 + PKCE implementation with real 2389 Platform integration.

2. **Firebase Functions backend**: Matches the eventual production deployment target.

3. **Separate relay and backend**: The relay handles local OAuth flow and token management, while the backend focuses on JWT validation and business logic.

4. **Port 5002 for backend**: Default Firebase port 5001 was taken, using 5002 instead.

## Related

- [Design Document](docs/plans/2026-01-19-oauth-relay-example-design.md)
- [Implementation Plan](docs/plans/2026-01-19-oauth-relay-example-plan.md)
- [demo-site](../login-gator/examples/demo-site) - OAuth Authorization Server
- [MCP Specification](https://modelcontextprotocol.io)
