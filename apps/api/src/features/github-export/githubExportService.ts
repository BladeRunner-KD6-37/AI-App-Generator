import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import prisma from "../../core/db/prisma.js";
import { parseConfigFromObject } from "../../core/config/parser.js";
import { AppConfig, EntityDef, WorkflowDef } from "../../core/config/types.js";
import { AppError } from "../../middleware/errorHandler.js";

const execFile = promisify(execFileCallback);

export type GitHubExportState = "queued" | "running" | "completed" | "failed";

export interface GitHubExportRequest {
  appSlug: string;
  repositoryName: string;
  isPrivate: boolean;
  githubToken: string;
}

export interface GitHubExportStatus {
  jobId: string;
  appSlug: string;
  repositoryName: string;
  isPrivate: boolean;
  state: GitHubExportState;
  progress: number;
  message: string;
  repositoryUrl?: string;
  cloneUrl?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

const exportJobs = new Map<string, GitHubExportStatus>();

export function startGitHubExport(userId: string, request: GitHubExportRequest): GitHubExportStatus {
  const jobId = randomUUID();
  const now = new Date().toISOString();

  const job: GitHubExportStatus = {
    jobId,
    appSlug: request.appSlug,
    repositoryName: request.repositoryName,
    isPrivate: request.isPrivate,
    state: "queued",
    progress: 0,
    message: "Queued for export",
    startedAt: now,
    updatedAt: now,
  };

  exportJobs.set(jobId, job);
  void runGitHubExport(userId, request, jobId);
  return job;
}

export function getGitHubExportStatus(jobId: string): GitHubExportStatus | null {
  return exportJobs.get(jobId) ?? null;
}

async function runGitHubExport(userId: string, request: GitHubExportRequest, jobId: string): Promise<void> {
  updateJob(jobId, { state: "running", progress: 5, message: "Loading application metadata" });

  let tempDir = "";

  try {
    const appRecord = await prisma.app.findFirst({
      where: {
        slug: request.appSlug,
        ownerId: userId,
      },
    });

    if (!appRecord) {
      throw new AppError(`App \"${request.appSlug}\" not found`, 404, "APP_NOT_FOUND");
    }

    const parsed = parseConfigFromObject(appRecord.config);

    if (!parsed.valid) {
      throw new AppError(
        `App \"${request.appSlug}\" has an invalid configuration and cannot be exported`,
        422,
        "EXPORT_GENERATION_FAILED",
      );
    }

    const config = parsed.config;

    updateJob(jobId, { progress: 15, message: "Generating project files" });

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "meta-runtime-export-"));
    const files = buildProjectFiles(config, request.repositoryName);

    for (const file of files) {
      const filePath = path.join(tempDir, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content, "utf8");
    }

    updateJob(jobId, { progress: 45, message: "Creating GitHub repository" });

    const repo = await createGitHubRepository(request.githubToken, request.repositoryName, request.isPrivate);

    updateJob(jobId, { progress: 65, message: "Committing generated code" });

    await initializeRepository(tempDir, repo.clone_url, request.repositoryName);

    updateJob(jobId, { progress: 90, message: "Pushing to GitHub" });

    await pushRepository(tempDir);

    updateJob(jobId, {
      state: "completed",
      progress: 100,
      message: `Exported to ${repo.full_name}`,
      repositoryUrl: repo.html_url,
      cloneUrl: repo.clone_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub export failed";
    updateJob(jobId, {
      state: "failed",
      progress: 100,
      message,
      error: message,
    });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function updateJob(jobId: string, partial: Partial<GitHubExportStatus>): void {
  const current = exportJobs.get(jobId);

  if (!current) {
    return;
  }

  const updated: GitHubExportStatus = {
    ...current,
    ...partial,
    updatedAt: new Date().toISOString(),
  };

  exportJobs.set(jobId, updated);
}

async function createGitHubRepository(
  token: string,
  repositoryName: string,
  isPrivate: boolean,
): Promise<{ clone_url: string; html_url: string; full_name: string }> {
  const response = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: repositoryName,
      private: isPrivate,
      auto_init: false,
    }),
  });

  const payload = await readGitHubResponse(response);

  if (!response.ok) {
    throw mapGitHubError(response.status, payload);
  }

  return payload as { clone_url: string; html_url: string; full_name: string };
}

