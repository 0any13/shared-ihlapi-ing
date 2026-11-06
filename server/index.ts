import express, { type ErrorRequestHandler } from 'express';
import http from 'node:http';
import path from 'node:path';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Server } from 'socket.io';
import { initDb, pool } from './db';
import { registerRoutes } from './routes';
import { setupGame, type GameServer } from './game';

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET must be set in production');

async function main() {
  await initDb();

  const app = express();
  const server = http.createServer(app);
  const io: GameServer = new Server(server);

  app.set('trust proxy', 1); // behind Render's proxy, so secure cookies work

  const PgStore = connectPgSimple(session);
  const sessionMw = session({
    store: new PgStore({ pool, createTableIfMissing: true }), // sessions survive restarts and spin-downs
    secret: process.env.SESSION_SECRET || 'dev-only-secret',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 24 * 3600 * 1000 },
  });
  app.use(express.json());
  app.use(sessionMw);
  io.engine.use(sessionMw as any); // lets sockets read req.session

  registerRoutes(app);
  setupGame(io);

  // In production the built React app is served by this same server.
  const dist = path.join(process.cwd(), 'client', 'dist');
  app.use(express.static(dist));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  };
  app.use(onError);

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}

main().catch(e => { console.error(e); process.exit(1); });
