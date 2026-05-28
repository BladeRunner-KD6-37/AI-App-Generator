import { AppConfig } from "./types";
import { validateConfig, ValidationResult } from "./validator";

// ── Parse raw JSON string safely ──────────────────────────────
export function parseConfigFromString(raw: string): ValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      config: getDefaultConfig(),
      warnings: ["Invalid JSON string. Could not parse config."],
    };
  }

  return validateConfig(parsed);
}

// ── Parse from an already-decoded object (e.g. from DB) ───────
export function parseConfigFromObject(raw: unknown): ValidationResult {
  return validateConfig(raw);
}

// ── Safe default config when everything fails ─────────────────
export function getDefaultConfig(): AppConfig {
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
export function getEntity(config: AppConfig, entityName: string) {
  return config.entities.find(
    (e) => e.name.toLowerCase() === entityName.toLowerCase()
  ) ?? null;
}

// ── Check if a page exists in a config ───────────────────────
export function getPage(config: AppConfig, slug: string) {
  return config.pages.find((p) => p.slug === slug) ?? null;
}