async function readGitHubResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mapGitHubError(status: number, payload: Record<string, unknown>): AppError {
  const message = typeof payload.message === "string" ? payload.message : "GitHub API request failed";
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const hasAlreadyExists = errors.some((error) => {
    if (typeof error !== "object" || error === null) {
      return false;
    }

    const typed = error as Record<string, unknown>;
    return typeof typed.message === "string" && typed.message.toLowerCase().includes("already exists");
  });

  if (status === 401 || status === 403) {
    return new AppError("Invalid GitHub token", 401, "INVALID_GITHUB_TOKEN");
  }

  if (status === 422 && hasAlreadyExists) {
    return new AppError("Repository already exists", 409, "REPOSITORY_ALREADY_EXISTS");
  }

  if (status >= 500) {
    return new AppError("GitHub API failure", 502, "GITHUB_API_FAILURE");
  }

  return new AppError(message, status >= 400 ? status : 502, "GITHUB_API_FAILURE");
}

async function initializeRepository(directory: string, cloneUrl: string, repositoryName: string): Promise<void> {
  await runGit(directory, ["init", "-b", "main"]);
  await runGit(directory, ["config", "user.name", "MetaRuntime Export Bot"]);
  await runGit(directory, ["config", "user.email", "export@metaruntime.local"]);
  await runGit(directory, ["remote", "add", "origin", cloneUrl]);
  await runGit(directory, ["add", "."]);
  await runGit(directory, ["commit", "-m", `Initial export for ${repositoryName}`]);
}

async function pushRepository(directory: string): Promise<void> {
  await runGit(directory, ["push", "-u", "origin", "main"]);
}

async function runGit(directory: string, args: string[]): Promise<void> {
  try {
    await execFile("git", args, { cwd: directory });
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const message = stderr.trim() || (error instanceof Error ? error.message : "Git command failed");
    throw new AppError(message, 500, "GIT_COMMAND_FAILED");
  }
}

interface FileEntry {
  path: string;
  content: string;
}

function buildProjectFiles(config: AppConfig, repositoryName: string): FileEntry[] {
  return [
    { path: "package.json", content: buildPackageJson(repositoryName) },
    { path: "README.md", content: buildReadme(config, repositoryName) },
    { path: ".gitignore", content: buildGitignore() },
    { path: ".env.example", content: buildEnvExample() },
    { path: "tsconfig.json", content: buildRootTsConfig() },
    { path: "frontend/index.html", content: buildFrontendHtml() },
    { path: "frontend/vite.config.ts", content: buildFrontendViteConfig() },
    { path: "frontend/tsconfig.json", content: buildFrontendTsConfig() },
    { path: "frontend/src/main.tsx", content: buildFrontendMain() },
    { path: "frontend/src/App.tsx", content: buildFrontendApp(config) },
    { path: "frontend/src/styles.css", content: buildFrontendStyles() },
    { path: "frontend/src/api.ts", content: buildFrontendApi() },
    { path: "frontend/src/generated/app-config.ts", content: buildGeneratedConfig(config) },
    { path: "backend/tsconfig.json", content: buildBackendTsConfig() },
    { path: "backend/src/server.ts", content: buildBackendServer() },
    { path: "backend/src/app.ts", content: buildBackendApp(config) },
    { path: "backend/src/generated/app-config.ts", content: buildGeneratedConfig(config) },
    { path: "database/schema.prisma", content: buildDatabaseSchema(config) },
    { path: "workflows/index.ts", content: buildWorkflowFile(config.workflows) },
  ];
}

function buildPackageJson(repositoryName: string): string {
  return JSON.stringify(
    {
      name: sanitizePackageName(repositoryName),
      private: true,
      type: "module",
      scripts: {
        "dev:backend": "tsx watch backend/src/server.ts",
        "dev:frontend": "vite --config frontend/vite.config.ts",
        dev: "concurrently -k \"npm run dev:backend\" \"npm run dev:frontend\"",
        "build:backend": "tsc -p backend/tsconfig.json",
        "build:frontend": "vite build --config frontend/vite.config.ts",
        build: "npm run build:backend && npm run build:frontend",
        "start:backend": "node backend/dist/server.js",
        "preview:frontend": "vite preview --config frontend/vite.config.ts",
      },
      dependencies: {
        cors: "^2.8.6",
        express: "^5.2.1",
        react: "^19.2.4",
        "react-dom": "^19.2.4",
      },
      devDependencies: {
        "@types/cors": "^2.8.19",
        "@types/express": "^5.0.6",
        "@types/node": "^25.9.1",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@vitejs/plugin-react": "^5.1.0",
        concurrently: "^9.2.1",
        prisma: "^5.22.0",
        tsx: "^4.20.5",
        typescript: "^5.9.3",
        vite: "^7.1.0",
      },
    },
    null,
    2,
  );
}

