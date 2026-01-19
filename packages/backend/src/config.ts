// ABOUTME: Backend configuration
// ABOUTME: Reads from environment with sensible defaults for local dev

export const config = {
  // demo-site URL for JWT validation (issuer check)
  authServerUrl: process.env.AUTH_SERVER_URL || "http://localhost:4100",

  // JWT secret - must match demo-site's jwtSecret
  // demo-site default: "demo-site-secret-change-in-production"
  jwtSecret: process.env.JWT_SECRET || "demo-site-secret-change-in-production",

  // Expected audience (demo-site uses http://localhost:4200 for demo-mcp)
  // We'll accept this audience for compatibility
  jwtAudience: process.env.JWT_AUDIENCE || "http://localhost:4200",
};
