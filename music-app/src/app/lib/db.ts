// music-app/src/app/lib/db.ts
import Database from "better-sqlite3";
import path from "path";

// Open or create the SQLite database
const dbPath = path.resolve(process.cwd(), "data.sqlite");
const db = new Database(dbPath);

// Enable WAL for concurrency (optional)
db.pragma("journal_mode = WAL");

// Create 'projects' table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

// --- Helper functions ---
export const getAllProjectsForUser = (userId: string) =>
  db.prepare("SELECT * FROM projects WHERE user_id = ?").all(userId);

export const getProjectById = (projectId: string, userId: string) =>
  db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(projectId, userId);

export const createProject = (id: string, userId: string, name: string) => {
  const updatedAt = new Date().toISOString();
  db.prepare("INSERT INTO projects (id, user_id, name, updated_at) VALUES (?, ?, ?, ?)")
    .run(id, userId, name, updatedAt);
  return { id, name, updated_at: updatedAt };
};

export const updateProjectName = (projectId: string, userId: string, name: string) => {
  const updatedAt = new Date().toISOString();
  const info = db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(name, updatedAt, projectId, userId);
  if (info.changes === 0) return null;
  return getProjectById(projectId, userId);
};

export const deleteProject = (projectId: string, userId: string) => {
  const info = db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(projectId, userId);
  return info.changes > 0;
};

export default db;
