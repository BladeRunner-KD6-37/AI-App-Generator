import { promises as fs } from "fs";
import path from "path";

export interface LocalAuthUser {
  id: string;
  email: string;
  name: string | null;
  password: string;
  role: string;
  createdAt: string;
}

const storePath = path.join(process.cwd(), ".data", "auth-users.json");

async function ensureStoreDir(): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
}

async function readUsers(): Promise<LocalAuthUser[]> {
  try {
    const contents = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? (parsed as LocalAuthUser[]) : [];
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeUsers(users: LocalAuthUser[]): Promise<void> {
  await ensureStoreDir();
  await fs.writeFile(storePath, JSON.stringify(users, null, 2), "utf8");
}

export async function findLocalUserByEmail(email: string): Promise<LocalAuthUser | null> {
  const users = await readUsers();
  return users.find((user) => user.email === email) ?? null;
}

export async function findLocalUserById(id: string): Promise<LocalAuthUser | null> {
  const users = await readUsers();
  return users.find((user) => user.id === id) ?? null;
}

export async function createLocalUser(data: {
  email: string;
  name?: string | null;
  password: string;
  role?: string;
}): Promise<LocalAuthUser> {
  const users = await readUsers();
  const user: LocalAuthUser = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: data.email,
    name: data.name ?? null,
    password: data.password,
    role: data.role ?? "user",
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeUsers(users);

  return user;
}

export async function updateLocalUserName(email: string, name: string): Promise<LocalAuthUser | null> {
  const users = await readUsers();
  const index = users.findIndex((user) => user.email === email);

  if (index === -1) {
    return null;
  }

  users[index] = { ...users[index], name };
  await writeUsers(users);
  return users[index];
}