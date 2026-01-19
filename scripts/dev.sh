#!/bin/bash
# ABOUTME: Development startup script
# ABOUTME: Starts all services needed for local development

set -e

echo "Starting OAuth Relay Example development environment..."
echo ""

# Check if demo-site is running
if curl -s http://localhost:4100/.well-known/oauth-authorization-server > /dev/null 2>&1; then
    echo "✓ demo-site already running on port 4100"
else
    echo "⚠ demo-site not running. Start it with:"
    echo "  cd ../login-gator/examples/demo-site && npm run dev"
    echo ""
fi

# Check if backend is running
if curl -s http://127.0.0.1:5002/platform-2389/us-central1/api/ > /dev/null 2>&1; then
    echo "✓ backend already running on port 5002"
else
    echo "⚠ backend not running. Start it with:"
    echo "  cd packages/backend && firebase emulators:start --only functions"
    echo ""
fi

echo ""
echo "To test the relay manually:"
echo "  cd packages/relay && npm run dev"
echo ""
echo "To configure in Claude Code, add to ~/.claude.json or .claude/settings.local.json:"
echo ""
cat << 'EOF'
{
  "mcpServers": {
    "oauth-relay-example": {
      "command": "node",
      "args": ["packages/relay/dist/index.js"],
      "cwd": "/Users/dylanr/work/2389/oauth-relay-example",
      "env": {
        "RELAY_AUTH_SERVER_URL": "http://localhost:4100",
        "RELAY_BACKEND_URL": "http://127.0.0.1:5002/platform-2389/us-central1/api"
      }
    }
  }
}
EOF
