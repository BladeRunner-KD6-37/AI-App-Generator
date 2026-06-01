let warnedAboutFallbackSecret = false;
export function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret) {
        return secret;
    }
    if (process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET is not set in environment variables");
    }
    if (!warnedAboutFallbackSecret) {
        console.warn("JWT_SECRET is not set; using a development fallback secret");
        warnedAboutFallbackSecret = true;
    }
    return "meta-runtime-dev-jwt-secret";
}
