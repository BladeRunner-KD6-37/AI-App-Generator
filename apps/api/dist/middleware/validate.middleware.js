// ── Validate request body against a Zod schema ────────────────
// Usage: router.post("/", validateBody(MySchema), handler)
export function validateBody(schema) {
    return (req, res, next) => {
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
export function validateQuery(schema) {
    return (req, res, next) => {
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
        req.query = result.data;
        next();
    };
}
// ── Format Zod errors into readable messages ──────────────────
function formatZodErrors(error) {
    const formatted = {};
    error.issues.forEach((issue) => {
        const path = issue.path.join(".") || "root";
        formatted[path] = issue.message;
    });
    return formatted;
}
