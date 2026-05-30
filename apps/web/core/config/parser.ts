import { AppConfig, EntityDef, PageDef, FieldType, ComponentType, FieldDef } from "./types";

const DefaultAuthConfig: AppConfig["auth"] = {
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

function normalizeFieldType(type: unknown): FieldType {
  if (type === "datetime") {
    return "date";
  }

  if (type === "image") {
    return "string";
  }

  return isFieldType(type) ? type : "string";
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
            type: normalizeFieldType(field.type),
            required: typeof field.required === "boolean" ? field.required : undefined,
            unique: typeof field.unique === "boolean" ? field.unique : undefined,
            defaultValue: field.defaultValue,
            relation: isObject(field.relation)
              ? {
                  entity:
                    typeof field.relation.entity === "string"
                      ? field.relation.entity
                      : "",
                  type: isRelationType(field.relation.type) ? field.relation.type : "one-to-many",
                }
              : undefined,
          }))
        : [],
      timestamps: typeof item.timestamps === "boolean" ? item.timestamps : undefined,
    }))
    .filter((entity) => entity.name.length > 0);
}

  const normalizeEntities = parseEntities;

function normalizePages(raw: unknown): PageDef[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isObject)
    .map((item) => {
      if (Array.isArray(item.components)) {
        return {
          name: typeof item.name === "string" ? item.name : "",
          slug:
            typeof item.slug === "string" && item.slug.length > 0
              ? item.slug
              : slugify(typeof item.name === "string" ? item.name : "page"),
          icon: typeof item.icon === "string" ? item.icon : undefined,
          components: item.components.filter(isObject).map((component) => ({
            type: isComponentType(component.type) ? component.type : "table",
            entity: typeof component.entity === "string" ? component.entity : "",
            title: typeof component.title === "string" ? component.title : undefined,
            fields: Array.isArray(component.fields)
              ? component.fields.filter((field): field is string => typeof field === "string")
              : undefined,
          })),
          roles: Array.isArray(item.roles)
            ? item.roles.filter((role): role is string => typeof role === "string")
            : undefined,
        };
      }

      const pageType = typeof item.type === "string" ? item.type : "detail-view";
      const entity = typeof item.entity === "string" ? item.entity : "";
      const title = typeof item.name === "string" ? item.name : pageType;

      const components: PageDef["components"] =
        pageType === "auth-register"
          ? [{ type: "form", entity: "User", title }]
          : pageType === "feed"
          ? [{ type: "table", entity: entity || "Post", title }]
          : pageType === "profile"
          ? [{ type: "detail-view", entity: entity || "User", title }]
          : pageType === "form"
          ? [{ type: "form", entity, title }]
          : [{ type: "detail-view", entity, title }];

      return {
        name: title,
        slug:
          typeof item.slug === "string" && item.slug.length > 0 ? item.slug : slugify(title),
        components,
        roles: ["user", "admin"],
      };
    })
    .filter((page) => page.name.length > 0 && page.slug.length > 0);
}

function normalizeWorkflows(raw: unknown): AppConfig["workflows"] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isObject)
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : "",
      trigger: typeof item.trigger === "string" ? item.trigger : "on_create",
      entity: typeof item.entity === "string" ? item.entity : undefined,
      condition: typeof item.condition === "string" ? item.condition : undefined,
      actions: Array.isArray(item.actions)
        ? item.actions
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
            type: isComponentType(component.type) ? component.type : "table",
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
  const normalized = normalizeLegacyConfig(raw);

  if (!isObject(normalized)) {
    return {
      ...defaultAppConfig,
      pages: getStarterPages(),
    };
  }

  const pages = normalizePages(normalized.pages);

  return {
    name: typeof normalized.name === "string" ? normalized.name : defaultAppConfig.name,
    entities: parseEntities(normalized.entities),
    pages: pages.length > 0 ? pages : getStarterPages(),
    workflows: normalizeWorkflows(normalized.workflows),
    auth: parseAuth(normalized.auth),
  };
}

function isFieldType(value: unknown): value is FieldType {
  return (
    value === "string" ||
    value === "number" ||
    value === "boolean" ||
    value === "date" ||
    value === "datetime" ||
    value === "image" ||
    value === "relation" ||
    value === "email" ||
    value === "password" ||
    value === "text"
  );
}

function isComponentType(value: unknown): value is ComponentType {
  return (
    value === "table" ||
    value === "form" ||
    value === "stat-card" ||
    value === "chart" ||
    value === "detail-view"
  );
}

function isRelationType(value: unknown): value is NonNullable<FieldDef["relation"]>["type"] {
  return value === "one-to-many" || value === "many-to-one" || value === "many-to-many";
}

export function getEntityByName(config: AppConfig, name: string): EntityDef | null {
  const normalized = name.toLowerCase();
  return config.entities.find((entity) => entity.name.toLowerCase() === normalized) ?? null;
}

export function getPageBySlug(config: AppConfig, slug: string): PageDef | null {
  return config.pages.find((page) => page.slug === slug) ?? null;
}
