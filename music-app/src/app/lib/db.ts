// lib/db.ts
import Database from "better-sqlite3";
import path from "path";

const db = new Database(path.resolve(process.cwd(), "data.sqlite"));

// Create table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

export default db;