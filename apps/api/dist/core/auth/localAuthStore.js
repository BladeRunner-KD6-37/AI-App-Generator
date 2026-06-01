import { promises as fs } from "fs";
import path from "path";
const storePath = path.join(process.cwd(), ".data", "auth-users.json");
async function ensureStoreDir() {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
}
async function readUsers() {
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
async function writeUsers(users) {
    await ensureStoreDir();
    await fs.writeFile(storePath, JSON.stringify(users, null, 2), "utf8");
}
export async function findLocalUserByEmail(email) {
    const users = await readUsers();
    return users.find((user) => user.email === email) ?? null;
}
export async function findLocalUserById(id) {
    const users = await readUsers();
    return users.find((user) => user.id === id) ?? null;
}
export async function createLocalUser(data) {
    const users = await readUsers();
    const user = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        email: data.email,
        name: data.name ?? null,
        password: data.password,
        profilePictureUrl: data.profilePictureUrl ?? null,
        role: data.role ?? "user",
        createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeUsers(users);
    return user;
}
export async function updateLocalUserName(email, name) {
    const users = await readUsers();
    const index = users.findIndex((user) => user.email === email);
    if (index === -1) {
        return null;
    }
    users[index] = { ...users[index], name };
    await writeUsers(users);
    return users[index];
}
export async function updateLocalUser(id, updates) {
    const users = await readUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index === -1) {
        return null;
    }
    users[index] = { ...users[index], ...updates };
    await writeUsers(users);
    return users[index];
}