function buildGitignore(): string {
  return ["node_modules", "dist", ".env", ".DS_Store", "frontend/dist", "backend/dist"].join("\n");
}

function buildEnvExample(): string {
  return [
    "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/metaruntime",
    "PORT=3001",
    "FRONTEND_URL=http://localhost:5173",
  ].join("\n");
}

function buildRootTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        rootDir: ".",
        outDir: "dist",
        types: ["node"],
      },
      include: ["backend/src/**/*.ts", "frontend/src/**/*.ts", "frontend/src/**/*.tsx", "database/**/*.prisma", "workflows/**/*.ts"],
      exclude: ["node_modules", "dist"],
    },
    null,
    2,
  );
}

function buildFrontendHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MetaRuntime Export</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}

function buildFrontendViteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
  },
});`;
}

function buildFrontendTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
      },
      include: ["src"],
    },
    null,
    2,
  );
}

function buildFrontendMain(): string {
  return `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./styles.css.js";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);`;
}

function buildFrontendApi(): string {
  return `const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? response.statusText);
  }

  return (payload.data ?? payload) as T;
}

export function getRuntimeRows(entity: string) {
  return request<Record<string, unknown>[]>("/api/runtime/" + encodeURIComponent(entity));
}

export function createRuntimeRow(entity: string, data: Record<string, unknown>) {
  return request("/api/runtime/" + encodeURIComponent(entity), {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateRuntimeRow(entity: string, id: string, data: Record<string, unknown>) {
  return request("/api/runtime/" + encodeURIComponent(entity) + "/" + encodeURIComponent(id), {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteRuntimeRow(entity: string, id: string) {
  return request("/api/runtime/" + encodeURIComponent(entity) + "/" + encodeURIComponent(id), {
    method: "DELETE",
  });
}`;
}

function buildFrontendApp(config: AppConfig): string {
  const pageBlocks = config.pages.map((page) => buildPageSummary(page.name, page.slug, page.components.length)).join("\n");
  const workflowBlocks = config.workflows.map((workflow) => buildWorkflowSummary(workflow)).join("\n");
  const tableHeadCells = config.entities[0]?.fields.map((field) => "<th>" + escapeHtml(field.name) + "</th>").join("") ?? "";
  const tableBodyCells = config.entities[0]?.fields.map((field) => "<td>{String(row[\"" + field.name + "\"] ?? \"-\")}</td>").join("") ?? "";

  return `import { useMemo, useState } from "react";
import { appConfig } from "./generated/app-config.js";
import { createRuntimeRow, deleteRuntimeRow, getRuntimeRows } from "./api.js";

const entityFields = ${JSON.stringify(config.entities.reduce<Record<string, string[]>>((acc, entity) => {
    acc[entity.name] = entity.fields.map((field) => field.name);
    return acc;
  }, {}), null, 2)};

function useEntityData(entity: string) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const data = await getRuntimeRows(entity);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load data");
    } finally {
      setLoading(false);
    }
  }

  return { rows, setRows, loading, error, refresh };
}

export default function App() {
  const [activeEntity, setActiveEntity] = useState(appConfig.entities[0]?.name ?? "");
  const currentEntity = useMemo(() => appConfig.entities.find((entity) => entity.name === activeEntity) ?? appConfig.entities[0], [activeEntity]);
  const entityData = useEntityData(currentEntity?.name ?? "");

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Generated from runtime metadata</p>
          <h1>{appConfig.name}</h1>
          <p className="lead">A runnable full-stack application scaffold generated directly from the metadata export.</p>
        </div>
        <div className="hero-card">
          <strong>{appConfig.entities.length}</strong>
          <span>entities</span>
          <strong>{appConfig.pages.length}</strong>
          <span>pages</span>
          <strong>{appConfig.workflows.length}</strong>
          <span>workflows</span>
        </div>
      </header>

      <section className="grid">
        <aside className="panel">
          <h2>Entities</h2>
          <div className="stack">
            {appConfig.entities.map((entity) => (
              <button key={entity.name} type="button" className={entity.name === activeEntity ? "chip active" : "chip"} onClick={() => setActiveEntity(entity.name)}>
                {entity.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <h2>{currentEntity?.name ?? "Overview"}</h2>
          {entityData.error ? <p className="error">{entityData.error}</p> : null}
          {entityData.loading ? <p>Loading records...</p> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  ${tableHeadCells}
                </tr>
              </thead>
              <tbody>
                {entityData.rows.map((row) => (
                  <tr key={String(row.id ?? Math.random())}>
                    <td>{String(row.id ?? "-")}</td>
                    ${tableBodyCells}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="panel">
        <h2>Pages</h2>
        <div className="cards">
          ${pageBlocks}
        </div>
      </section>

      <section className="panel">
        <h2>Workflows</h2>
        <div className="cards">
          ${workflowBlocks}
        </div>
      </section>
    </main>
  );
}`;
}

