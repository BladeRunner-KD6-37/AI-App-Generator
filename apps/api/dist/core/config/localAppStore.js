import { promises as fs } from "fs";
import path from "path";
const storePath = path.join(process.cwd(), ".data", "apps.json");
async function ensureStoreDir() {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
}
async function readApps() {
    try {
        const contents = await fs.readFile(storePath, "utf8");
        const parsed = JSON.parse(contents);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}
async function writeApps(apps) {
    await ensureStoreDir();
    await fs.writeFile(storePath, JSON.stringify(apps, null, 2), "utf8");
}
function makeId() {
    return `local-app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
export async function findLocalAppBySlug(slug) {
    const apps = await readApps();
    return apps.find((app) => app.slug === slug) ?? null;
}
export async function findLocalAppsByOwnerId(ownerId) {
    const apps = await readApps();
    return apps.filter((app) => app.ownerId === ownerId);
}
export async function createLocalApp(data) {
    const apps = await readApps();
    const now = new Date().toISOString();
    const app = {
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
export async function deleteLocalApp(slug) {
    const apps = await readApps();
    const nextApps = apps.filter((app) => app.slug !== slug);
    if (nextApps.length === apps.length) {
        return false;
    }
    await writeApps(nextApps);
    return true;
}
