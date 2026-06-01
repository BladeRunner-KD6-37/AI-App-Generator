import type { IncomingMessage, ServerResponse } from "http";
import { app, bootstrapRuntime } from "../../apps/api/dist/index.js";

export const runtime = "nodejs";

async function ensureBootstrapped(): Promise<void> {
  await bootstrapRuntime();
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
