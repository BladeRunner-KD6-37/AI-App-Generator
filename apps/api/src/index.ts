import dotenv from "dotenv";

dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import authRouter from "./routes/auth.routes.js";
import configRouter, { runtimeRouters } from "./routes/config.routes.js";
import runtimeRouter from "./routes/runtime.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import githubExportRouter from "./routes/githubExport.routes.js";
import { notFoundHandler, globalErrorHandler } from "./middleware/errorHandler.js";
import prisma from "./core/db/prisma.js";
import { buildRuntimeRouter } from "./core/api-factory/routeBuilder.js";
import { parseConfigFromObject } from "./core/config/parser.js";

const app = express();
let runtimeBootstrapped = false;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const rawFrontend =
  process.env.FRONTEND_URL ||
  "https://ai-app-generator-n7bhh04ec-highoncaffienes-projects.vercel.app,http://localhost:3000";

const allowedOrigins = rawFrontend
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman, server-to-server requests, health checks, etc.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(`[CORS] Blocked origin: ${origin}`);
      console.error(
        `[CORS] Allowed origins: ${allowedOrigins.join(", ")}`
      );

      return callback(
        new Error(`Origin ${origin} not allowed by CORS`)
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
    ],
  })
);

// Handle preflight requests
app.options(/.*/, cors());

// ── Serve static files for uploads ────────────────────────────
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/config", configRouter);
app.use("/api/runtime", runtimeRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/export", githubExportRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export async function bootstrapRuntime(): Promise<void> {
  if (runtimeBootstrapped) {
    return;
  }

  try {
    const apps = await prisma.app.findMany();

    for (const appRecord of apps) {
      const { config } = parseConfigFromObject(appRecord.config);
      const router = buildRuntimeRouter(config, appRecord.slug);
      runtimeRouters.set(appRecord.slug, router);
    }

    console.log(`[Startup] Loaded ${apps.length} app(s) from the database`);
    runtimeBootstrapped = true;
  } catch (error) {
    console.error("Failed to bootstrap runtime:", error);
    throw error;
  }
}

async function startServer(): Promise<void> {
  try {
    // Allow skipping runtime bootstrap for local/dev convenience when DB isn't available
    if (process.env.SKIP_RUNTIME_BOOTSTRAP !== "1") {
      await bootstrapRuntime();
    } else {
      console.log('[Startup] SKIP_RUNTIME_BOOTSTRAP=1, skipping runtime bootstrap');
    }

    const port = process.env.PORT ? Number(process.env.PORT) : 3001;
    app.listen(port, () => {
      console.log(`API server listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

export { app };

if (process.env.VERCEL !== "1") {
  void startServer();
}