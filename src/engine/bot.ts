import { type Card, type Power, type Rng, cardById, cardValue, createDeck } from './cards';
import { type CardRef, type Difficulty, type GameState, type PowerTarget, legalTargets } from './game';

export type BotDecision = { kind: 'discard' } | { kind: 'replace'; slot: number };

interface Profile {
  /** Chance per turn of forgetting each remembered card. */
  forget: number;
  /** How much better (in points) a swap-in must look before replacing an unknown card. */
  unknownMargin: number;
  /** Chance of acting randomly instead of thinking. */
  blunder: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  mudah: { forget: 0.2, unknownMargin: 2.5, blunder: 0.3 },
  biasa: { forget: 0.05, unknownMargin: 1.5, blunder: 0.08 },
  sukar: { forget: 0, unknownMargin: 1, blunder: 0 },
};

/** What a bot can see and remember. */
class View {
  readonly ev: number;

  constructor(
    readonly state: GameState,
    readonly me: number,
  ) {
    const seen = new Set<number>(state.discardPile.map((c) => c.id));
    for (const hand of state.knowledge[me]) for (const id of hand) if (id !== null) seen.add(id);
    if (state.phase.kind === 'decide' && state.current === me) seen.add(state.phase.drawn.id);
    const pool = createDeck().filter((c) => !seen.has(c.id));
    this.ev = pool.length ? pool.reduce((s, c) => s + cardValue(c), 0) / pool.length : 5;
  }

  known(ref: CardRef): Card | null {
    const id = this.state.knowledge[this.me][ref.owner][ref.slot];
    return id === null ? null : cardById(id);
  }

  value(ref: CardRef): number {
    const c = this.known(ref);
    return c ? cardValue(c) : this.ev;
  }

  locked(ref: CardRef): boolean {
    return this.state.players[ref.owner].slots[ref.slot].locked;
  }

  refs(owner: number): CardRef[] {
    return this.state.players[owner].slots.map((_, slot) => ({ owner, slot }));
  }

  opponents(): number[] {
    return this.state.players.map((p) => p.id).filter((id) => id !== this.me);
  }
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

export function decideDrawn(state: GameState, me: number, rng: Rng = Math.random): BotDecision {
  if (state.phase.kind !== 'decide') throw new Error('Bot has nothing to decide.');
  const profile = PROFILES[state.players[me].difficulty];
  const view = new View(state, me);
  const drawnValue = cardValue(state.phase.drawn);
  const open = view.refs(me).filter((r) => !view.locked(r));
  if (!open.length) return { kind: 'discard' };

  if (rng() < profile.blunder) {
    return rng() < 0.5 ? { kind: 'discard' } : { kind: 'replace', slot: pick(open, rng).slot };
  }

  let best: { slot: number; gain: number } | null = null;
  for (const r of open) {
    const known = view.known(r) !== null;
    const gain = view.value(r) - drawnValue - (known ? 0 : profile.unknownMargin);
    if (!best || gain > best.gain) best = { slot: r.slot, gain };
  }
  return best && best.gain > 0 ? { kind: 'replace', slot: best.slot } : { kind: 'discard' };
}

/** Choose how to use a power, or null to skip it. */
export function choosePower(state: GameState, me: number, power: Power, rng: Rng = Math.random): PowerTarget | null {
  const legal = legalTargets(state, power, me);
  if (!legal.length) return null;
  const profile = PROFILES[state.players[me].difficulty];
  if (rng() < profile.blunder) return rng() < 0.5 ? null : pick(legal, rng);

  const view = new View(state, me);
  switch (power) {
    case 'peek':
      return choosePeek(view, legal, rng);
    case 'swap':
      return chooseSwap(view, legal);
    case 'lock':
      return chooseLock(view, legal);
    case 'unlock':
      return chooseUnlock(view, legal);
    case 'shuffle':
      return chooseShuffle(view, legal);
  }
}

function refOf(t: PowerTarget): CardRef {
  if (t.power === 'shuffle' || !('target' in t)) throw new Error('No single target.');
  return t.target;
}

function choosePeek(view: View, legal: PowerTarget[], rng: Rng): PowerTarget | null {
  const unknown = legal.filter((t) => view.known(refOf(t)) === null);
  // Learn our own hand first, then scout unlocked opponent cards worth stealing.
  const mine = unknown.filter((t) => refOf(t).owner === view.me);
  if (mine.length) return pick(mine, rng);
  const theirs = unknown.filter((t) => !view.locked(refOf(t)));
  if (theirs.length) return pick(theirs, rng);
  return null;
}

function chooseSwap(view: View, legal: PowerTarget[]): PowerTarget | null {
  let best: { t: PowerTarget; gain: number } | null = null;
  for (const t of legal) {
    if (t.power !== 'swap') continue;
    const gain = view.value({ owner: view.me, slot: t.mine }) - view.value(t.target);
    if (!best || gain > best.gain) best = { t, gain };
  }
  return best && best.gain >= 2 ? best.t : null;
}

function chooseLock(view: View, legal: PowerTarget[]): PowerTarget | null {
  let best: { t: PowerTarget; score: number } | null = null;
  for (const t of legal) {
    const ref = refOf(t);
    const card = view.known(ref);
    if (!card) continue;
    const v = cardValue(card);
    // Protect our own cheap cards, or trap an opponent with an expensive one.
    const score = ref.owner === view.me ? 3 - v : v - 7;
    if (score > 0 && (!best || score > best.score)) best = { t, score };
  }
  return best?.t ?? null;
}

function chooseUnlock(view: View, legal: PowerTarget[]): PowerTarget | null {
  let best: { t: PowerTarget; score: number } | null = null;
  for (const t of legal) {
    const ref = refOf(t);
    const v = view.value(ref);
    // Free our own expensive card, or expose an opponent's cheap one to a future swap.
    const score = ref.owner === view.me ? v - 5 : 4 - v;
    if (score > 0 && (!best || score > best.score)) best = { t, score };
  }
  return best?.t ?? null;
}

function chooseShuffle(view: View, legal: PowerTarget[]): PowerTarget | null {
  const k = view.state.knowledge;
  const owners = new Set(legal.map((t) => (t.power === 'shuffle' ? t.owner : -1)));
  // How much do opponents know about our open cards?
  const exposure = view
    .opponents()
    .reduce((n, o) => n + view.refs(view.me).filter((r) => !view.locked(r) && k[o][view.me][r.slot] !== null).length, 0);
  // Which opponent knows their own hand best? Scrambling it wipes that memory.
  let target: { owner: number; known: number } | null = null;
  for (const o of view.opponents()) {
    if (!owners.has(o)) continue;
    const known = view.refs(o).filter((r) => !view.locked(r) && k[o][o][r.slot] !== null).length;
    if (!target || known > target.known) target = { owner: o, known };
  }
  if (target && target.known >= Math.max(1, exposure)) return { power: 'shuffle', owner: target.owner };
  if (exposure > 0 && owners.has(view.me)) return { power: 'shuffle', owner: view.me };
  return null;
}

/** Imperfect memory: easier bots forget cards they have seen. */
export function forget(state: GameState, me: number, rng: Rng = Math.random): GameState {
  const chance = PROFILES[state.players[me].difficulty].forget;
  if (chance <= 0) return state;
  const knowledge = state.knowledge.map((viewer, v) =>
    v !== me ? viewer : viewer.map((hand) => hand.map((id) => (id !== null && rng() < chance ? null : id))),
  );
  return { ...state, knowledge };
}