function buildEntitySection(entity: EntityDef): string {
  return `<!-- ${entity.name}: ${entity.fields.map((field) => field.name).join(", ")} -->`;
}

function buildPageSummary(name: string, slug: string, componentCount: number): string {
  return `<article className="card"><h3>${escapeHtml(name)}</h3><p>/${escapeHtml(slug)}</p><span>${componentCount} components</span></article>`;
}

function buildWorkflowSummary(workflow: WorkflowDef): string {
  return `<article className="card"><h3>${escapeHtml(workflow.name)}</h3><p>Trigger: ${escapeHtml(workflow.trigger)}</p><span>${workflow.actions.length} actions</span></article>`;
}

function buildFrontendStyles(): string {
  return `:root {
  color-scheme: dark;
  font-family: Inter, system-ui, sans-serif;
  background: #09111f;
  color: #e5eefb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(98, 141, 255, 0.25), transparent 30%),
    linear-gradient(160deg, #09111f 0%, #111b2f 100%);
}

button, input, textarea {
  font: inherit;
}

.shell {
  width: min(1200px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0 64px;
}

.hero, .panel {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(8, 15, 28, 0.82);
  backdrop-filter: blur(20px);
  border-radius: 28px;
  box-shadow: 0 24px 70px rgba(2, 8, 23, 0.35);
}

.hero {
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1fr) 220px;
  padding: 32px;
}

.hero h1 {
  margin: 10px 0 12px;
  font-size: clamp(2.4rem, 4vw, 4.5rem);
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  color: #8fb1ff;
  font-size: 0.75rem;
}

.lead {
  margin: 0;
  color: #afbdd4;
  max-width: 60ch;
}

.hero-card {
  display: grid;
  grid-template-columns: 1fr;
  align-content: center;
  gap: 6px;
  padding: 20px;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(75, 111, 255, 0.18), rgba(75, 111, 255, 0.05));
}

.hero-card strong {
  font-size: 2rem;
}

.hero-card span {
  color: #aab8d0;
  margin-bottom: 6px;
}

.grid {
  display: grid;
  gap: 24px;
  grid-template-columns: 280px minmax(0, 1fr);
  margin-top: 24px;
}

.panel {
  padding: 24px;
}

.stack, .cards {
  display: grid;
  gap: 12px;
}

.chip {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.7);
  color: inherit;
  padding: 12px 16px;
  border-radius: 999px;
  text-align: left;
}

.chip.active {
  background: linear-gradient(135deg, #4f7cff, #7c5cff);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 16px;
}

th, td {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  text-align: left;
}

.card {
  padding: 16px;
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.error {
  color: #ff9b9b;
}`;
}

function buildGeneratedConfig(config: AppConfig): string {
  return `export const appConfig = ${JSON.stringify(config, null, 2)} as const;`;
}

function buildBackendTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        rootDir: "src",
        outDir: "dist",
        types: ["node"],
      },
      include: ["src/**/*.ts"],
      exclude: ["dist", "node_modules"],
    },
    null,
    2,
  );
}

function buildBackendServer(): string {
  return `import app from "./app.js";

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log("Backend listening on http://localhost:" + port);
});`;
}

