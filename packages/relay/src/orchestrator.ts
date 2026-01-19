// ABOUTME: Orchestrator coordinates auth and tool forwarding
// ABOUTME: Handles token management, refresh, and re-authentication

import { AuthManager } from "./auth/manager.js";
import { TokenStore } from "./token/store.js";
import { TokenSet, isTokenExpired } from "./token/types.js";
import { HttpClient, Tool, ToolResult, UnauthorizedError } from "./http/client.js";

export class Orchestrator {
  private authManager: AuthManager;
  private tokenStore: TokenStore;
  private httpClient: HttpClient;
  private cachedTokens: TokenSet | null = null;
  private pendingAuth: Promise<TokenSet> | null = null;

  constructor() {
    this.authManager = new AuthManager();
    this.tokenStore = new TokenStore();
    this.httpClient = new HttpClient();
  }

  /**
   * Initialize the orchestrator by loading any stored tokens.
   */
  async init(): Promise<void> {
    this.cachedTokens = await this.tokenStore.load();
    if (this.cachedTokens) {
      console.error("[orchestrator] Loaded stored tokens");
    }
  }

  /**
   * List available tools from the backend.
   */
  async listTools(): Promise<Tool[]> {
    return this.httpClient.listTools();
  }

  /**
   * Call a tool on the backend.
   * Handles authentication automatically if needed.
   */
  async callTool(name: string, args: unknown): Promise<ToolResult> {
    // Try to call with current token (or no token if we don't have one)
    try {
      const token = await this.getValidToken();
      return await this.httpClient.callTool(name, args, token);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        // Token was rejected - try to refresh or re-auth
        console.error("[orchestrator] Token rejected, attempting refresh/re-auth...");
        const newToken = await this.refreshOrReauth();
        return await this.httpClient.callTool(name, args, newToken);
      }
      throw err;
    }
  }

  /**
   * Get a valid access token, refreshing if needed.
   * Returns undefined if no token is available (tool might not need auth).
   */
  private async getValidToken(): Promise<string | undefined> {
    // No cached tokens - might not need auth
    if (!this.cachedTokens) {
      return undefined;
    }

    // Check if token is expired
    if (isTokenExpired(this.cachedTokens)) {
      console.error("[orchestrator] Token expired, refreshing...");
      try {
        await this.refreshToken();
      } catch (err) {
        console.error("[orchestrator] Token refresh failed, will re-authenticate on next call");
        this.cachedTokens = null;
        await this.tokenStore.clear();
        return undefined;
      }
    }

    return this.cachedTokens?.accessToken;
  }

  /**
   * Refresh the current token.
   */
  private async refreshToken(): Promise<void> {
    if (!this.cachedTokens) {
      throw new Error("No tokens to refresh");
    }

    const newTokens = await this.authManager.refresh(this.cachedTokens.refreshToken);
    this.cachedTokens = newTokens;
    await this.tokenStore.save(newTokens);
  }

  /**
   * Try to refresh tokens, or re-authenticate if refresh fails.
   * Prevents concurrent auth flows.
   */
  private async refreshOrReauth(): Promise<string> {
    // Prevent concurrent auth flows
    if (this.pendingAuth) {
      console.error("[orchestrator] Auth already in progress, waiting...");
      const tokens = await this.pendingAuth;
      return tokens.accessToken;
    }

    this.pendingAuth = this.doRefreshOrReauth();
    try {
      const tokens = await this.pendingAuth;
      return tokens.accessToken;
    } finally {
      this.pendingAuth = null;
    }
  }

  private async doRefreshOrReauth(): Promise<TokenSet> {
    // Try refresh first if we have a refresh token
    if (this.cachedTokens?.refreshToken) {
      try {
        await this.refreshToken();
        return this.cachedTokens!;
      } catch (err) {
        console.error("[orchestrator] Refresh failed, will re-authenticate");
      }
    }

    // Refresh failed or no refresh token - do full auth
    console.error("[orchestrator] Starting authentication flow...");
    const newTokens = await this.authManager.authenticate();
    this.cachedTokens = newTokens;
    await this.tokenStore.save(newTokens);
    return newTokens;
  }

  /**
   * Force a new authentication flow.
   * Used when explicitly requested or when all retry options are exhausted.
   */
  async forceAuthenticate(): Promise<void> {
    const newTokens = await this.authManager.authenticate();
    this.cachedTokens = newTokens;
    await this.tokenStore.save(newTokens);
  }
}
