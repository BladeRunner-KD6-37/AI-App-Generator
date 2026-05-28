import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

// ── Validate request body against a Zod schema ────────────────
// Usage: router.post("/", validateBody(MySchema), handler)
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = formatZodErrors(result.error);

      res.status(400).json({
        success: false,
        error: "Validation failed",
        errors,
      });

      return;
    }

    // Replace body with parsed/coerced data
    req.body = result.data;

    next();
  };
}

// ── Validate query params against a Zod schema ────────────────
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = formatZodErrors(result.error);

      res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        errors,
      });

      return;
    }

    // Parsed query data
    req.query = result.data as Request["query"];

    next();
  };
}

// ── Format Zod errors into readable messages ──────────────────
function formatZodErrors(error: ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};

  error.issues.forEach((issue) => {
    const path = issue.path.join(".") || "root";

    formatted[path] = issue.message;
  });

  return formatted;
}