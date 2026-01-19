// ABOUTME: PKCE (Proof Key for Code Exchange) implementation
// ABOUTME: Generates verifier and challenge for OAuth 2.1 security

import crypto from "crypto";

export interface PkceChallenge {
  verifier: string;
  challenge: string;
}

/**
 * Creates a PKCE code verifier and challenge pair.
 * - Verifier: 32 random bytes, base64url encoded
 * - Challenge: SHA-256 hash of verifier, base64url encoded
 */
export function createPkceChallenge(): PkceChallenge {
  // Generate 32 random bytes for the verifier
  const verifier = crypto.randomBytes(32).toString("base64url");

  // Create SHA-256 hash of the verifier
  const hash = crypto.createHash("sha256").update(verifier).digest();

  // Encode the hash as base64url
  const challenge = hash.toString("base64url");

  return { verifier, challenge };
}
