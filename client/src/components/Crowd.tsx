import { Stickman } from './Stickman';
import type { GameState } from '../../../shared/types';

export function Crowd({ s }: { s: GameState }) {
  const n = s.players.length;
  const base = Math.min(1, 540 / (n * 72));
  const maxLen = n > 8 ? 7 : 10;

  const spots = s.players.map((p, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const depth = Math.sin(Math.PI * t); // 0 at the edges, 1 in the middle
    return { p, x: n === 1 ? 320 : 70 + t * 500, y: 128 + depth * 34, scale: base * (0.88 + 0.12 * depth) };
  }).sort((a, b) => a.y - b.y); // draw the back row first

  return (
    <svg className="crowd" viewBox="0 0 640 230" role="img" aria-label="The players">
      {spots.map(({ p, x, y, scale }) => (
        <Stickman
          key={p.id}
          color={p.color}
          name={p.username.length > maxLen ? p.username.slice(0, maxLen - 1) + '…' : p.username}
          x={x} y={y} scale={scale}
          raised={s.hands.includes(p.id)}
          drawer={p.id === s.currentPlayerId}
          speaking={p.id === s.answererId}
          spoken={s.spoken.includes(p.id)}
          badge={p.id === s.answererId ? '🎤' : p.id === s.currentPlayerId ? '🃏' : ''}
        />
      ))}
    </svg>
  );
}
