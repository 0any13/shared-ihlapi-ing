import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and paste your Neon connection string.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,        // Neon suspends idle computes, so don't hold connections open
  connectionTimeoutMillis: 20_000,  // ...and allow time for a cold start
});
// Without this, a dropped idle connection (Neon suspending) would crash the whole process.
pool.on('error', e => console.error('pg pool error:', e.message));

/* ---------- tiny typed query helpers ($1, $2, ... placeholders) ---------- */
export const get = async <T>(sql: string, ...p: unknown[]): Promise<T | undefined> => (await pool.query(sql, p)).rows[0] as T | undefined;
export const all = async <T>(sql: string, ...p: unknown[]): Promise<T[]> => (await pool.query(sql, p)).rows as T[];
export const run = (sql: string, ...p: unknown[]) => pool.query(sql, p);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#08fce0'
);
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
  author_id INTEGER REFERENCES users(id),
  is_original BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('original','mixed')),
  host_id INTEGER NOT NULL REFERENCES users(id),
  discord_link TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One like per user per question, ever (not per room)
CREATE TABLE IF NOT EXISTS likes (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  PRIMARY KEY (question_id, user_id)
);
`;

/** Keep the ORIGINAL questions in sync with questions.json. Community questions are never touched. */
async function syncOriginals() {
  const file = path.join(process.cwd(), 'questions.json');
  const questions: { level: number; text: string }[] = JSON.parse(fs.readFileSync(file, 'utf8'));
  const key = (level: number, text: string) => `${level}|${text}`;
  const wanted = new Map(questions.map(q => [key(q.level, q.text.trim()), q]));

  const existing = await all<{ id: number; text: string; level: number }>('SELECT id, text, level FROM questions WHERE is_original = TRUE');
  const have = new Set<string>();
  let added = 0, removed = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of existing) {
      const k = key(r.level, r.text);
      if (wanted.has(k) && !have.has(k)) have.add(k);
      else { await client.query('DELETE FROM questions WHERE id = $1', [r.id]); removed++; } // likes cascade
    }
    for (const [k, q] of wanted) {
      if (!have.has(k)) { await client.query('INSERT INTO questions (text, level, is_original) VALUES ($1, $2, TRUE)', [q.text.trim(), q.level]); added++; }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  if (added || removed) console.log(`Original questions synced: +${added} -${removed}`);
}

export async function initDb() {
  await pool.query(SCHEMA);
  await syncOriginals();
}
