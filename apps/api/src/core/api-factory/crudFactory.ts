import { Request, Response } from "express";
import {
  dynamicFindMany,
  dynamicFindOne,
  dynamicCreate,
  dynamicUpdate,
  dynamicDelete,
  createDynamicTable,
} from "../db/schemaGenerator.js";
import { EntityDef } from "../config/types.js";

// ── Response helpers ──────────────────────────────────────────
const ok = (res: Response, data: unknown) =>
  res.status(200).json({ success: true, data });

const created = (res: Response, data: unknown) =>
  res.status(201).json({ success: true, data });

const notFound = (res: Response, entity: string, id?: string) =>
  res.status(404).json({
    success: false,
    error: id ? `${entity} with id "${id}" not found` : `${entity} not found`,
  });

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ success: false, error: message });

const serverError = (res: Response, err: unknown) => {
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[CrudFactory]", message);
  return res.status(500).json({ success: false, error: message });
};

// ── Validate required fields from entity definition ───────────
function validatePayload(
  entity: EntityDef,
  body: Record<string, unknown>,
): string[] {
  const errors: string[] = [];

  entity.fields.forEach((field) => {
    if (field.required && field.type !== "relation") {
      const value = body[field.name];
      if (value === undefined || value === null || value === "") {
        errors.push(`Field "${field.name}" is required`);
      }
    }
  });

  return errors;
}

// ── Strip unknown fields from payload ─────────────────────────
function sanitizePayload(
  entity: EntityDef,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const allowedFields = entity.fields
    .filter((f) => f.type !== "relation")
    .map((f) => f.name);

  const sanitized: Record<string, unknown> = {};
  allowedFields.forEach((fieldName) => {
    if (body[fieldName] !== undefined) {
      sanitized[fieldName] = body[fieldName];
    }
  });

  return sanitized;
}

// ── Handler factory — returns all CRUD handlers for an entity ─
export function createCrudHandlers(entity: EntityDef, appSlug: string) {
  const tableName = entity.name;

  return {
    // GET /api/runtime/:entity
    async getAll(req: Request, res: Response) {
      try {
        const rows = await dynamicFindMany(tableName, appSlug);
        return ok(res, rows);
      } catch (err) {
        return serverError(res, err);
      }
    },

    // GET /api/runtime/:entity/:id
    async getOne(req: Request, res: Response) {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      if (!id) return badRequest(res, "ID is required");

      try {
        const row = await dynamicFindOne(tableName, id, appSlug);

        if (!row) return notFound(res, tableName, id);

        return ok(res, row);
      } catch (err) {
        return serverError(res, err);
      }
    },

    // POST /api/runtime/:entity
    async create(req: Request, res: Response) {
      const body = req.body as Record<string, unknown>;

      if (!body || typeof body !== "object") {
        return badRequest(res, "Request body must be a JSON object");
      }

      // Validate required fields
      const errors = validatePayload(entity, body);
      if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      // Strip fields not defined in the entity
      const sanitized = sanitizePayload(entity, body);

      try {
        const row = await dynamicCreate(tableName, sanitized, appSlug);
        return created(res, row);
      } catch (err) {
        return serverError(res, err);
      }
    },

    // PUT /api/runtime/:entity/:id
    async update(req: Request, res: Response) {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      const body = req.body as Record<string, unknown>;

      if (!id) {
        return badRequest(res, "ID is required");
      }

      if (!body || typeof body !== "object") {
        return badRequest(res, "Request body must be a JSON object");
      }

      try {
        const existing = await dynamicFindOne(tableName, id, appSlug);

        if (!existing) {
          return notFound(res, tableName, id);
        }

        const sanitized = sanitizePayload(entity, body);

        const updated = await dynamicUpdate(tableName, id, sanitized, appSlug);

        return ok(res, updated);
      } catch (err) {
        return serverError(res, err);
      }
    },

    // DELETE /api/runtime/:entity/:id
    async remove(req: Request, res: Response) {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      if (!id) {
        return badRequest(res, "ID is required");
      }

      try {
        const existing = await dynamicFindOne(tableName, id, appSlug);

        if (!existing) {
          return notFound(res, tableName, id);
        }

        await dynamicDelete(tableName, id, appSlug);

        return ok(res, {
          deleted: true,
          id,
        });
      } catch (err) {
        return serverError(res, err);
      }
    },

    // POST /api/runtime/:entity/init-table
    // Called when a new app config is registered
    async initTable(_req: Request, res: Response) {
      try {
        await createDynamicTable(entity, appSlug);
        return ok(res, {
          message: `Table "${tableName}" created successfully`,
        });
      } catch (err) {
        return serverError(res, err);
      }
    },
  };
}
