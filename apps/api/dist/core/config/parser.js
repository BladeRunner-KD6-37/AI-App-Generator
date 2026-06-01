import { validateConfig } from "./validator.js";
// ── Parse raw JSON string safely ──────────────────────────────
export function parseConfigFromString(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return {
            valid: false,
            config: getDefaultConfig(),
            warnings: ["Invalid JSON string. Could not parse config."],
        };
    }
    return validateConfig(parsed);
}
// ── Parse from an already-decoded object (e.g. from DB) ───────
export function parseConfigFromObject(raw) {
    return validateConfig(raw);
}
// ── Safe default config when everything fails ─────────────────
export function getDefaultConfig() {
    return {
        name: "Untitled App",
        entities: [],
        pages: [],
        workflows: [],
        auth: {
            providers: ["credentials"],
            roles: ["user", "admin"],
        },
    };
}
// ── Check if an entity exists in a config ────────────────────
export function getEntity(config, entityName) {
    return config.entities.find((e) => e.name.toLowerCase() === entityName.toLowerCase()) ?? null;
}
// ── Check if a page exists in a config ───────────────────────
export function getPage(config, slug) {
    return config.pages.find((p) => p.slug === slug) ?? null;
}
