import { describe, expect, it } from 'vitest';
import { type Card, cardValue, seededRng } from './cards';
import { choosePower, decideDrawn, forget } from './bot';
import {
  type GameState,
  type PlayerConfig,
  createGame,
  discardDrawn,
  draw,
  replaceWithDrawn,
  scores,
  skipPower,
  usePower,
  winners,
} from './game';

const bots = (n: number): PlayerConfig[] =>
  Array.from({ length: n }, (_, i) => ({ name: `Bot ${i + 1}`, isHuman: false, difficulty: 'sukar' as const }));

function card(rank: Card['rank'], id = 0): Card {
  return { id, rank, suit: 'S' };
}

/** Force the next drawn card to be `c`. */
function rig(state: GameState, c: Card): GameState {
  const s = structuredClone(state);
  const all = [...s.drawPile];
  const idx = all.findIndex((x) => x.rank === c.rank);
  const [picked] = all.splice(idx, 1);
  s.drawPile = [...all, picked];
  return s;
}

function allCardIds(s: GameState): number[] {
  const ids = [...s.drawPile, ...s.discardPile].map((c) => c.id);
  s.players.forEach((p) => p.slots.forEach((sl) => ids.push(sl.card.id)));
  if (s.phase.kind === 'decide') ids.push(s.phase.drawn.id);
  return ids.sort((a, b) => a - b);
}

function assertKnowledgeTrue(s: GameState) {
  s.knowledge.forEach((viewer) =>
    viewer.forEach((hand, owner) =>
      hand.forEach((id, slot) => {
        if (id !== null) expect(s.players[owner].slots[slot].card.id).toBe(id);
      }),
    ),
  );
}

describe('card values', () => {
  it('scores 7 as zero, A as one, faces as ten', () => {
    expect(cardValue(card('7'))).toBe(0);
    expect(cardValue(card('A'))).toBe(1);
    expect(cardValue(card('8'))).toBe(8);
    expect(cardValue(card('9'))).toBe(9);
    expect(cardValue(card('10'))).toBe(10);
    expect(cardValue(card('K'))).toBe(10);
  });
});

describe('game flow', () => {
  it('deals 3 face-down cards each and nobody knows anything', () => {
    const s = createGame(bots(4), seededRng(1));
    expect(s.players.every((p) => p.slots.length === 3)).toBe(true);
    expect(s.drawPile.length).toBe(52 - 12);
    expect(s.knowledge.flat(2).every((k) => k === null)).toBe(true);
  });

  it('replacing reveals the old card on the discard pile and teaches only the actor', () => {
    let s = createGame(bots(2), seededRng(2));
    s = rig(s, card('5'));
    const old = s.players[0].slots[1].card;
    s = draw(s);
    const drawn = s.phase.kind === 'decide' ? s.phase.drawn : null;
    s = replaceWithDrawn(s, 1);
    expect(s.discardPile.at(-1)).toEqual(old);
    expect(s.players[0].slots[1].card).toEqual(drawn);
    expect(s.knowledge[0][0][1]).toBe(drawn!.id);
    expect(s.knowledge[1][0][1]).toBeNull();
  });

  it('offers the power of a card replaced out of the hand', () => {
    let s = createGame(bots(2), seededRng(3));
    s = structuredClone(s);
    s.players[0].slots[0].card = { id: 999, rank: 'Q', suit: 'H' };
    s = draw(s);
    s = replaceWithDrawn(s, 0);
    expect(s.phase.kind).toBe('power');
    if (s.phase.kind === 'power') expect(s.phase.source).toBe('replaced');
  });

  it('offers the power of a drawn card that is discarded', () => {
    let s = rig(createGame(bots(2), seededRng(4)), card('J'));
    s = discardDrawn(draw(s));
    expect(s.phase.kind).toBe('power');
    s = skipPower(s);
    expect(s.current).toBe(1);
  });

  it('peek teaches only the peeker', () => {
    let s = discardDrawn(draw(rig(createGame(bots(3), seededRng(5)), card('J'))));
    s = usePower(s, { power: 'peek', target: { owner: 2, slot: 0 } });
    expect(s.knowledge[0][2][0]).toBe(s.players[2].slots[0].card.id);
    expect(s.knowledge[2][2][0]).toBeNull();
    expect(s.lastPeek?.viewer).toBe(0);
  });

  it('swap moves cards and beliefs together', () => {
    let s = createGame(bots(2), seededRng(6));
    s.knowledge[1][1][2] = s.players[1].slots[2].card.id;
    const a = s.players[0].slots[0].card;
    const b = s.players[1].slots[2].card;
    s = discardDrawn(draw(rig(s, card('Q'))));
    s = usePower(s, { power: 'swap', mine: 0, target: { owner: 1, slot: 2 } });
    expect(s.players[0].slots[0].card).toEqual(b);
    expect(s.players[1].slots[2].card).toEqual(a);
    expect(s.knowledge[1][0][0]).toBe(b.id);
    assertKnowledgeTrue(s);
  });

  it('locked cards cannot be swapped, replaced or shuffled until unlocked', () => {
    let s = discardDrawn(draw(rig(createGame(bots(2), seededRng(7)), card('K'))));
    s = usePower(s, { power: 'lock', target: { owner: 1, slot: 1 } });
    expect(s.players[1].slots[1].locked).toBe(true);

    // Player 1 cannot replace their own locked card.
    s = draw(s);
    expect(() => replaceWithDrawn(s, 1)).toThrow();
    s = s.phase.kind === 'decide' ? replaceWithDrawn(s, 0) : s;
    if (s.phase.kind === 'power') s = skipPower(s);

    // Player 0 cannot swap it.
    s = discardDrawn(draw(rig(s, card('Q'))));
    expect(() => usePower(s, { power: 'swap', mine: 0, target: { owner: 1, slot: 1 } })).toThrow();
    s = skipPower(s);
    if (s.current !== 0) {
      s = draw(s);
      s = discardDrawn(s);
      if (s.phase.kind === 'power') s = skipPower(s);
    }

    // Shuffle keeps the locked card in place.
    const lockedId = s.players[1].slots[1].card.id;
    s = discardDrawn(draw(rig(s, card('10'))));
    s = usePower(s, { power: 'shuffle', owner: 1 }, seededRng(9));
    expect(s.players[1].slots[1].card.id).toBe(lockedId);
    if (s.current !== 0) {
      s = discardDrawn(draw(s));
      if (s.phase.kind === 'power') s = skipPower(s);
    }

    // A 9 unlocks it.
    s = discardDrawn(draw(rig(s, card('9'))));
    s = usePower(s, { power: 'unlock', target: { owner: 1, slot: 1 } });
    expect(s.players[1].slots[1].locked).toBe(false);
  });

  it('shuffle keeps the shuffler informed and confuses everyone else', () => {
    let s = createGame(bots(2), seededRng(10));
    s.knowledge[0][1] = s.players[1].slots.map((sl) => sl.card.id);
    s.knowledge[1][1] = s.players[1].slots.map((sl) => sl.card.id);
    s = discardDrawn(draw(rig(s, card('10'))));
    s = usePower(s, { power: 'shuffle', owner: 1 }, seededRng(11));
    expect(s.knowledge[0][1].every((k) => k !== null)).toBe(true);
    expect(s.knowledge[1][1].every((k) => k === null)).toBe(true);
    assertKnowledgeTrue(s);
  });

  it('ties share the win', () => {
    const s = createGame(bots(2), seededRng(12));
    s.players[0].slots.forEach((sl) => (sl.card = card('7')));
    s.players[1].slots.forEach((sl) => (sl.card = card('7')));
    expect(winners(s)).toEqual([0, 1]);
  });
});

