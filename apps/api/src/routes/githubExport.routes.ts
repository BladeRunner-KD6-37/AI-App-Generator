import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../middleware/validate.middleware.js";
import { startGitHubExport, getGitHubExportStatus } from "../features/github-export/githubExportService.js";

const router = Router();

const exportSchema = z.object({
  appSlug: z.string().min(1, "App slug is required"),
  repositoryName: z
    .string()
    .min(1, "Repository name is required")
    .regex(/^[a-zA-Z0-9._-]+$/, "Repository name may only contain letters, numbers, dots, underscores, and hyphens"),
  isPrivate: z.boolean(),
  githubToken: z.string().min(1, "GitHub token is required"),
});

const statusSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
});

router.use(authenticate);

router.post("/github", validateBody(exportSchema), async (req: Request, res: Response) => {
  const job = startGitHubExport(req.user!.id, req.body);
  res.status(202).json({ success: true, data: job });
});

router.get("/github/status", validateQuery(statusSchema), async (req: Request, res: Response) => {
  const { jobId } = req.query as { jobId: string };
  const job = getGitHubExportStatus(jobId);

  if (!job) {
    res.status(404).json({ success: false, error: "Export job not found" });
    return;
  }

  res.status(200).json({ success: true, data: job });
});

export default router;