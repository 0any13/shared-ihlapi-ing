import { describe, it, expect } from 'vitest';
import { newDrawnBy, canAdvance, canFinish, tierName, nextAt, CREATOR_TIERS } from './rules';

const players = [{ id: 1 }, { id: 2 }];

describe('level progression', () => {
  it('does not open level 2 until every player drew a level 1 card', () => {
    const d = newDrawnBy();
    d[1].add(1);
    expect(canAdvance(1, players, d, false)).toBe(false);
    d[1].add(2);
    expect(canAdvance(1, players, d, false)).toBe(true);
  });

  it('level 3 needs level 2 draws, level 1 draws are not enough (the old bug)', () => {
    const d = newDrawnBy();
    d[1].add(1); d[1].add(2);
    expect(canAdvance(2, players, d, false)).toBe(false);
    d[2].add(1); d[2].add(2);
    expect(canAdvance(2, players, d, false)).toBe(true);
  });

  it('can only finish at level 3 after everyone drew a level 3 card', () => {
    const d = newDrawnBy();
    d[3].add(1);
    expect(canFinish(3, players, d, false)).toBe(false);
    d[3].add(2);
    expect(canFinish(3, players, d, false)).toBe(true);
    expect(canFinish(2, players, d, false)).toBe(false);
    expect(canFinish(3, players, d, true)).toBe(false);
  });

  it('a player who left no longer blocks progress', () => {
    const d = newDrawnBy();
    d[1].add(1);
    expect(canAdvance(1, [{ id: 1 }], d, false)).toBe(true);
  });
});

describe('tiers', () => {
  it('computes names and the next threshold', () => {
    expect(tierName(0, CREATOR_TIERS)).toBe('Newcomer');
    expect(tierName(10, CREATOR_TIERS)).toBe('Storyteller');
    expect(nextAt(3, CREATOR_TIERS)).toBe(10);
    expect(nextAt(99, CREATOR_TIERS)).toBeNull();
  });
});
