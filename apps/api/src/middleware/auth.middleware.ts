import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ── Extend Express Request to carry user info ─────────────────
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

// ── Token payload shape ───────────────────────────────────────
interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

// ── Verify JWT and attach user to request ─────────────────────
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Missing or malformed authorization header",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET is not set in environment variables");
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid or expired token";
    res.status(401).json({ success: false, error: message });
  }
}

// ── Role-based access control ─────────────────────────────────
// Usage: router.get("/admin", authenticate, requireRole("admin"), handler)
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${roles.join(" or ")}`,
      });
      return;
    }

    next();
  };
}

// ── Optional auth — attaches user if token present ───────────
// Does not reject if no token — useful for public routes
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET ?? "";
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = decoded;
  } catch {
    // Invalid token — just skip, don't block the request
  }

  next();
}