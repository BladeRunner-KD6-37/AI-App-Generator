export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "relation"
  | "email"
  | "password"
  | "text";

export interface FieldDef {
  name: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  relation?: {
    entity: string;
    type: "one-to-many" | "many-to-one" | "many-to-many";
  };
}

export interface EntityDef {
  name: string;
  fields: FieldDef[];
  timestamps?: boolean;
}

export type ComponentType =
  | "table"
  | "form"
  | "stat-card"
  | "chart"
  | "detail-view";

export interface PageComponent {
  type: ComponentType;
  entity: string;
  title?: string;
  fields?: string[];
}

export interface PageDef {
  name: string;
  slug: string;
  icon?: string;
  components: PageComponent[];
  roles?: string[];
}

export interface WorkflowAction {
  type: string;
  config: Record<string, unknown>;
}

export interface WorkflowDef {
  name: string;
  trigger: string;
  entity?: string;
  condition?: string;
  actions: WorkflowAction[];
}

export interface AuthConfig {
  providers: string[];
  roles: string[];
}

export interface AppConfig {
  name: string;
  entities: EntityDef[];
  pages: PageDef[];
  workflows: WorkflowDef[];
  auth: AuthConfig;
}
