// One-off: copy accounts, custom questions, rooms and likes from the old SQLite file into Postgres.
// Usage:  npm run migrate:sqlite            (reads ./strangers.db)
//         npm run migrate:sqlite -- path/to/strangers.db
import { DatabaseSync } from 'node:sqlite';
import { pool, initDb, get } from '../server/db';

const lite = new DatabaseSync(process.argv[2] || 'strangers.db');
const rows = (sql: string) => lite.prepare(sql).all() as Record<string, any>[];

async function main() {
  await initDb(); // creates tables and loads the original questions from questions.json
  const existing = await get<{ n: number }>('SELECT COUNT(*)::int AS n FROM users');
  if (existing!.n > 0) { console.log('Postgres already has users, nothing done.'); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const users = rows('SELECT * FROM users');
    for (const u of users) {
      await client.query('INSERT INTO users (id, username, password_hash, color) VALUES ($1, $2, $3, $4)',
        [u.id, u.username, u.password_hash, u.color ?? '#08fce0']);
    }
    const rooms = rows('SELECT * FROM rooms');
    for (const r of rooms) {
      await client.query('INSERT INTO rooms (id, code, mode, host_id, discord_link) VALUES ($1, $2, $3, $4, $5)',
        [r.id, r.code, r.mode, r.host_id, r.discord_link]);
    }

    // Question ids are re-assigned (the originals already took ids 1..N in Postgres), so keep an old->new map for the likes.
    const idMap = new Map<number, number>();
    const custom = rows('SELECT * FROM questions WHERE is_original = 0');
    for (const q of custom) {
      const res = await client.query('INSERT INTO questions (text, level, author_id, is_original) VALUES ($1, $2, $3, FALSE) RETURNING id',
        [q.text, q.level, q.author_id]);
      idMap.set(q.id, res.rows[0].id);
    }
    let likes = 0;
    for (const l of rows('SELECT * FROM likes')) {
      const nq = idMap.get(l.question_id);
      if (!nq) continue;
      await client.query('INSERT INTO likes (question_id, user_id, room_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [nq, l.user_id, l.room_id]);
      likes++;
    }

    for (const t of ['users', 'rooms']) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1))`);
    }
    await client.query('COMMIT');
    console.log(`Migrated ${users.length} users, ${rooms.length} rooms, ${custom.length} custom questions, ${likes} likes.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

main().then(() => pool.end()).catch(e => { console.error(e); process.exit(1); });
