import { AppConfig, EntityDef, FieldDef } from "../config/types";
import prisma from "./prisma";

// ── Map config field types to Prisma field types ──────────────
function mapFieldType(type: FieldDef["type"]): string {
  const map: Record<string, string> = {
    string: "String",
    email: "String",
    password: "String",
    text: "String",
    number: "Float",
    boolean: "Boolean",
    date: "DateTime",
    relation: "String", // stored as foreign key string
  };
  return map[type] ?? "String";
}

// ── Generate a single model block ─────────────────────────────
function generateModelBlock(entity: EntityDef): string {
  const lines: string[] = [];

  lines.push(`model ${entity.name} {`);
  lines.push(`  id        String   @id @default(cuid())`);

  entity.fields.forEach((field) => {
    if (field.type === "relation") {
      // skip — relations need manual Prisma setup
      return;
    }

    const prismaType = mapFieldType(field.type);
    const optional = field.required ? "" : "?";
    const unique = field.unique ? " @unique" : "";
    const defaultVal = buildDefault(field);

    lines.push(
      `  ${field.name.padEnd(12)}${prismaType}${optional}${unique}${defaultVal}`
    );
  });

  if (entity.timestamps !== false) {
    lines.push(`  createdAt DateTime @default(now())`);
    lines.push(`  updatedAt DateTime @updatedAt`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

// ── Build @default(...) annotation ────────────────────────────
function buildDefault(field: FieldDef): string {
  if (field.defaultValue === undefined) return "";

  switch (field.type) {
    case "string":
    case "email":
    case "text":
      return ` @default("${field.defaultValue}")`;
    case "number":
      return ` @default(${field.defaultValue})`;
    case "boolean":
      return ` @default(${field.defaultValue})`;
    default:
      return "";
  }
}

// ── Generate full schema string from config ───────────────────
export function generateSchemaString(config: AppConfig): string {
  const header = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`.trim();

  const models = config.entities
    .map((entity) => generateModelBlock(entity))
    .join("\n\n");

  return `${header}\n\n${models}`;
}

// ── Dynamic CRUD using raw Prisma queries ─────────────────────
// Since config-defined entities aren't in the static schema,
// we use raw SQL for dynamic tables created at runtime

export async function dynamicFindMany(
  tableName: string,
  where?: Record<string, unknown>
): Promise<unknown[]> {
  const sanitizedTable = sanitizeIdentifier(tableName);

  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "${sanitizedTable}" ORDER BY "createdAt" DESC LIMIT 100`
    );
    return rows as unknown[];
  } catch {
    return [];
  }
}

export async function dynamicFindOne(
  tableName: string,
  id: string
): Promise<unknown | null> {
  const sanitizedTable = sanitizeIdentifier(tableName);

  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "${sanitizedTable}" WHERE id = $1 LIMIT 1`,
      id
    );
    const results = rows as unknown[];
    return results[0] ?? null;
  } catch {
    return null;
  }
}

export async function dynamicCreate(
  tableName: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const sanitizedTable = sanitizeIdentifier(tableName);

  const id = generateCuid();
  const now = new Date().toISOString();

  const allData = {
    id,
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  const columns = Object.keys(allData)
    .map((k) => `"${k}"`)
    .join(", ");

  const placeholders = Object.keys(allData)
    .map((_, i) => `$${i + 1}`)
    .join(", ");

  const values = Object.values(allData);

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${sanitizedTable}" (${columns}) VALUES (${placeholders})`,
      ...values
    );
    return { id, ...data, createdAt: now, updatedAt: now };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to create record in ${tableName}: ${message}`);
  }
}

export async function dynamicUpdate(
  tableName: string,
  id: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const sanitizedTable = sanitizeIdentifier(tableName);
  const now = new Date().toISOString();

  const updateData = { ...data, updatedAt: now };
  const setClauses = Object.keys(updateData)
    .map((k, i) => `"${k}" = $${i + 1}`)
    .join(", ");

  const values = [...Object.values(updateData), id];

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "${sanitizedTable}" SET ${setClauses} WHERE id = $${values.length}`,
      ...values
    );
    return dynamicFindOne(tableName, id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to update record in ${tableName}: ${message}`);
  }
}

export async function dynamicDelete(
  tableName: string,
  id: string
): Promise<void> {
  const sanitizedTable = sanitizeIdentifier(tableName);

  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "${sanitizedTable}" WHERE id = $1`,
      id
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to delete record in ${tableName}: ${message}`);
  }
}

// ── Create a dynamic table from an entity definition ─────────
export async function createDynamicTable(entity: EntityDef): Promise<void> {
  const sanitizedTable = sanitizeIdentifier(entity.name);

  const columnDefs = entity.fields
    .filter((f) => f.type !== "relation")
    .map((field) => {
      const sqlType = mapToSqlType(field.type);
      const notNull = field.required ? "NOT NULL" : "";
      const unique = field.unique ? "UNIQUE" : "";
      return `"${field.name}" ${sqlType} ${notNull} ${unique}`.trim();
    })
    .join(",\n  ");

  const sql = `
    CREATE TABLE IF NOT EXISTS "${sanitizedTable}" (
      "id"        TEXT PRIMARY KEY,
      ${columnDefs ? columnDefs + "," : ""}
      "createdAt" TIMESTAMP DEFAULT NOW(),
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `;

  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to create table ${sanitizedTable}: ${message}`);
  }
}

// ── Map config types to SQL types ─────────────────────────────
function mapToSqlType(type: FieldDef["type"]): string {
  const map: Record<string, string> = {
    string: "TEXT",
    email: "TEXT",
    password: "TEXT",
    text: "TEXT",
    number: "NUMERIC",
    boolean: "BOOLEAN",
    date: "TIMESTAMP",
    relation: "TEXT",
  };
  return map[type] ?? "TEXT";
}

// ── Security: sanitize table/column names ─────────────────────
function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "");
}

// ── Simple cuid-like ID generator ────────────────────────────
function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `c${timestamp}${random}`;
}