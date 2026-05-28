import { Request, Response, NextFunction } from "express";

// ── Custom error class with HTTP status ───────────────────────
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── 404 handler — mount before the error handler ─────────────
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

// ── Global error handler — must be last middleware ────────────
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  console.error(`[Error] ${req.method} ${req.originalUrl}`, err);

  // Known app error
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Prisma errors
  if (isPrismaError(err)) {
    const { status, message } = handlePrismaError(err);
    res.status(status).json({ success: false, error: message });
    return;
  }

  // JWT errors
  if (err instanceof Error && err.name === "JsonWebTokenError") {
    res.status(401).json({ success: false, error: "Invalid token" });
    return;
  }

  if (err instanceof Error && err.name === "TokenExpiredError") {
    res.status(401).json({ success: false, error: "Token expired" });
    return;
  }

  // Syntax error in JSON body
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ success: false, error: "Invalid JSON in request body" });
    return;
  }

  // Unknown error — don't leak internals in production
  const message =
    process.env.NODE_ENV === "development" && err instanceof Error
      ? err.message
      : "Internal server error";

  res.status(500).json({ success: false, error: message });
}

// ── Detect Prisma-specific errors ─────────────────────────────
function isPrismaError(err: unknown): err is { code: string; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as Record<string, unknown>).code === "string"
  );
}

// ── Map Prisma error codes to HTTP responses ──────────────────
function handlePrismaError(err: { code: string; message: string }): {
  status: number;
  message: string;
} {
  switch (err.code) {
    case "P2002":
      return { status: 409, message: "A record with this value already exists" };
    case "P2025":
      return { status: 404, message: "Record not found" };
    case "P2003":
      return { status: 400, message: "Related record not found" };
    case "P2014":
      return { status: 400, message: "Invalid relation in request" };
    default:
      return { status: 500, message: "Database error" };
  }
}