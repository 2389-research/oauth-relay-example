// ABOUTME: JWT validation middleware
// ABOUTME: Validates Bearer tokens issued by demo-site

import { Request, Response, NextFunction } from "express";
import * as jose from "jose";
import { config } from "../config.js";

// Extend Express Request to include decoded token
export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    scope: string;
    clientId: string;
  };
}

// Middleware factory - returns middleware that optionally requires auth
export function jwtAuth(options: { required: boolean } = { required: true }) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const authHeader = req.headers.authorization;

    // No auth header
    if (!authHeader) {
      if (options.required) {
        res.status(401).json({ error: "unauthorized", error_description: "Missing Authorization header" });
        return;
      }
      next();
      return;
    }

    // Parse Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      res.status(401).json({ error: "unauthorized", error_description: "Invalid Authorization header format" });
      return;
    }

    const token = parts[1];

    try {
      // Verify JWT signature and claims
      const secret = new TextEncoder().encode(config.jwtSecret);
      const { payload } = await jose.jwtVerify(token, secret, {
        issuer: config.authServerUrl,
        audience: config.jwtAudience,
        algorithms: ["HS256"], // Explicitly allow only HS256 to prevent algorithm confusion
      });

      // Validate required claims
      if (!payload.sub || typeof payload.sub !== "string") {
        res.status(401).json({ error: "unauthorized", error_description: "Missing sub claim" });
        return;
      }

      // Attach user info to request
      req.user = {
        sub: payload.sub,
        scope: (payload.scope as string) || "",
        clientId: (payload.client_id as string) || "",
      };

      next();
    } catch (err) {
      if (err instanceof jose.errors.JWTExpired) {
        res.status(401).json({ error: "unauthorized", error_description: "Token expired" });
        return;
      }
      if (err instanceof jose.errors.JWTClaimValidationFailed) {
        res.status(401).json({ error: "unauthorized", error_description: "Token validation failed" });
        return;
      }
      console.error("JWT verification error:", err);
      res.status(401).json({ error: "unauthorized", error_description: "Invalid token" });
    }
  };
}

// Helper to check if user has required scope
export function hasScope(req: AuthenticatedRequest, requiredScope: string): boolean {
  if (!req.user) return false;
  const scopes = req.user.scope.split(" ");
  return scopes.includes(requiredScope);
}
