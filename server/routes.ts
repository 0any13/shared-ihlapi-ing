import type { Express, Request, RequestHandler, Response } from 'express';
import 'express-session';
import bcrypt from 'bcryptjs';
import { get, all, run } from './db';
import { CREATOR_TIERS, ENDORSE_TIERS, tierName, nextAt } from './rules';
import type { Me, MyQuestion } from '../shared/types';

declare module 'express-session' {
  interface SessionData { user: { id: number; username: string } }
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export const DEFAULT_COLOR = '#08fce0';
const validDiscord = (l?: string) => !l || /^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/.test(l);

async function getMe(userId: number): Promise<Me> {
  const u = (await get<{ id: number; username: string; color: string }>('SELECT id, username, color FROM users WHERE id = $1', userId))!;
  const created = (await get<{ n: number }>('SELECT COUNT(*)::int AS n FROM questions WHERE author_id = $1', userId))!.n;
  const likes = (await get<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM likes l JOIN questions q ON q.id = l.question_id WHERE q.author_id = $1', userId))!.n;
  return {
    ...u, created, likes,
    creatorLevel: tierName(created, CREATOR_TIERS),
    endorsementLevel: tierName(likes, ENDORSE_TIERS),
    nextCreatorAt: nextAt(created, CREATOR_TIERS),
    nextEndorseAt: nextAt(likes, ENDORSE_TIERS),
  };
}

// Express 4 does not catch errors from async handlers, so forward them to the error middleware.
const ah = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };

const requireAuth: RequestHandler = (req, res, next) =>
  req.session.user ? next() : res.status(401).json({ error: 'Login required' });

export function registerRoutes(app: Express) {
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/register', ah(async (req, res) => {
    const { username, password, color } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || username.length > 20 || password.length < 6)
      return res.status(400).json({ error: 'Username (max 20) and password (min 6) required' });
    try {
      const r = await get<{ id: number }>('INSERT INTO users (username, password_hash, color) VALUES ($1, $2, $3) RETURNING id',
        username, await bcrypt.hash(password, 10), HEX.test(color) ? color : DEFAULT_COLOR);
      req.session.user = { id: r!.id, username };
      res.json(req.session.user);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return res.status(409).json({ error: 'Username taken' });
      throw e;
    }
  }));

  app.post('/api/login', ah(async (req, res) => {
    const { username, password } = req.body ?? {};
    const u = await get<{ id: number; username: string; password_hash: string }>('SELECT * FROM users WHERE username = $1', String(username ?? ''));
    if (!u || !(await bcrypt.compare(String(password ?? ''), u.password_hash)))
      return res.status(401).json({ error: 'Wrong username or password' });
    req.session.user = { id: u.id, username: u.username };
    res.json(req.session.user);
  }));

  app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

  app.get('/api/me', requireAuth, ah(async (req, res) => res.json(await getMe(req.session.user!.id))));

  app.post('/api/me/color', requireAuth, ah(async (req, res) => {
    const { color } = req.body ?? {};
    if (!HEX.test(color)) return res.status(400).json({ error: 'Invalid color' });
    await run('UPDATE users SET color = $1 WHERE id = $2', color, req.session.user!.id);
    res.json(await getMe(req.session.user!.id));
  }));

  app.get('/api/my-questions', requireAuth, ah(async (req, res) => {
    const rows = await all<MyQuestion>(
      `SELECT q.id, q.text, q.level,
              (SELECT COUNT(*)::int FROM likes l WHERE l.question_id = q.id) AS likes
       FROM questions q WHERE q.author_id = $1 ORDER BY q.id DESC`, req.session.user!.id);
    res.json(rows);
  }));

  app.post('/api/questions', requireAuth, ah(async (req, res) => {
    const { text, level } = req.body ?? {};
    if (typeof text !== 'string' || text.trim().length < 10 || text.length > 200 || ![1, 2, 3].includes(Number(level)))
      return res.status(400).json({ error: 'Text 10-200 chars and level 1-3 required' });
    await run('INSERT INTO questions (text, level, author_id, is_original) VALUES ($1, $2, $3, FALSE)',
      text.trim(), Number(level), req.session.user!.id);
    res.json(await getMe(req.session.user!.id));
  }));

  app.post('/api/rooms', requireAuth, ah(async (req, res) => {
    const { mode, discordLink } = req.body ?? {};
    if (!['original', 'mixed'].includes(mode)) return res.status(400).json({ error: 'Bad mode' });
    if (!validDiscord(discordLink)) return res.status(400).json({ error: 'Invalid Discord invite link' });
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    await run('INSERT INTO rooms (code, mode, host_id, discord_link) VALUES ($1, $2, $3, $4)',
      code, mode, req.session.user!.id, discordLink || null);
    res.json({ code });
  }));

  app.get('/api/rooms/:code', requireAuth, ah(async (req, res) => {
    const room = await get<{ code: string; mode: string; discord_link: string | null }>(
      'SELECT code, mode, discord_link FROM rooms WHERE code = $1', req.params.code.toUpperCase());
    room ? res.json(room) : res.status(404).json({ error: 'Room not found' });
  }));
}
