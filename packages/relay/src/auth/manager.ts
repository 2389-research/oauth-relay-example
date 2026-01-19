// ABOUTME: OAuth authentication manager
// ABOUTME: Orchestrates the full OAuth 2.1 + PKCE flow

import crypto from "crypto";
import { config } from "../config.js";
import { createPkceChallenge } from "./pkce.js";
import { openBrowser } from "./browser.js";
import { CallbackServer } from "./callback-server.js";
import { TokenSet } from "../token/types.js";

interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  scopes_supported: string[];
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string; // Optional per OAuth 2.1 spec
  scope: string;
}

export class AuthManager {
  private authServerUrl: string;
  private clientId: string;
  private scopes: string[];
  private authTimeout: number;
  private callbackHost: string;
  private callbackUrlHost: string;

  constructor() {
    this.authServerUrl = config.authServerUrl;
    this.clientId = config.clientId;
    this.scopes = config.scopes;
    this.authTimeout = config.authTimeout;
    this.callbackHost = config.callbackHost;
    this.callbackUrlHost = config.callbackUrlHost;
  }

  /**
   * Fetch OAuth metadata from the authorization server.
   */
  private async fetchMetadata(): Promise<OAuthMetadata> {
    const metadataUrl = `${this.authServerUrl}/.well-known/oauth-authorization-server`;
    const response = await fetch(metadataUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch OAuth metadata: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as OAuthMetadata;
  }

  /**
   * Perform the full OAuth authentication flow.
   * Opens a browser for user authentication and waits for the callback.
   */
  async authenticate(): Promise<TokenSet> {
    console.error("[auth] Starting OAuth authentication flow...");

    // 1. Fetch OAuth metadata
    const metadata = await this.fetchMetadata();
    console.error("[auth] Fetched OAuth metadata from", metadata.issuer);

    // 2. Generate PKCE challenge
    const pkce = createPkceChallenge();

    // 3. Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString("base64url");

    // 4. Start callback server
    const callbackServer = new CallbackServer();
    const { port, host, waitForCallback, shutdown } = await callbackServer.start(
      state,
      this.authTimeout,
      { host: this.callbackHost }
    );
    // Use callbackUrlHost for the redirect URI (may differ from bind host for Tailscale)
    const redirectUri = `http://${this.callbackUrlHost}:${port}/callback`;
    console.error(`[auth] Callback server listening on ${host}:${port}`);

    try {
      // 5. Build authorization URL
      const authUrl = new URL(metadata.authorization_endpoint);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", this.clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", this.scopes.join(" "));
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", pkce.challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      // 6. Open browser
      console.error("[auth] Opening browser for authentication...");
      console.error("[auth] If browser doesn't open, visit:", authUrl.toString());
      await openBrowser(authUrl.toString());

      // 7. Wait for callback
      console.error("[auth] Waiting for authorization callback...");
      const { code } = await waitForCallback();
      console.error("[auth] Received authorization code");

      // 8. Exchange code for tokens
      const tokens = await this.exchangeCode(metadata.token_endpoint, code, redirectUri, pkce.verifier);
      console.error("[auth] Token exchange successful");

      return tokens;
    } finally {
      shutdown();
    }
  }

  /**
   * Exchange an authorization code for tokens.
   */
  private async exchangeCode(
    tokenEndpoint: string,
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<TokenSet> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: this.clientId,
      code_verifier: codeVerifier,
    });

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as TokenResponse;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || "", // May not be provided by all servers
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };
  }

  /**
   * Refresh an access token using a refresh token.
   * @throws Error if refresh token is empty or refresh fails
   */
  async refresh(refreshToken: string): Promise<TokenSet> {
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }
    console.error("[auth] Refreshing access token...");

    const metadata = await this.fetchMetadata();

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
    });

    const response = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as TokenResponse;
    console.error("[auth] Token refresh successful");

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };
  }
}
