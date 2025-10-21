import Database from "better-sqlite3";
import path from "path";
import bcrypt from "bcryptjs";

const dbPath = path.resolve(process.cwd(), "data.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// --- Tables ---
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

// --- USER HELPERS ---
export const createUser = (email: string, password: string) => {
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (existing) throw new Error("User already exists");

  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, email, passwordHash, now, now);

  return { id, email };
};

export const getUserByEmail = (email: string) =>
  db.prepare("SELECT * FROM users WHERE email = ?").get(email);

export const getUserById = (id: string) =>
  db.prepare("SELECT * FROM users WHERE id = ?").get(id);

// --- PROJECT HELPERS ---
export const getAllProjectsForUser = (userId: string) =>
  db.prepare("SELECT * FROM projects WHERE user_id = ?").all(userId);

export const getProjectById = (projectId: string, userId: string) =>
  db
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId);

export const createProject = (id: string, userId: string, name: string) => {
  const updatedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO projects (id, user_id, name, updated_at) VALUES (?, ?, ?, ?)"
  ).run(id, userId, name, updatedAt);
  return { id, name, updated_at: updatedAt };
};

export const updateProjectName = (
  projectId: string,
  userId: string,
  name: string
) => {
  const updatedAt = new Date().toISOString();
  const info = db
    .prepare(
      "UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    )
    .run(name, updatedAt, projectId, userId);
  if (info.changes === 0) return null;
  return getProjectById(projectId, userId);
};

export const deleteProject = (projectId: string, userId: string) => {
  const info = db
    .prepare("DELETE FROM projects WHERE id = ? AND user_id = ?")
    .run(projectId, userId);
  return info.changes > 0;
};

export default db;