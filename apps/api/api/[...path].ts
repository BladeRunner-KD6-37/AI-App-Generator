import type { IncomingMessage, ServerResponse } from "http";
import { app, bootstrapRuntime } from "../dist/index.js";

let bootstrapPromise: Promise<void> | null = null;

async function ensureBootstrapped(): Promise<void> {
  const existingPromise = bootstrapPromise;
  if (existingPromise) {
    return existingPromise;
  }

  const newPromise = bootstrapRuntime();
  bootstrapPromise = newPromise;
  return newPromise;
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
