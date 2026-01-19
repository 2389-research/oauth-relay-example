// ABOUTME: Unit tests for JWT authentication middleware
// ABOUTME: Tests token validation, expiry, and error handling

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response } from "express";
import * as jose from "jose";
import { jwtAuth, hasScope, AuthenticatedRequest } from "./jwt-auth.js";
import { config } from "../config.js";

describe("JWT Auth Middleware", () => {
  const secret = new TextEncoder().encode(config.jwtSecret);

  async function createToken(
    claims: Record<string, unknown>,
    options?: { expiresIn?: string }
  ): Promise<string> {
    const jwt = new jose.SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(config.authServerUrl)
      .setAudience(config.jwtAudience);

    if (options?.expiresIn) {
      jwt.setExpirationTime(options.expiresIn);
    } else {
      jwt.setExpirationTime("1h");
    }

    return jwt.sign(secret);
  }

  function createMockRequest(authHeader?: string): AuthenticatedRequest {
    return {
      headers: authHeader ? { authorization: authHeader } : {},
    } as AuthenticatedRequest;
  }

  function createMockResponse(): Response {
    const res: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    return res as Response;
  }

  function createMockNext(): ReturnType<typeof vi.fn> {
    return vi.fn();
  }

  describe("jwtAuth({ required: true })", () => {
    const middleware = jwtAuth({ required: true });

    it("should return 401 when no Authorization header", async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "unauthorized",
        error_description: "Missing Authorization header",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when Authorization header is not Bearer", async () => {
      const req = createMockRequest("Basic dXNlcjpwYXNz");
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "unauthorized",
        error_description: "Invalid Authorization header format",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 for invalid token", async () => {
      const req = createMockRequest("Bearer invalid-token");
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "unauthorized",
        error_description: "Invalid token",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 for expired token", async () => {
      const token = await createToken(
        { sub: "user-123", scope: "notes:read" },
        { expiresIn: "-1h" } // Expired 1 hour ago
      );
      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "unauthorized",
        error_description: "Token expired",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next and attach user for valid token", async () => {
      const token = await createToken({
        sub: "user-123",
        scope: "notes:read notes:write",
        client_id: "test-client",
      });
      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({
        sub: "user-123",
        scope: "notes:read notes:write",
        clientId: "test-client",
      });
    });

    it("should handle token with wrong issuer", async () => {
      const wrongSecret = new TextEncoder().encode(config.jwtSecret);
      const token = await new jose.SignJWT({ sub: "user-123", scope: "notes:read" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .setIssuer("https://wrong-issuer.com")
        .setAudience(config.jwtAudience)
        .sign(wrongSecret);

      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "unauthorized",
        error_description: "Token validation failed",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should handle token with wrong audience", async () => {
      const token = await new jose.SignJWT({ sub: "user-123", scope: "notes:read" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .setIssuer(config.authServerUrl)
        .setAudience("https://wrong-audience.com")
        .sign(secret);

      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "unauthorized",
        error_description: "Token validation failed",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("jwtAuth({ required: false })", () => {
    const middleware = jwtAuth({ required: false });

    it("should call next without user when no Authorization header", async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it("should still validate token if provided", async () => {
      const token = await createToken({
        sub: "user-456",
        scope: "notes:read",
        client_id: "client-456",
      });
      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({
        sub: "user-456",
        scope: "notes:read",
        clientId: "client-456",
      });
    });

    it("should return 401 for invalid token even when not required", async () => {
      const req = createMockRequest("Bearer invalid-token");
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("hasScope", () => {
    it("should return true when user has required scope", () => {
      const req = {
        user: {
          sub: "user-123",
          scope: "notes:read notes:write admin",
          clientId: "test",
        },
      } as AuthenticatedRequest;

      expect(hasScope(req, "notes:read")).toBe(true);
      expect(hasScope(req, "notes:write")).toBe(true);
      expect(hasScope(req, "admin")).toBe(true);
    });

    it("should return false when user lacks required scope", () => {
      const req = {
        user: {
          sub: "user-123",
          scope: "notes:read",
          clientId: "test",
        },
      } as AuthenticatedRequest;

      expect(hasScope(req, "notes:write")).toBe(false);
      expect(hasScope(req, "admin")).toBe(false);
    });

    it("should return false when no user", () => {
      const req = {} as AuthenticatedRequest;

      expect(hasScope(req, "notes:read")).toBe(false);
    });

    it("should handle empty scope", () => {
      const req = {
        user: {
          sub: "user-123",
          scope: "",
          clientId: "test",
        },
      } as AuthenticatedRequest;

      expect(hasScope(req, "notes:read")).toBe(false);
    });
  });
});