function buildBackendApp(config: AppConfig): string {
  const workflowBlocks = config.workflows.map((workflow) => JSON.stringify(workflow, null, 2)).join(",\n");

  return `import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { appConfig } from "./generated/app-config.js";

const prisma = new PrismaClient();
const app = express();
const workflows = [${workflowBlocks}];

app.use(cors({
  origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", app: appConfig.name });
});

function getModel(entityName: string) {
  return (prisma as Record<string, unknown>)[entityName.toLowerCase()] as Record<string, unknown> & {
    findMany: (args?: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<unknown | null>;
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    delete: (args: unknown) => Promise<unknown>;
  };
}

async function runWorkflows(event: "create" | "update" | "delete", entity: string, payload: Record<string, unknown>) {
  for (const workflow of workflows) {
    if (workflow.entity && workflow.entity !== entity) {
      continue;
    }
    if (workflow.trigger !== "on_" + event) {
      continue;
    }
    if (workflow.condition) {
      try {
        const matches = new Function("data", "return Boolean(" + workflow.condition + ");")(payload) as boolean;
        if (!matches) {
          continue;
        }
      } catch {
        continue;
      }
    }
    console.log("[workflow] " + workflow.name + " triggered for " + entity);
  }
}

for (const entity of appConfig.entities) {
  const model = getModel(entity.name);
  const basePath = "/api/runtime/" + entity.name.toLowerCase();

  app.get(basePath, async (_req, res) => {
    try {
      const rows = await model.findMany({ orderBy: { createdAt: "desc" } });
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to fetch rows" });
    }
  });

  app.post(basePath, async (req, res) => {
    try {
      const record = await model.create({ data: req.body });
      await runWorkflows("create", entity.name, req.body as Record<string, unknown>);
      res.status(201).json({ success: true, data: record });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to create row" });
    }
  });

  app.put(basePath + "/:id", async (req, res) => {
    try {
      const record = await model.update({ where: { id: req.params.id }, data: req.body });
      await runWorkflows("update", entity.name, req.body as Record<string, unknown>);
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to update row" });
    }
  });

  app.delete(basePath + "/:id", async (req, res) => {
    try {
      const record = await model.delete({ where: { id: req.params.id } });
      await runWorkflows("delete", entity.name, { id: req.params.id });
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to delete row" });
    }
  });
}

export default app;`;
}

function buildDatabaseSchema(config: AppConfig): string {
  const modelBlocks = config.entities
    .map((entity) => {
      const fieldLines = entity.fields
        .filter((field) => field.type !== "relation")
        .map((field) => `  ${field.name} ${mapPrismaType(field)}${field.required ? "" : "?"}${field.unique ? " @unique" : ""}`);

      const relationLines = entity.fields
        .filter((field) => field.type === "relation")
        .map((field) => `  ${field.name} String${field.required ? "" : "?"}`);

      return [`model ${entity.name} {`, "  id        String   @id @default(cuid())", ...fieldLines, ...relationLines, "  createdAt DateTime @default(now())", "  updatedAt DateTime @updatedAt", "}"].join("\n");
    })
    .join("\n\n");

  return `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

${modelBlocks}`;
}

function mapPrismaType(field: { type: EntityDef["fields"][number]["type"] }): string {
  const map: Record<string, string> = {
    string: "String",
    email: "String",
    password: "String",
    text: "String",
    number: "Float",
    boolean: "Boolean",
    date: "DateTime",
    relation: "String",
  };

  return map[field.type] ?? "String";
}

function buildWorkflowFile(workflows: WorkflowDef[]): string {
  return `export const workflows = ${JSON.stringify(workflows, null, 2)} as const;

export function listWorkflowNames(): string[] {
  return workflows.map((workflow) => workflow.name);
}`;
}

function buildReadme(config: AppConfig, repositoryName: string): string {
  const entityList = config.entities.map((entity) => `- ${entity.name}`).join("\n") || "- No entities configured";
  const pageList = config.pages.map((page) => `- ${page.name} (/${page.slug})`).join("\n") || "- No pages configured";
  const workflowList = config.workflows.map((workflow) => `- ${workflow.name} (${workflow.trigger})`).join("\n") || "- No workflows configured";

  return `# ${config.name}

Generated export for ${repositoryName}.

## Structure

- frontend - Vite React application
- backend - Express API with Prisma access
- database/schema.prisma - Generated Prisma schema
- workflows - Workflow definitions

## Entities

${entityList}

## Pages

${pageList}

## Workflows

${workflowList}

## Setup

1. Copy .env.example to .env
2. Set DATABASE_URL
3. Run npm install
4. Run npm run dev

## Scripts

- npm run dev - Start backend and frontend together
- npm run build - Build backend and frontend
- npm run start:backend - Start the backend after building
`;
}

function sanitizePackageName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "meta-runtime-export";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}