// ABOUTME: Token type definitions
// ABOUTME: Defines the structure of stored OAuth tokens

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  scope: string;
}

export function isTokenExpired(token: TokenSet, bufferMs: number = 60000): boolean {
  // Consider token expired if it expires within the buffer time
  return Date.now() + bufferMs >= token.expiresAt;
}
