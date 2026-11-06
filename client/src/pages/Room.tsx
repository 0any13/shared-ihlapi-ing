import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../auth';
import { Chat } from '../components/Chat';
import { Crowd } from '../components/Crowd';
import { Finish } from '../components/Finish';
import { GameCard } from '../components/GameCard';
import type { ChatMessage, ClientToServerEvents, GameState, ServerToClientEvents } from '../../../shared/types';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export default function Room() {
  const { me, loading } = useAuth();
  const [params] = useSearchParams();
  const code = (params.get('code') ?? '').toUpperCase();

  const [s, setS] = useState<GameState | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<AppSocket | null>(null);

  useEffect(() => {
    if (!me || !code) return;
    const socket: AppSocket = io();
    socketRef.current = socket;
    socket.on('state', setS);
    socket.on('history', setChat);
    socket.on('chat', m => setChat(c => [...c, m]));
    socket.on('error-msg', setMsg);
    socket.emit('join', code);
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [me?.id, code]);

  if (loading) return null;
  if (!me || !code) return <Navigate to="/" replace />;

  const emit = socketRef.current;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); } catch { setMsg('Copy failed'); }
    setTimeout(() => setCopied(false), 1500);
  };

  if (!s) return <div className="p-4 text-center muted">Joining room {code}...</div>;

  const c = s.card;
  const myTurn = s.currentPlayerId === me.id;
  const current = s.players.find(p => p.id === s.currentPlayerId);
  const imSpeaker = s.answererId === me.id;
  const ans = s.players.find(p => p.id === s.answererId);

  const turnText = current ? (myTurn ? (c ? 'You drew this card' : 'Your turn: draw a card') : `${current.username} is drawing`) : '';

  let answererText = '';
  if (ans) answererText = `${ans.username} is answering`;
  else if (s.awaitingPick) answererText = myTurn ? 'Pick who answers' : 'Waiting for the drawer to pick who answers...';
  else if (s.drawerSpeaking && current) answererText = myTurn ? 'Your turn to respond' : `${current.username} is responding`;
  else if (c && c.level !== 2) answererText = myTurn ? 'Pick someone from the raised hands' : (s.spoken.includes(me.id) ? 'You already answered this one' : 'Raise your hand to answer');

  const showHands = !!c && c.level !== 2 && s.hands.length > 0;
  const canPick = myTurn && s.answererId === null;
  const hint = (s.level < 3
    ? `Level ${s.level + 1} unlocks once everyone has drawn a level ${s.level} card`
    : 'You can finish the game once everyone has drawn a level 3 card') + ` (${s.progress.done}/${s.progress.total})`;

  return (
    <div className="p-4 flex justify-center">
      <main className="w-full max-w-2xl space-y-4">
        <header className="flex justify-between items-center">
          <h1 className="display logo text-2xl">Room {code}</h1>
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost !px-3 !py-1 text-sm" onClick={copyLink}>{copied ? 'Copied' : 'Copy invite link'}</button>
            <Link to="/" className="link text-sm">Leave</Link>
          </div>
        </header>
        <p className="err">{msg}</p>
        {s.discordLink && <a href={s.discordLink} target="_blank" rel="noopener noreferrer" className="btn btn-violet w-full">Join the voice call on Discord</a>}

        <section className="panel text-center">
          <p className="font-bold text-lg">{turnText}</p>
          <GameCard card={c} />
          <p className="font-semibold min-h-[1.5rem]">{answererText}</p>
          {s.awaitingPick && myTurn && (
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {s.players.filter(p => p.id !== me.id).map(p => (
                <button key={p.id} className="btn btn-lime" onClick={() => emit?.emit('pickAnswerer', p.id)}>{p.username}</button>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <Crowd s={s} />

          {myTurn && !c && !s.finished && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2 justify-center">
                {/* only the CURRENT level can be drawn */}
                <button className={'btn ' + ['', 'btn-cyan', 'btn-pink', 'btn-yellow'][s.level]} onClick={() => emit?.emit('draw', s.level)}>
                  Draw level {s.level}
                </button>
              </div>
              <div className="text-center space-y-2">
                {s.canAdvance && <button className="btn btn-magenta" onClick={() => emit?.emit('advanceLevel')}>Everyone has played: unlock level {s.level + 1}</button>}
                {s.canFinish && <button className="btn btn-lime" onClick={() => emit?.emit('finishGame')}>Finish the game</button>}
                {!s.canAdvance && !s.canFinish && <p className="text-sm muted">{hint}</p>}
              </div>
            </div>
          )}

          {showHands && (
            <div className="mt-3 text-center">
              <p className="text-sm muted mb-2">Raised hands</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {s.hands.map(id => {
                  const p = s.players.find(x => x.id === id);
                  return p && (
                    <button key={id} className={'btn ' + (canPick ? 'btn-lime' : 'btn-ghost')} disabled={!canPick}
                      onClick={() => emit?.emit('pickSpeaker', id)}>{p.username}</button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-center mt-3">
            {c && c.level !== 2 && !myTurn && !imSpeaker && !s.spoken.includes(me.id) && (
              <button className="btn btn-orange" onClick={() => emit?.emit('raiseHand')}>{s.hands.includes(me.id) ? 'Lower hand' : 'Raise hand'}</button>
            )}
            {imSpeaker && <button className="btn btn-lime" onClick={() => emit?.emit('finished')}>I'm finished</button>}
            {c && c.likeState !== 'none' && (
              <button className="btn btn-pink" disabled={c.likeState !== 'can'} onClick={() => emit?.emit('like')}>
                {c.likeState === 'done' ? 'Liked' : 'Like this question'} ({c.likes})
              </button>
            )}
            {myTurn && c && !s.awaitingPick && !s.answererId && (
              <button className="btn btn-violet" onClick={() => emit?.emit('nextTurn')}>Next turn</button>
            )}
          </div>
        </section>

        <Chat messages={chat} onSend={t => emit?.emit('chat', t)} />
      </main>
      {s.finished && <Finish />}
    </div>
  );
}
