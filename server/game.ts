import type { Server } from 'socket.io';
import type { Request } from 'express';
import { get, all, run } from './db';
import { DEFAULT_COLOR } from './routes';
import { canAdvance, canFinish, newDrawnBy, type DrawnBy } from './rules';
import type { ClientToServerEvents, ServerToClientEvents, GameState, Level, LikeState } from '../shared/types';

export interface SocketData { userId: number }
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

interface RoomRow { id: number; code: string; mode: 'original' | 'mixed'; host_id: number; discord_link: string | null }
interface QuestionRow { id: number; text: string; level: Level; is_original: boolean; author_id: number | null }
interface Player { id: number; username: string; color: string }
interface Live {
  room: RoomRow;
  players: Player[];
  turnIndex: number;
  card: (QuestionRow & { likes: number; seq: number }) | null;
  awaitingPick: boolean;
  answererId: number | null;
  hands: number[];
  drawerSpeaking: boolean;
  drawn: Set<number>;
  seq: number;
  spoken: number[];
  level: Level;
  drawnBy: DrawnBy;
  finished: boolean;
}

// Live game state is kept in memory (one entry per room code); questions, users, likes and chat live in Postgres.
// Level rules: 1 open at start; 2 opens when everyone drew a level-1 card; 3 when everyone drew a level-2 card;
// only the current level can be drawn; the game can be finished once everyone drew a level-3 card.
const live: Record<string, Live> = {};

function likeStateFor(card: QuestionRow, viewerId: number, likedBy: Set<number>): LikeState {
  if (card.is_original || card.author_id === viewerId) return 'none';
  return likedBy.has(viewerId) ? 'done' : 'can';
}

// Built per viewer, so the author of a custom card is never sent to anyone.
function publicState(l: Live, viewerId: number, likedBy: Set<number>): GameState {
  const c = l.card;
  return {
    mode: l.room.mode,
    discordLink: l.room.discord_link,
    players: l.players.map(p => ({ id: p.id, username: p.username, color: p.color })),
    currentPlayerId: l.players[l.turnIndex]?.id ?? null,
    card: c && { text: c.text, level: c.level, is_original: c.is_original, likes: c.likes, seq: c.seq, likeState: likeStateFor(c, viewerId, likedBy) },
    awaitingPick: l.awaitingPick,
    answererId: l.answererId,
    hands: l.hands,
    drawerSpeaking: l.drawerSpeaking,
    spoken: l.spoken,
    level: l.level,
    progress: { done: l.players.filter(p => l.drawnBy[l.level].has(p.id)).length, total: l.players.length },
    canAdvance: canAdvance(l.level, l.players, l.drawnBy, l.finished),
    canFinish: canFinish(l.level, l.players, l.drawnBy, l.finished),
    finished: l.finished,
  };
}

// Socket handlers are async now. An unhandled rejection would crash the process, so every handler goes through safe().
const safe = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A): void => {
  try {
    const r = fn(...a);
    if (r instanceof Promise) r.catch(e => console.error('socket handler error:', e));
  } catch (e) { console.error('socket handler error:', e); }
};

