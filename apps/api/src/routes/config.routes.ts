import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../core/db/prisma";
import { parseConfigFromObject } from "../core/config/parser";
import { buildRuntimeRouter } from "../core/api-factory/routeBuilder";
import { getRoutesSummary } from "../core/api-factory/routeBuilder";
import { createDynamicTable } from "../core/db/schemaGenerator";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// ── All config routes require authentication ──────────────────
router.use(authenticate);

// ── Validation schemas ────────────────────────────────────────
const CreateAppSchema = z.object({
  name: z.string().min(1, "App name is required"),

  slug: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must be lowercase letters, numbers, and hyphens only"
    ),

  config: z.record(
    z.string(),
    z.unknown()
  ),
});

const UpdateConfigSchema = z.object({
  config: z.record(
    z.string(),
    z.unknown()
  ),
});

// ── POST /api/config — create a new app ───────────────────────
router.post(
  "/",
  validateBody(CreateAppSchema),
  async (req: Request, res: Response) => {
    const { name, slug, config: rawConfig } = req.body;

    try {
      // Check slug uniqueness
      const existing = await prisma.app.findUnique({ where: { slug } });
      if (existing) {
        res.status(409).json({
          success: false,
          error: `An app with slug "${slug}" already exists`,
        });
        return;
      }

      // Validate and repair the config
      const { config, warnings } = parseConfigFromObject(rawConfig);

      // Create the app record
      const app = await prisma.app.create({
        data: {
          name,
          slug,
          config: config as object,
          ownerId: req.user!.id,
        },
      });

      // Provision dynamic tables for all entities in the config
      const tableResults: { entity: string; status: string }[] = [];

      for (const entity of config.entities) {
        try {
          await createDynamicTable(entity);
          tableResults.push({ entity: entity.name, status: "created" });
        } catch {
          tableResults.push({ entity: entity.name, status: "failed" });
        }
      }

      // Return summary
      res.status(201).json({
        success: true,
        data: {
          app,
          warnings,
          tables: tableResults,
          routes: getRoutesSummary(config),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create app";
      res.status(500).json({ success: false, error: message });
    }
  }
);

// ── GET /api/config — list all apps owned by current user ─────
router.get("/", async (req: Request, res: Response) => {
  try {
    const apps = await prisma.app.findMany({
      where: { ownerId: req.user!.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({ success: true, data: apps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch apps";
    res.status(500).json({ success: false, error: message });
  }
});

// ── GET /api/config/:slug — get a single app with its config ──
router.get("/:slug", async (req: Request, res: Response) => {
  const slug = Array.isArray(req.params.slug)
    ? req.params.slug[0]
    : req.params.slug;

  if (!slug) {
    res.status(400).json({
      success: false,
      error: "Slug is required",
    });
    return;
  }

  try {
    const app = await prisma.app.findUnique({
      where: { slug },
    });

    if (!app) {
      res.status(404).json({
        success: false,
        error: `App "${slug}" not found`,
      });

      return;
    }

    const { config, warnings } =
      parseConfigFromObject(app.config);

    res.status(200).json({
      success: true,
      data: {
        ...app,
        config,
        warnings,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to fetch app";

    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// ── PUT /api/config/:slug — update an app's config ───────────
router.get("/:slug", async (req: Request, res: Response) => {
  const slug = Array.isArray(req.params.slug)
    ? req.params.slug[0]
    : req.params.slug;

  if (!slug) {
    res.status(400).json({
      success: false,
      error: "Slug is required",
    });
    return;
  }

  try {
    const app = await prisma.app.findUnique({
      where: { slug },
    });

    if (!app) {
      res.status(404).json({
        success: false,
        error: `App "${slug}" not found`,
      });

      return;
    }

    const { config, warnings } =
      parseConfigFromObject(app.config);

    res.status(200).json({
      success: true,
      data: {
        ...app,
        config,
        warnings,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to fetch app";

    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// ── DELETE /api/config/:slug — delete an app ─────────────────
router.delete(
  "/:slug",
  requireRole("admin"),

  async (req: Request, res: Response) => {
    const slug = Array.isArray(req.params.slug)
      ? req.params.slug[0]
      : req.params.slug;

    if (!slug) {
      res.status(400).json({
        success: false,
        error: "Slug is required",
      });

      return;
    }

    try {
      const app = await prisma.app.findUnique({
        where: { slug },
      });

      if (!app) {
        res.status(404).json({
          success: false,
          error: `App "${slug}" not found`,
        });

        return;
      }

      await prisma.app.delete({
        where: { slug },
      });

      res.status(200).json({
        success: true,

        data: {
          deleted: true,
          slug,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to delete app";

      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
);

export default router;