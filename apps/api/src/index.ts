import dotenv from "dotenv";

dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes";
import configRouter, { runtimeRouters } from "./routes/config.routes";
import runtimeRouter from "./routes/runtime.routes";
import notificationRouter from "./routes/notification.routes";
import { notFoundHandler, globalErrorHandler } from "./middleware/errorHandler";
import prisma from "./core/db/prisma";
import { buildRuntimeRouter } from "./core/api-factory/routeBuilder";
import { parseConfigFromObject } from "./core/config/parser";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
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

app.use(notFoundHandler);
app.use(globalErrorHandler);

async function startServer(): Promise<void> {
  try {
    const apps = await prisma.app.findMany();

    for (const appRecord of apps) {
      const { config } = parseConfigFromObject(appRecord.config);
      const router = buildRuntimeRouter(config);
      runtimeRouters.set(appRecord.slug, router);
    }

    console.log(`[Startup] Loaded ${apps.length} app(s) from the database`);

    const port = process.env.PORT ? Number(process.env.PORT) : 3001;
    app.listen(port, () => {
      console.log(`API server listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
