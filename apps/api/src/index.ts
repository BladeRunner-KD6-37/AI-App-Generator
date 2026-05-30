import dotenv from "dotenv";

dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes";
import configRouter, { runtimeRouters } from "./routes/config.routes";
import runtimeRouter from "./routes/runtime.routes";
import notificationRouter from "./routes/notification.routes";
import githubExportRouter from "./routes/githubExport.routes";
import { notFoundHandler, globalErrorHandler } from "./middleware/errorHandler";
import prisma from "./core/db/prisma";
import { buildRuntimeRouter } from "./core/api-factory/routeBuilder";
import { parseConfigFromObject } from "./core/config/parser";

const app = express();
let runtimeBootstrapped = false;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
const rawFrontend = process.env.FRONTEND_URL || "http://localhost:3000";
const allowedOrigins = rawFrontend.split(",").map((s) => s.trim());

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }

  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

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
      const router = buildRuntimeRouter(config);
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
