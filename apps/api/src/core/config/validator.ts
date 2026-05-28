import { z } from "zod";
import { AppConfig } from "./types";

// ── Field schema ──────────────────────────────────────────────
const FieldSchema = z
  .object({
    name: z.string().min(1),
    type: z
      .enum([
        "string",
        "number",
        "boolean",
        "date",
        "relation",
        "email",
        "password",
        "text",
      ])
      .catch("string"), // unknown type → fallback to string, never throws
    required: z.boolean().default(false),
    unique: z.boolean().default(false),
    defaultValue: z.unknown().optional(),
    relation: z
      .object({
        entity: z.string(),
        type: z.enum(["one-to-many", "many-to-one", "many-to-many"]),
      })
      .optional(),
  })
  .passthrough(); // keep unknown keys, don't reject them

// ── Entity schema ─────────────────────────────────────────────
const EntitySchema = z
  .object({
    name: z.string().min(1),
    fields: z.array(FieldSchema).default([]),
    timestamps: z.boolean().default(true),
  })
  .passthrough();

// ── Page component schema ─────────────────────────────────────
const PageComponentSchema = z
  .object({
    type: z
      .enum(["table", "form", "stat-card", "chart", "detail-view"])
      .catch("table"),
    entity: z.string(),
    title: z.string().optional(),
    fields: z.array(z.string()).optional(),
  })
  .passthrough();

// ── Page schema ───────────────────────────────────────────────
const PageSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    icon: z.string().optional(),
    components: z.array(PageComponentSchema).default([]),
    roles: z.array(z.string()).default(["user", "admin"]),
  })
  .passthrough();

// ── Workflow schema ───────────────────────────────────────────
const WorkflowActionSchema = z
  .object({
    type: z.enum([
      "send_notification",
      "send_email",
      "webhook",
      "db_write",
    ]),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

const WorkflowSchema = z
  .object({
    name: z.string().min(1),
    trigger: z.enum([
      "on_create",
      "on_update",
      "on_delete",
      "scheduled",
    ]),
    entity: z.string().optional(),
    condition: z.string().optional(),
    actions: z.array(WorkflowActionSchema).default([]),
  })
  .passthrough();

// ── Auth schema ───────────────────────────────────────────────
const AuthSchema = z
  .object({
    providers: z.array(z.string()).default(["credentials"]),
    roles: z.array(z.string()).default(["user", "admin"]),
  })
  .default({ providers: ["credentials"], roles: ["user", "admin"] });

// ── Root app config schema ────────────────────────────────────
const AppConfigSchema = z
  .object({
    name: z.string().default("Untitled App"),
    entities: z.array(EntitySchema).default([]),
    pages: z.array(PageSchema).default([]),
    workflows: z.array(WorkflowSchema).default([]),
    auth: AuthSchema,
  })
  .passthrough();

// ── Validation result type ────────────────────────────────────
export interface ValidationResult {
  valid: boolean;
  config: AppConfig;
  warnings: string[];
}

// ── Main validator — never throws ────────────────────────────
export function validateConfig(raw: unknown): ValidationResult {
  const warnings: string[] = [];

  // If input is not even an object, return a safe default
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    warnings.push("Config must be a JSON object. Using empty defaults.");
    return {
      valid: false,
      config: AppConfigSchema.parse({}),
      warnings,
    };
  }

  const result = AppConfigSchema.safeParse(raw);

  if (!result.success) {
    // Collect human-readable warnings for each issue
    result.error.issues.forEach((issue) => {
      warnings.push(`[${issue.path.join(".")}] ${issue.message} — using default`);
    });

    // Still return a usable config with defaults applied
    return {
      valid: false,
      config: AppConfigSchema.parse({}),
      warnings,
    };
  }

  // Check for unknown component types and warn (but don't reject)
  result.data.pages.forEach((page) => {
    page.components.forEach((comp) => {
      const knownTypes = ["table", "form", "stat-card", "chart", "detail-view"];
      if (!knownTypes.includes(comp.type)) {
        warnings.push(
          `Page "${page.name}" has unknown component type "${comp.type}" — will render fallback`
        );
      }
    });
  });

  return {
    valid: true,
    config: result.data as AppConfig,
    warnings,
  };
}