describe('bot-only simulations', () => {
  for (const n of [2, 3, 4]) {
    it(`plays ${n}-player games to completion without breaking invariants`, () => {
      for (let seed = 0; seed < 30; seed++) {
        const rng = seededRng(seed * 31 + n);
        let s = createGame(bots(n), rng);
        let guard = 0;
        while (s.phase.kind !== 'gameOver') {
          const me = s.current;
          if (s.phase.kind === 'draw') s = forget(draw(s), me, rng);
          else if (s.phase.kind === 'decide') {
            const d = decideDrawn(s, me, rng);
            s = d.kind === 'discard' ? discardDrawn(s) : replaceWithDrawn(s, d.slot);
          } else if (s.phase.kind === 'power') {
            const t = choosePower(s, me, s.phase.power, rng);
            s = t ? usePower(s, t, rng) : skipPower(s);
          }
          expect(allCardIds(s)).toEqual(Array.from({ length: 52 }, (_, i) => i));
          assertKnowledgeTrue(s);
          if (++guard > 1000) throw new Error('game did not end');
        }
        expect(s.drawPile.length).toBe(0);
        expect(scores(s).length).toBe(n);
      }
    });
  }

  it('smart bots beat a do-nothing player on average', () => {
    let smart = 0;
    let lazy = 0;
    for (let seed = 0; seed < 200; seed++) {
      const rng = seededRng(seed);
      let s = createGame(bots(2), rng);
      while (s.phase.kind !== 'gameOver') {
        const me = s.current;
        if (s.phase.kind === 'draw') s = draw(s);
        else if (s.phase.kind === 'decide') {
          const d = me === 0 ? decideDrawn(s, me, rng) : ({ kind: 'discard' } as const);
          s = d.kind === 'discard' ? discardDrawn(s) : replaceWithDrawn(s, d.slot);
        } else if (s.phase.kind === 'power') {
          const t = me === 0 ? choosePower(s, me, s.phase.power, rng) : null;
          s = t ? usePower(s, t, rng) : skipPower(s);
        }
      }
      const [a, b] = scores(s);
      smart += a.total;
      lazy += b.total;
    }
    expect(smart / 200).toBeLessThan(lazy / 200 - 5);
  });
});
