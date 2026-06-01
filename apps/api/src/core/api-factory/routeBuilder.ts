import { Router } from "express";
import { AppConfig } from "../config/types.ts";
import { createCrudHandlers } from "./crudFactory.ts";

// ── Build all dynamic routes from an app config ───────────────
// Returns a router with CRUD endpoints for every entity
// Mount this at /api/runtime in your main Express app

export function buildRuntimeRouter(config: AppConfig, appSlug: string): Router {
  const router = Router();

  if (!config.entities || config.entities.length === 0) {
    return router; // empty router — no entities, no routes
  }

  config.entities.forEach((entity) => {
    if (!entity.name) return; // skip invalid entity

    const handlers = createCrudHandlers(entity, appSlug);
    const base = `/${entity.name.toLowerCase()}`;

    // ── Init table (called once on config registration) ───────
    router.post(`${base}/init-table`, handlers.initTable);

    // ── Standard CRUD ─────────────────────────────────────────
    router.get(base, handlers.getAll);
    router.get(`${base}/:id`, handlers.getOne);
    router.post(base, handlers.create);
    router.put(`${base}/:id`, handlers.update);
    router.delete(`${base}/:id`, handlers.remove);

    console.log(`[RouteBuilder] Registered routes for entity: ${entity.name}`);
  });

  return router;
}

// ── Route summary — useful for debugging ─────────────────────
export function getRoutesSummary(config: AppConfig): string[] {
  if (!config.entities) return [];

  return config.entities.flatMap((entity) => {
    const base = `/api/runtime/${entity.name.toLowerCase()}`;
    return [
      `GET    ${base}`,
      `GET    ${base}/:id`,
      `POST   ${base}`,
      `PUT    ${base}/:id`,
      `DELETE ${base}/:id`,
      `POST   ${base}/init-table`,
    ];
  });
}