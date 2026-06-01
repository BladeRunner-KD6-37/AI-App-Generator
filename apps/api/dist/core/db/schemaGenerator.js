import { promises as fs } from "fs";
import path from "path";
import prisma from "./prisma.js";
const runtimeStoreRoot = path.join(process.cwd(), ".data", "runtime");
async function getLocalRuntimeFilePath(appSlug, tableName) {
    const sanitizedTable = sanitizeIdentifier(tableName).toLowerCase() || "table";
    const dir = path.join(runtimeStoreRoot, sanitizeIdentifier(appSlug));
    await fs.mkdir(dir, { recursive: true });
    return path.join(dir, `${sanitizedTable}.json`);
}
async function readLocalRuntimeRows(appSlug, tableName) {
    try {
        const filePath = await getLocalRuntimeFilePath(appSlug, tableName);
        const contents = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(contents);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (err) {
        if (err instanceof Error && "code" in err && err.code === "ENOENT") {
            return [];
        }
        throw err;
    }
}
async function writeLocalRuntimeRows(appSlug, tableName, rows) {
    const filePath = await getLocalRuntimeFilePath(appSlug, tableName);
    await fs.writeFile(filePath, JSON.stringify(rows, null, 2), "utf8");
}
async function ensureLocalRuntimeTable(appSlug, tableName) {
    const filePath = await getLocalRuntimeFilePath(appSlug, tableName);
    try {
        await fs.access(filePath);
    }
    catch {
        await fs.writeFile(filePath, "[]", "utf8");
    }
}
// ── Map config field types to Prisma field types ──────────────
function mapFieldType(type) {
    const map = {
        string: "String",
        email: "String",
        password: "String",
        text: "String",
        number: "Float",
        boolean: "Boolean",
        date: "DateTime",
        datetime: "DateTime",
        image: "String",
        relation: "String", // stored as foreign key string
    };
    return map[type] ?? "String";
}
// ── Generate a single model block ─────────────────────────────
function generateModelBlock(entity) {
    const lines = [];
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
        lines.push(`  ${field.name.padEnd(12)}${prismaType}${optional}${unique}${defaultVal}`);
    });
    if (entity.timestamps !== false) {
        lines.push(`  createdAt DateTime @default(now())`);
        lines.push(`  updatedAt DateTime @updatedAt`);
    }
    lines.push(`}`);
    return lines.join("\n");
}
// ── Build @default(...) annotation ────────────────────────────
function buildDefault(field) {
    if (field.defaultValue === undefined)
        return "";
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
export function generateSchemaString(config) {
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
export async function dynamicFindMany(tableName, appSlug) {
    const sanitizedTable = sanitizeIdentifier(tableName);
    try {
        const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${sanitizedTable}" ORDER BY "createdAt" DESC LIMIT 100`);
        return rows;
    }
    catch {
        if (!appSlug) {
            return [];
        }
        const rows = await readLocalRuntimeRows(appSlug, tableName);
        return rows.sort((a, b) => {
            const aCreated = new Date(String(a.createdAt)).getTime();
            const bCreated = new Date(String(b.createdAt)).getTime();
            return bCreated - aCreated;
        });
    }
}
export async function dynamicFindOne(tableName, id, appSlug) {
    const sanitizedTable = sanitizeIdentifier(tableName);
    try {
        const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${sanitizedTable}" WHERE id = $1 LIMIT 1`, id);
        const results = rows;
        return results[0] ?? null;
    }
    catch {
        if (!appSlug) {
            return null;
        }
        const rows = await readLocalRuntimeRows(appSlug, tableName);
        return rows.find((row) => String(row.id) === id) ?? null;
    }
}
export async function dynamicCreate(tableName, data, appSlug) {
    const sanitizedTable = sanitizeIdentifier(tableName);
    const id = generateCuid();
    const allData = {
        id,
        ...data,
    };
    const columns = Object.keys(allData)
        .map((k) => `"${k}"`)
        .concat(['"createdAt"', '"updatedAt"'])
        .join(", ");
    const placeholders = Object.keys(allData)
        .map((_, i) => `$${i + 1}`)
        .concat(["NOW()", "NOW()"])
        .join(", ");
    const values = Object.values(allData);
    try {
        await prisma.$executeRawUnsafe(`INSERT INTO "${sanitizedTable}" (${columns}) VALUES (${placeholders})`, ...values);
        const now = new Date();
        return { id, ...data, createdAt: now, updatedAt: now };
    }
    catch (err) {
        if (!appSlug) {
            const message = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to create record in ${tableName}: ${message}`);
        }
        await ensureLocalRuntimeTable(appSlug, tableName);
        const now = new Date().toISOString();
        const row = { id, ...data, createdAt: now, updatedAt: now };
        const rows = await readLocalRuntimeRows(appSlug, tableName);
        rows.unshift(row);
        await writeLocalRuntimeRows(appSlug, tableName, rows);
        return row;
    }
}
export async function dynamicUpdate(tableName, id, data, appSlug) {
    const sanitizedTable = sanitizeIdentifier(tableName);
    const setClauses = Object.keys(data)
        .map((k, i) => `"${k}" = $${i + 1}`)
        .concat([`"updatedAt" = NOW()`])
        .join(", ");
    const values = [...Object.values(data), id];
    try {
        await prisma.$executeRawUnsafe(`UPDATE "${sanitizedTable}" SET ${setClauses} WHERE id = $${values.length}`, ...values);
        return dynamicFindOne(tableName, id, appSlug);
    }
    catch (err) {
        if (!appSlug) {
            const message = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to update record in ${tableName}: ${message}`);
        }
        const rows = await readLocalRuntimeRows(appSlug, tableName);
        const index = rows.findIndex((row) => String(row.id) === id);
        if (index === -1) {
            throw new Error(`Record not found: ${id}`);
        }
        const now = new Date().toISOString();
        rows[index] = { ...rows[index], ...data, updatedAt: now };
        await writeLocalRuntimeRows(appSlug, tableName, rows);
        return rows[index];
    }
}
export async function dynamicDelete(tableName, id, appSlug) {
    const sanitizedTable = sanitizeIdentifier(tableName);
    try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${sanitizedTable}" WHERE id = $1`, id);
    }
    catch (err) {
        if (!appSlug) {
            const message = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to delete record in ${tableName}: ${message}`);
        }
        const rows = await readLocalRuntimeRows(appSlug, tableName);
        const filteredRows = rows.filter((row) => String(row.id) !== id);
        await writeLocalRuntimeRows(appSlug, tableName, filteredRows);
    }
}
// ── Create a dynamic table from an entity definition ─────────
export async function createDynamicTable(entity, appSlug) {
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
    }
    catch (err) {
        if (!appSlug) {
            const message = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to create table ${sanitizedTable}: ${message}`);
        }
        await ensureLocalRuntimeTable(appSlug, entity.name);
    }
}
// ── Map config types to SQL types ─────────────────────────────
function mapToSqlType(type) {
    const map = {
        string: "TEXT",
        email: "TEXT",
        password: "TEXT",
        text: "TEXT",
        number: "NUMERIC",
        boolean: "BOOLEAN",
        date: "TIMESTAMP",
        datetime: "TIMESTAMP",
        image: "TEXT",
        relation: "TEXT",
    };
    return map[type] ?? "TEXT";
}
// ── Security: sanitize table/column names ─────────────────────
function sanitizeIdentifier(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, "");
}
// ── Simple cuid-like ID generator ────────────────────────────
function generateCuid() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `c${timestamp}${random}`;
}
