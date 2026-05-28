import { AppConfig, EntityDef, PageDef } from "./types";

const DefaultAuthConfig = {
  providers: ["credentials"],
  roles: ["user", "admin"],
};

const defaultAppConfig: AppConfig = {
  name: "Untitled App",
  entities: [],
  pages: [],
  workflows: [],
  auth: DefaultAuthConfig,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntities(raw: unknown): EntityDef[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isObject)
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : "",
      fields: Array.isArray(item.fields)
        ? item.fields.filter(isObject).map((field) => ({
            name: typeof field.name === "string" ? field.name : "",
            type:
              field.type === "string" ||
              field.type === "number" ||
              field.type === "boolean" ||
              field.type === "date" ||
              field.type === "relation" ||
              field.type === "email" ||
              field.type === "password" ||
              field.type === "text"
                ? field.type
                : "string",
            required: typeof field.required === "boolean" ? field.required : undefined,
            unique: typeof field.unique === "boolean" ? field.unique : undefined,
            defaultValue: field.defaultValue,
            relation: isObject(field.relation)
              ? {
                  entity:
                    typeof field.relation.entity === "string"
                      ? field.relation.entity
                      : "",
                  type:
                    field.relation.type === "one-to-many" ||
                    field.relation.type === "many-to-one" ||
                    field.relation.type === "many-to-many"
                      ? field.relation.type
                      : "one-to-many",
                }
              : undefined,
          }))
        : [],
      timestamps: typeof item.timestamps === "boolean" ? item.timestamps : undefined,
    }))
    .filter((entity) => entity.name.length > 0);
}

function parsePages(raw: unknown): PageDef[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isObject)
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : "",
      slug: typeof item.slug === "string" ? item.slug : "",
      icon: typeof item.icon === "string" ? item.icon : undefined,
      components: Array.isArray(item.components)
        ? item.components.filter(isObject).map((component) => ({
            type:
              component.type === "table" ||
              component.type === "form" ||
              component.type === "stat-card" ||
              component.type === "chart" ||
              component.type === "detail-view"
                ? component.type
                : "table",
            entity: typeof component.entity === "string" ? component.entity : "",
            title: typeof component.title === "string" ? component.title : undefined,
            fields: Array.isArray(component.fields)
              ? component.fields.filter((field): field is string => typeof field === "string")
              : undefined,
          }))
        : [],
      roles: Array.isArray(item.roles)
        ? item.roles.filter((role): role is string => typeof role === "string")
        : undefined,
    }))
    .filter((page) => page.name.length > 0 && page.slug.length > 0);
}

function parseWorkflows(raw: unknown): AppConfig["workflows"] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isObject)
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : "",
      trigger: typeof item.trigger === "string" ? item.trigger : "",
      entity: typeof item.entity === "string" ? item.entity : undefined,
      condition: typeof item.condition === "string" ? item.condition : undefined,
      actions: Array.isArray(item.actions)
        ? item.actions
            .filter(isObject)
            .map((action) => ({
              type: typeof action.type === "string" ? action.type : "",
              config: isObject(action.config) ? action.config : {},
            }))
            .filter((action) => action.type.length > 0)
        : [],
    }))
    .filter((workflow) => workflow.name.length > 0 && workflow.trigger.length > 0);
}

function parseAuth(raw: unknown): AppConfig["auth"] {
  if (!isObject(raw)) {
    return DefaultAuthConfig;
  }

  return {
    providers: Array.isArray(raw.providers)
      ? raw.providers.filter((provider): provider is string => typeof provider === "string")
      : DefaultAuthConfig.providers,
    roles: Array.isArray(raw.roles)
      ? raw.roles.filter((role): role is string => typeof role === "string")
      : DefaultAuthConfig.roles,
  };
}

export function parseConfig(raw: unknown): AppConfig {
  if (!isObject(raw)) {
    return defaultAppConfig;
  }

  return {
    name: typeof raw.name === "string" ? raw.name : defaultAppConfig.name,
    entities: parseEntities(raw.entities),
    pages: parsePages(raw.pages),
    workflows: parseWorkflows(raw.workflows),
    auth: parseAuth(raw.auth),
  };
}

export function getEntityByName(config: AppConfig, name: string): EntityDef | null {
  const normalized = name.toLowerCase();
  return config.entities.find((entity) => entity.name.toLowerCase() === normalized) ?? null;
}

export function getPageBySlug(config: AppConfig, slug: string): PageDef | null {
  return config.pages.find((page) => page.slug === slug) ?? null;
}
