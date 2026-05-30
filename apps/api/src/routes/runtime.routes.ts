import { Router, Request, Response, NextFunction } from "express";
import prisma from "../core/db/prisma";
import { parseConfigFromObject } from "../core/config/parser";
import { buildRuntimeRouter } from "../core/api-factory/routeBuilder";
import { optionalAuth } from "../middleware/auth.middleware";
import { findLocalAppBySlug } from "../core/config/localAppStore";

const router = Router();

// ── GET /api/runtime/:slug/routes — list all routes for an app
router.get("/:slug/routes", async (req: Request, res: Response) => {
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
    let app;

    try {
      app = await prisma.app.findUnique({
        where: { slug },
      });
    } catch (dbError) {
      if (process.env.NODE_ENV === "production") {
        throw dbError;
      }

      app = await findLocalAppBySlug(slug);
    }

    if (!app) {
      res.status(404).json({
        success: false,
        error: `App "${slug}" not found`,
      });

      return;
    }

    const { config } =
      parseConfigFromObject(app.config);

    const routes = config.entities.map((entity) => ({
      entity: entity.name,

      endpoints: [
        {
          method: "GET",
          path: `/api/runtime/${slug}/${entity.name.toLowerCase()}`,
        },

        {
          method: "GET",
          path: `/api/runtime/${slug}/${entity.name.toLowerCase()}/:id`,
        },

        {
          method: "POST",
          path: `/api/runtime/${slug}/${entity.name.toLowerCase()}`,
        },

        {
          method: "PUT",
          path: `/api/runtime/${slug}/${entity.name.toLowerCase()}/:id`,
        },

        {
          method: "DELETE",
          path: `/api/runtime/${slug}/${entity.name.toLowerCase()}/:id`,
        },
      ],
    }));

    res.status(200).json({
      success: true,
      data: routes,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to list routes";

    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// ── All entity CRUD: /api/runtime/:slug/* ─────────────────────
// Dynamically loads the app config and mounts entity routes
router.use(
  "/:slug",

  optionalAuth,

  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
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
      let app;

      try {
        app = await prisma.app.findUnique({
          where: { slug },
        });
      } catch (dbError) {
        if (process.env.NODE_ENV === "production") {
          throw dbError;
        }

        app = await findLocalAppBySlug(slug);
      }

      if (!app) {
        res.status(404).json({
          success: false,
          error: `App "${slug}" not found`,
        });

        return;
      }

      const { config } =
        parseConfigFromObject(app.config);

      // Build a fresh router from current config
      const entityRouter =
        buildRuntimeRouter(config);

      // Hand off to dynamic router
      entityRouter(req, res, next);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Runtime error";

      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
);

export default router;