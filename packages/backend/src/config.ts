// ABOUTME: Backend configuration
// ABOUTME: Reads from environment with sensible defaults for local dev

// Helper to get required environment variable
function requireEnv(name: string, defaultForDev?: string): string {
  const value = process.env[name];
  if (value) return value;

  // Allow default only in development
  if (defaultForDev && process.env.NODE_ENV !== "production") {
    console.warn(`[config] Using default ${name} - set this in production!`);
    return defaultForDev;
  }

  throw new Error(`Required environment variable ${name} is not set`);
}

export const config = {
  // demo-site URL for JWT validation (issuer check)
  authServerUrl: process.env.AUTH_SERVER_URL || "http://localhost:4100",

  // JWT secret - must match demo-site's jwtSecret
  // SECURITY: No default in production - must be explicitly set
  jwtSecret: requireEnv("JWT_SECRET", "demo-site-secret-change-in-production"),

  // Expected audience (demo-site uses http://localhost:4200 for demo-mcp)
  jwtAudience: process.env.JWT_AUDIENCE || "http://localhost:4200",
};
