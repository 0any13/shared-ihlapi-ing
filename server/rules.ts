import type { Level } from '../shared/types';

// Pure game rules, kept free of sockets/DB so they are easy to unit test.
export type DrawnBy = Record<Level, Set<number>>;
export const newDrawnBy = (): DrawnBy => ({ 1: new Set(), 2: new Set(), 3: new Set() });

export const CREATOR_TIERS = [{ min: 0, name: 'Newcomer' }, { min: 3, name: 'Curious' }, { min: 10, name: 'Storyteller' }, { min: 25, name: 'Question Master' }];
export const ENDORSE_TIERS = [{ min: 0, name: 'Unknown' }, { min: 5, name: 'Liked' }, { min: 20, name: 'Respected' }, { min: 50, name: 'Legend' }];

type Tier = { min: number; name: string };
export const tierName = (n: number, tiers: Tier[]): string => [...tiers].reverse().find(t => n >= t.min)!.name;
export const nextAt = (n: number, tiers: Tier[]): number | null => tiers.find(t => t.min > n)?.min ?? null;

/** True when every current player is in the `drew` set (and there is at least one player). */
export const allDrew = (players: { id: number }[], drew: Set<number>): boolean =>
  players.length > 0 && players.every(p => drew.has(p.id));

/** Level N+1 opens when everyone has drawn a level-N card. */
export const canAdvance = (level: Level, players: { id: number }[], drawnBy: DrawnBy, finished: boolean): boolean =>
  !finished && level < 3 && allDrew(players, drawnBy[level]);

/** The game can be finished once everyone has drawn a level-3 card. */
export const canFinish = (level: Level, players: { id: number }[], drawnBy: DrawnBy, finished: boolean): boolean =>
  !finished && level === 3 && allDrew(players, drawnBy[3]);