export function setupGame(io: GameServer) {
  async function broadcast(code: string): Promise<void> {
    const l = live[code];
    if (!l) return;
    const c = l.card;
    // one query per broadcast: who already liked the current community card
    const likedBy = new Set<number>(
      c && !c.is_original ? (await all<{ user_id: number }>('SELECT user_id FROM likes WHERE question_id = $1', c.id)).map(r => r.user_id) : []);
    const cur = live[code];
    if (!cur) return;
    if ((cur.card?.id ?? null) !== (c?.id ?? null)) return broadcast(code); // the card changed while we waited: redo
    for (const s of io.sockets.sockets.values()) {
      if (s.rooms.has(code)) s.emit('state', publicState(cur, s.data.userId, likedBy));
    }
  }
  const bc = (code: string) => { broadcast(code).catch(e => console.error('broadcast error:', e)); };

  io.on('connection', socket => {
    const user = (socket.request as unknown as Request).session?.user;
    if (!user) { socket.disconnect(); return; }
    socket.data.userId = user.id;
    let code = '';
    let room: RoomRow | undefined;

    const isMyTurn = () => live[code]?.players[live[code].turnIndex]?.id === user.id;

    socket.on('join', safe(async (joinCode: string) => {
      const found = await get<RoomRow>('SELECT * FROM rooms WHERE code = $1', String(joinCode).toUpperCase());
      if (!found) { socket.emit('error-msg', 'Room not found'); return; }
      room = found;
      code = found.code;
      socket.join(code);
      live[code] ??= {
        room: found, players: [], turnIndex: 0, card: null, awaitingPick: false, answererId: null, hands: [],
        drawerSpeaking: false, drawn: new Set(), seq: 0, spoken: [], level: 1, drawnBy: newDrawnBy(), finished: false,
      };
      const l = live[code];
      if (!l.players.find(p => p.id === user.id)) {
        const color = (await get<{ color: string }>('SELECT color FROM users WHERE id = $1', user.id))?.color || DEFAULT_COLOR;
        if (!l.players.find(p => p.id === user.id)) l.players.push({ id: user.id, username: user.username, color });
      }
      const history = (await all<{ username: string; color: string; text: string }>(
        `SELECT u.username, u.color, m.text FROM messages m JOIN users u ON u.id = m.user_id
         WHERE m.room_id = $1 ORDER BY m.id DESC LIMIT 50`, found.id)).reverse();
      socket.emit('history', history);
      await broadcast(code);
    }));

    socket.on('chat', safe(async (text: string) => {
      if (!room || typeof text !== 'string' || !text.trim() || text.length > 300) return;
      await run('INSERT INTO messages (room_id, user_id, text) VALUES ($1, $2, $3)', room.id, user.id, text.trim());
      const color = live[code]?.players.find(p => p.id === user.id)?.color || DEFAULT_COLOR;
      io.to(code).emit('chat', { username: user.username, color, text: text.trim() });
    }));

    socket.on('draw', safe(async (level: number) => {
      const l = live[code];
      if (!room || !l || l.finished || !isMyTurn() || l.card || ![1, 2, 3].includes(level)) return;
      if (level !== l.level) { socket.emit('error-msg', `Only level ${l.level} can be drawn right now`); return; }
      const q = await get<QuestionRow>(
        `SELECT id, text, level, is_original, author_id FROM questions
         WHERE level = $1 ${room.mode === 'original' ? 'AND is_original = TRUE' : ''} AND id <> ALL($2::int[])
         ORDER BY RANDOM() LIMIT 1`, level, [...l.drawn]);
      if (l.card || l.finished || !isMyTurn()) return; // state changed while we waited (e.g. a double click)
      if (!q) { l.drawn.clear(); socket.emit('error-msg', 'Deck reset, draw again'); return; }
      l.drawn.add(q.id);
      l.drawnBy[l.level].add(user.id);
      l.card = { ...q, likes: 0, seq: ++l.seq };
      l.awaitingPick = q.level === 2;
      l.answererId = null;
      l.hands = [];
      l.spoken = [];
      l.drawerSpeaking = false;
      await broadcast(code);
    }));

    socket.on('pickAnswerer', safe((userId: number) => {
      const l = live[code];
      if (!room || !l || !isMyTurn() || !l.awaitingPick || !l.players.find(p => p.id === userId)) return;
      l.answererId = userId;
      l.awaitingPick = false;
      bc(code);
    }));

    socket.on('raiseHand', safe(() => {
      const l = live[code];
      if (!room || !l?.card || l.card.level === 2 || isMyTurn() || l.answererId === user.id || l.spoken.includes(user.id)) return;
      const i = l.hands.indexOf(user.id);
      i === -1 ? l.hands.push(user.id) : l.hands.splice(i, 1);
      bc(code);
    }));

    socket.on('pickSpeaker', safe((userId: number) => {
      const l = live[code];
      if (!room || !l?.card || !isMyTurn() || l.card.level === 2 || l.answererId !== null || !l.hands.includes(userId)) return;
      l.answererId = userId;
      l.hands = l.hands.filter(id => id !== userId);
      l.drawerSpeaking = false;
      bc(code);
    }));

    socket.on('finished', safe(() => {
      const l = live[code];
      if (!room || !l?.card || l.answererId !== user.id) return;
      l.answererId = null;
      l.spoken.push(user.id);
      l.drawerSpeaking = true;
      bc(code);
    }));

    socket.on('advanceLevel', safe(() => {
      const l = live[code];
      if (!room || !l || !isMyTurn() || l.card || !canAdvance(l.level, l.players, l.drawnBy, l.finished)) return;
      l.level = (l.level + 1) as Level;
      bc(code);
    }));

    socket.on('finishGame', safe(() => {
      const l = live[code];
      if (!room || !l || !isMyTurn() || l.card || !canFinish(l.level, l.players, l.drawnBy, l.finished)) return;
      l.finished = true;
      bc(code);
    }));

    socket.on('like', safe(async () => {
      const l = live[code];
      const c = l?.card;
      if (!room || !c || c.is_original || c.author_id === user.id) return;
      const r = await run('INSERT INTO likes (question_id, user_id, room_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', c.id, user.id, room.id);
      if (!r.rowCount) return; // already liked this question at some point: only once, ever
      c.likes = (await get<{ n: number }>('SELECT COUNT(*)::int AS n FROM likes WHERE question_id = $1 AND room_id = $2', c.id, room.id))!.n;
      await broadcast(code);
    }));

    socket.on('nextTurn', safe(() => {
      const l = live[code];
      if (!room || !l || !isMyTurn() || l.awaitingPick || l.answererId !== null) return;
      l.card = null; l.hands = []; l.spoken = []; l.drawerSpeaking = false;
      l.turnIndex = (l.turnIndex + 1) % l.players.length;
      bc(code);
    }));

    socket.on('disconnect', safe(() => {
      const l = live[code];
      if (!code || !l) return;
      const idx = l.players.findIndex(p => p.id === user.id);
      if (idx === -1) return;
      l.players.splice(idx, 1);
      if (l.players.length === 0) { delete live[code]; return; }
      l.hands = l.hands.filter(id => id !== user.id);
      l.spoken = l.spoken.filter(id => id !== user.id);
      if (l.answererId === user.id) { l.answererId = null; l.drawerSpeaking = true; }
      if (idx < l.turnIndex) l.turnIndex--;
      if (idx === l.turnIndex) { l.card = null; l.awaitingPick = false; l.answererId = null; l.hands = []; l.drawerSpeaking = false; }
      l.turnIndex %= l.players.length;
      bc(code);
    }));
  });
}
