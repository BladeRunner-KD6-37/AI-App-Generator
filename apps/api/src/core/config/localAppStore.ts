import { promises as fs } from "fs";
import path from "path";

export interface LocalAppRecord {
  id: string;
  slug: string;
  name: string;
  config: unknown;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

const storePath = path.join(process.cwd(), ".data", "apps.json");

async function ensureStoreDir(): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
}

async function readApps(): Promise<LocalAppRecord[]> {
  try {
    const contents = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? (parsed as LocalAppRecord[]) : [];
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeApps(apps: LocalAppRecord[]): Promise<void> {
  await ensureStoreDir();
  await fs.writeFile(storePath, JSON.stringify(apps, null, 2), "utf8");
}

function makeId(): string {
  return `local-app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function findLocalAppBySlug(slug: string): Promise<LocalAppRecord | null> {
  const apps = await readApps();
  return apps.find((app) => app.slug === slug) ?? null;
}

export async function findLocalAppsByOwnerId(ownerId: string): Promise<LocalAppRecord[]> {
  const apps = await readApps();
  return apps.filter((app) => app.ownerId === ownerId);
}

export async function createLocalApp(data: {
  name: string;
  slug: string;
  config: unknown;
  ownerId: string;
}): Promise<LocalAppRecord> {
  const apps = await readApps();
  const now = new Date().toISOString();
  const app: LocalAppRecord = {
    id: makeId(),
    slug: data.slug,
    name: data.name,
    config: data.config,
    ownerId: data.ownerId,
    createdAt: now,
    updatedAt: now,
  };

  apps.push(app);
  await writeApps(apps);
  return app;
}

export async function deleteLocalApp(slug: string): Promise<boolean> {
  const apps = await readApps();
  const nextApps = apps.filter((app) => app.slug !== slug);

  if (nextApps.length === apps.length) {
    return false;
  }

  await writeApps(nextApps);
  return true;
}

export async function updateLocalApp(
  slug: string,
  data: { name?: string; config: unknown }
): Promise<LocalAppRecord | null> {
  const apps = await readApps();
  const index = apps.findIndex((app) => app.slug === slug);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  apps[index] = {
    ...apps[index],
    name: data.name ?? apps[index].name,
    config: data.config,
    updatedAt: now,
  };

  await writeApps(apps);
  return apps[index];
}