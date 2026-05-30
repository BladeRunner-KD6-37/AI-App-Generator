import type { IncomingMessage, ServerResponse } from "http";
import { app, bootstrapRuntime } from "../apps/api/src/index";

let bootstrapPromise: Promise<void> | null = null;

async function ensureBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapRuntime();
  }

  return bootstrapPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await ensureBootstrapped();
  await new Promise<void>((resolve, reject) => {
    app(req as never, res as never, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}