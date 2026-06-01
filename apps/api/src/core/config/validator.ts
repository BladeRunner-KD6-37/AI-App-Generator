import { z } from "zod";
import { AppConfig } from "./types.js";

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
        "datetime",
        "image",
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
    type: z.string().min(1),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

const WorkflowSchema = z
  .object({
    name: z.string().min(1),
    trigger: z.string().min(1),
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeFieldType(type: unknown): string {
  if (type === "datetime") {
    return "date";
  }

  if (type === "image") {
    return "string";
  }

  return typeof type === "string" ? type : "string";
}

function normalizeEntities(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isObject)
    .map((entity) => {
      const fields = Array.isArray(entity.fields)
        ? entity.fields.filter(isObject).map((field) => ({
            name: typeof field.name === "string" ? field.name : "",
            type: normalizeFieldType(field.type),
            required: typeof field.required === "boolean" ? field.required : undefined,
            unique: typeof field.unique === "boolean" ? field.unique : undefined,
            defaultValue: field.defaultValue,
            relation: isObject(field.relation)
              ? {
                  entity: typeof field.relation.entity === "string" ? field.relation.entity : "",
                  type:
                    field.relation.type === "many-to-one" || field.relation.type === "many-to-many"
                      ? field.relation.type
                      : "one-to-many",
                }
              : undefined,
          }))
        : [];

      const relations = Array.isArray(entity.relations)
        ? entity.relations.filter(isObject).map((relation) => ({
            name: typeof relation.field === "string" ? relation.field : "",
            type: "relation",
            relation: {
              entity: typeof relation.target === "string" ? relation.target : "",
              type:
                relation.type === "many-to-one" || relation.type === "many-to-many"
                  ? relation.type
                  : "one-to-many",
            },
          }))
        : [];

      return {
        name: typeof entity.name === "string" ? entity.name : "",
        fields: [...fields, ...relations].filter((field) => field.name.length > 0),
        timestamps: typeof entity.timestamps === "boolean" ? entity.timestamps : undefined,
      };
    })
    .filter((entity) => entity.name.length > 0);
}

function normalizePages(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isObject)
    .map((page) => {
      if (Array.isArray(page.components)) {
        return {
          name: typeof page.name === "string" ? page.name : "",
          slug:
            typeof page.slug === "string" && page.slug.length > 0
              ? page.slug
              : slugify(typeof page.name === "string" ? page.name : "page"),
          icon: typeof page.icon === "string" ? page.icon : undefined,
          components: page.components.filter(isObject).map((component) => ({
            type: typeof component.type === "string" ? component.type : "table",
            entity: typeof component.entity === "string" ? component.entity : "",
            title: typeof component.title === "string" ? component.title : undefined,
            fields: Array.isArray(component.fields)
              ? component.fields.filter((field): field is string => typeof field === "string")
              : undefined,
          })),
          roles: Array.isArray(page.roles)
            ? page.roles.filter((role): role is string => typeof role === "string")
            : undefined,
        };
      }

      const pageType = typeof page.type === "string" ? page.type : "detail-view";
      const title = typeof page.name === "string" ? page.name : pageType;
      const entity = typeof page.entity === "string" ? page.entity : "";

      const componentsByType: Record<string, unknown[]> = {
        "auth-login": [{ type: "detail-view", entity: "", title }],
        "auth-register": [{ type: "form", entity: "User", title }],
        feed: [{ type: "table", entity: entity || "Post", title }],
        profile: [{ type: "detail-view", entity: entity || "User", title }],
        form: [{ type: "form", entity, title }],
      };

      return {
        name: title,
        slug:
          typeof page.slug === "string" && page.slug.length > 0 ? page.slug : slugify(title),
        components: componentsByType[pageType] ?? [{ type: "detail-view", entity, title }],
        roles: ["user", "admin"],
      };
    })
    .filter((page) => page.name.length > 0 && page.slug.length > 0);
}

function normalizeWorkflows(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isObject)
    .map((workflow) => ({
      name: typeof workflow.name === "string" ? workflow.name : "",
      trigger: typeof workflow.trigger === "string" ? workflow.trigger : "on_create",
      entity: typeof workflow.entity === "string" ? workflow.entity : undefined,
      condition: typeof workflow.condition === "string" ? workflow.condition : undefined,
      actions: Array.isArray(workflow.actions)
        ? workflow.actions
            .map((action) =>
              typeof action === "string"
                ? { type: action, config: {} }
                : isObject(action)
                  ? {
                      type: typeof action.type === "string" ? action.type : "",
                      config: isObject(action.config) ? action.config : {},
                    }
                  : { type: "", config: {} },
            )
            .filter((action) => action.type.length > 0)
        : [],
    }))
    .filter((workflow) => workflow.name.length > 0);
}

function normalizeLegacyConfig(raw: unknown): unknown {
  if (!isObject(raw)) {
    return raw;
  }

  const app = isObject(raw.app) ? raw.app : null;

  return {
    ...raw,
    name: typeof raw.name === "string" ? raw.name : typeof app?.name === "string" ? app.name : "Untitled App",
    entities: normalizeEntities(raw.entities),
    pages: normalizePages(raw.pages),
    workflows: normalizeWorkflows(raw.workflows),
    auth: isObject(raw.auth)
      ? raw.auth
      : {
          providers: ["credentials"],
          roles: ["user", "admin"],
        },
  };
}

function getStarterPages(): AppConfig["pages"] {
  return [
    {
      name: "Overview",
      slug: "overview",
      components: [
        {
          type: "stat-card",
          entity: "",
          title: "Pages configured",
        },
      ],
      roles: ["user", "admin"],
    },
  ];
}

// ── Main validator — never throws ────────────────────────────
export function validateConfig(raw: unknown): ValidationResult {
  const warnings: string[] = [];
  const normalized = normalizeLegacyConfig(raw);

  // If input is not even an object, return a safe default
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    warnings.push("Config must be a JSON object. Using empty defaults.");
    const config = AppConfigSchema.parse({});
    return {
      valid: false,
      config: {
        ...config,
        pages: config.pages.length > 0 ? config.pages : getStarterPages(),
      },
      warnings,
    };
  }

  const result = AppConfigSchema.safeParse(normalized);

  if (!result.success) {
    // Collect human-readable warnings for each issue
    result.error.issues.forEach((issue) => {
      warnings.push(`[${issue.path.join(".")}] ${issue.message} — using default`);
    });

    // Still return a usable config with defaults applied
    const config = AppConfigSchema.parse({});
    return {
      valid: false,
      config: {
        ...config,
        pages: config.pages.length > 0 ? config.pages : getStarterPages(),
      },
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
    config: {
      ...result.data,
      pages: result.data.pages.length > 0 ? result.data.pages : getStarterPages(),
    } as AppConfig,
    warnings,
  };
}