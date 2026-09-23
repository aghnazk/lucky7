import {
  type Card,
  type Power,
  type Rng,
  POWER_INFO,
  cardLabel,
  cardPower,
  cardValue,
  createDeck,
  shuffle,
} from './cards';

export const HAND_SIZE = 3;

export type Difficulty = 'mudah' | 'biasa' | 'sukar';

export interface Slot {
  card: Card;
  locked: boolean;
}

export interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  difficulty: Difficulty;
  slots: Slot[];
}

export interface CardRef {
  owner: number;
  slot: number;
}

export type PowerTarget =
  | { power: 'peek'; target: CardRef }
  | { power: 'swap'; mine: number; target: CardRef }
  | { power: 'lock'; target: CardRef }
  | { power: 'unlock'; target: CardRef }
  | { power: 'shuffle'; owner: number };

export type Phase =
  | { kind: 'draw' }
  | { kind: 'decide'; drawn: Card }
  | { kind: 'power'; card: Card; power: Power; source: 'drawn' | 'replaced' }
  | { kind: 'gameOver' };

export type ActionKind = 'draw' | 'replace' | 'discard' | 'skip' | Power;

export interface LastAction {
  actor: number;
  kind: ActionKind;
  /** Card positions involved, for highlighting. */
  refs: CardRef[];
  /** Whole hands involved (shuffle). */
  owners: number[];
}

export interface PeekResult {
  viewer: number;
  ref: CardRef;
  card: Card;
}

export interface LogEntry {
  id: number;
  actor: number;
  text: string;
}

/**
 * knowledge[viewer][owner][slot] is the id of the card the viewer believes sits
 * in that slot, or null when the viewer does not know it.
 */
export type Knowledge = (number | null)[][][];

export interface GameState {
  players: Player[];
  drawPile: Card[];
  discardPile: Card[];
  current: number;
  phase: Phase;
  knowledge: Knowledge;
  log: LogEntry[];
  lastAction: LastAction | null;
  lastPeek: PeekResult | null;
  turnNumber: number;
}

export interface PlayerConfig {
  name: string;
  isHuman: boolean;
  difficulty?: Difficulty;
}

export class GameError extends Error {}

export function createGame(configs: PlayerConfig[], rng: Rng = Math.random, startPlayer = 0): GameState {
  if (configs.length < 2 || configs.length > 4) throw new GameError('Permainan memerlukan 2 hingga 4 pemain.');
  const deck = shuffle(createDeck(), rng);
  const players: Player[] = configs.map((c, id) => ({
    id,
    name: c.name,
    isHuman: c.isHuman,
    difficulty: c.difficulty ?? 'biasa',
    slots: deck.splice(0, HAND_SIZE).map((card) => ({ card, locked: false })),
  }));
  const knowledge: Knowledge = players.map(() => players.map(() => Array(HAND_SIZE).fill(null)));
  return {
    players,
    drawPile: deck,
    discardPile: [],
    current: startPlayer,
    phase: { kind: 'draw' },
    knowledge,
    log: [{ id: 0, actor: -1, text: 'Permainan bermula. Kad telah diagihkan secara tertutup.' }],
    lastAction: null,
    lastPeek: null,
    turnNumber: 1,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clone(state: GameState): GameState {
  return structuredClone(state);
}

/** How a player is referred to in the log ("Anda" for the human). */
export function who(state: GameState, id: number): string {
  const p = state.players[id];
  return p.isHuman ? 'Anda' : p.name;
}

function ownerPhrase(state: GameState, owner: number, actor: number): string {
  if (owner === actor) return 'sendiri';
  const p = state.players[owner];
  return p.isHuman ? 'anda' : p.name;
}

function cardPhrase(state: GameState, ref: CardRef, actor: number): string {
  return `kad #${ref.slot + 1} ${ownerPhrase(state, ref.owner, actor)}`;
}

function pushLog(state: GameState, actor: number, text: string): void {
  const id = state.log.length ? state.log[state.log.length - 1].id + 1 : 0;
  state.log.push({ id, actor, text });
}

function slotAt(state: GameState, ref: CardRef): Slot {
  const slot = state.players[ref.owner]?.slots[ref.slot];
  if (!slot) throw new GameError('Kad tidak wujud.');
  return slot;
}

function endTurn(state: GameState): void {
  state.turnNumber++;
  if (state.drawPile.length === 0) {
    state.phase = { kind: 'gameOver' };
    pushLog(state, -1, 'Timbunan cabutan telah habis! Semua kad didedahkan.');
    return;
  }
  state.current = (state.current + 1) % state.players.length;
  state.phase = { kind: 'draw' };
}

/** Put a card on the discard pile, then either offer its power or end the turn. */
function discardAndMaybePower(state: GameState, card: Card, source: 'drawn' | 'replaced'): void {
  state.discardPile.push(card);
  const power = cardPower(card);
  if (power && hasAnyTarget(state, power, state.current)) {
    state.phase = { kind: 'power', card, power, source };
  } else {
    endTurn(state);
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function isTargetValid(state: GameState, actor: number, t: PowerTarget): boolean {
  const valid = (ref: CardRef) => !!state.players[ref.owner]?.slots[ref.slot];
  switch (t.power) {
    case 'peek':
      return valid(t.target);
    case 'swap': {
      const mine = { owner: actor, slot: t.mine };
      return (
        valid(mine) &&
        valid(t.target) &&
        t.target.owner !== actor &&
        !slotAt(state, mine).locked &&
        !slotAt(state, t.target).locked
      );
    }
    case 'lock':
      return valid(t.target) && !slotAt(state, t.target).locked;
    case 'unlock':
      return valid(t.target) && slotAt(state, t.target).locked;
    case 'shuffle': {
      const p = state.players[t.owner];
      return !!p && p.slots.filter((s) => !s.locked).length >= 2;
    }
  }
}

/** Every legal target for a power, from the point of view of `actor`. */
export function legalTargets(state: GameState, power: Power, actor: number): PowerTarget[] {
  const out: PowerTarget[] = [];
  const refs: CardRef[] = [];
  state.players.forEach((p) => p.slots.forEach((_, slot) => refs.push({ owner: p.id, slot })));
  switch (power) {
    case 'peek':
    case 'lock':
    case 'unlock':
      for (const target of refs) {
        const t = { power, target } as PowerTarget;
        if (isTargetValid(state, actor, t)) out.push(t);
      }
      break;
    case 'swap':
      for (let mine = 0; mine < HAND_SIZE; mine++) {
        for (const target of refs) {
          const t: PowerTarget = { power, mine, target };
          if (isTargetValid(state, actor, t)) out.push(t);
        }
      }
      break;
    case 'shuffle':
      for (const p of state.players) {
        const t: PowerTarget = { power, owner: p.id };
        if (isTargetValid(state, actor, t)) out.push(t);
      }
      break;
  }
  return out;
}

export function hasAnyTarget(state: GameState, power: Power, actor: number): boolean {
  return legalTargets(state, power, actor).length > 0;
}

export function canReplace(state: GameState, slot: number): boolean {
  const s = state.players[state.current].slots[slot];
  return !!s && !s.locked;
}

export interface ScoreLine {
  id: number;
  total: number;
}

export function scores(state: GameState): ScoreLine[] {
  return state.players.map((p) => ({
    id: p.id,
    total: p.slots.reduce((sum, s) => sum + cardValue(s.card), 0),
  }));
}

/** Ids of the player(s) with the lowest total; ties share the win. */
export function winners(state: GameState): number[] {
  const list = scores(state);
  const best = Math.min(...list.map((s) => s.total));
  return list.filter((s) => s.total === best).map((s) => s.id);
}

// ---------------------------------------------------------------------------
// Actions (all pure: they return a new state)
// ---------------------------------------------------------------------------

export function draw(prev: GameState): GameState {
  if (prev.phase.kind !== 'draw') throw new GameError('Bukan masa untuk mencabut kad.');
  const state = clone(prev);
  const card = state.drawPile.pop();
  if (!card) throw new GameError('Timbunan cabutan kosong.');
  state.phase = { kind: 'decide', drawn: card };
  state.lastPeek = null;
  state.lastAction = { actor: state.current, kind: 'draw', refs: [], owners: [] };
  pushLog(state, state.current, `${who(state, state.current)} mencabut sekeping kad.`);
  return state;
}

/** Place the drawn card face-down in one of the current player's slots. */
export function replaceWithDrawn(prev: GameState, slot: number): GameState {
  if (prev.phase.kind !== 'decide') throw new GameError('Tiada kad dicabut.');
  if (!canReplace(prev, slot)) throw new GameError('Kad itu terkunci dan tidak boleh diganti.');
  const state = clone(prev);
  const { drawn } = prev.phase;
  const actor = state.current;
  const s = state.players[actor].slots[slot];
  const old = s.card;
  s.card = drawn;
  for (let v = 0; v < state.players.length; v++) {
    state.knowledge[v][actor][slot] = v === actor ? drawn.id : null;
  }
  state.lastAction = { actor, kind: 'replace', refs: [{ owner: actor, slot }], owners: [] };
  pushLog(state, actor, `${who(state, actor)} menggantikan kad #${slot + 1} dan membuang ${cardLabel(old)}.`);
  discardAndMaybePower(state, old, 'replaced');
  return state;
}

/** Throw the drawn card straight onto the discard pile. */
export function discardDrawn(prev: GameState): GameState {
  if (prev.phase.kind !== 'decide') throw new GameError('Tiada kad dicabut.');
  const state = clone(prev);
  const { drawn } = prev.phase;
  state.lastAction = { actor: state.current, kind: 'discard', refs: [], owners: [] };
  pushLog(state, state.current, `${who(state, state.current)} membuang ${cardLabel(drawn)}.`);
  discardAndMaybePower(state, drawn, 'drawn');
  return state;
}

export function skipPower(prev: GameState): GameState {
  if (prev.phase.kind !== 'power') throw new GameError('Tiada kuasa untuk dilangkau.');
  const state = clone(prev);
  state.lastAction = { actor: state.current, kind: 'skip', refs: [], owners: [] };
  pushLog(state, state.current, `${who(state, state.current)} tidak menggunakan kuasa ${prev.phase.card.rank}.`);
  endTurn(state);
  return state;
}

export function usePower(prev: GameState, t: PowerTarget, rng: Rng = Math.random): GameState {
  const phase = prev.phase;
  if (phase.kind !== 'power') throw new GameError('Tiada kuasa aktif.');
  if (phase.power !== t.power) throw new GameError('Kuasa tidak sepadan.');
  const actor = prev.current;
  if (!isTargetValid(prev, actor, t)) throw new GameError('Sasaran tidak sah.');

  const state = clone(prev);
  const tag = `${phase.card.rank} (${POWER_INFO[t.power].name})`;
  const W = who(state, actor);

  switch (t.power) {
    case 'peek': {
      const card = slotAt(state, t.target).card;
      state.knowledge[actor][t.target.owner][t.target.slot] = card.id;
      state.lastPeek = { viewer: actor, ref: t.target, card };
      state.lastAction = { actor, kind: 'peek', refs: [t.target], owners: [] };
      pushLog(state, actor, `${W} guna ${tag} dan mengintip ${cardPhrase(state, t.target, actor)}.`);
      break;
    }
    case 'swap': {
      const mine: CardRef = { owner: actor, slot: t.mine };
      const a = slotAt(state, mine);
      const b = slotAt(state, t.target);
      [a.card, b.card] = [b.card, a.card];
      // Everyone saw which positions moved, so beliefs travel with the cards.
      for (const k of state.knowledge) {
        const ka = k[mine.owner][mine.slot];
        k[mine.owner][mine.slot] = k[t.target.owner][t.target.slot];
        k[t.target.owner][t.target.slot] = ka;
      }
      state.lastAction = { actor, kind: 'swap', refs: [mine, t.target], owners: [] };
      pushLog(
        state,
        actor,
        `${W} guna ${tag}: kad #${t.mine + 1} ${ownerPhrase(state, actor, actor)} ditukar dengan ${cardPhrase(state, t.target, actor)}.`,
      );
      break;
    }
    case 'lock': {
      slotAt(state, t.target).locked = true;
      state.lastAction = { actor, kind: 'lock', refs: [t.target], owners: [] };
      pushLog(state, actor, `${W} guna ${tag} dan mengunci ${cardPhrase(state, t.target, actor)}.`);
      break;
    }
    case 'unlock': {
      slotAt(state, t.target).locked = false;
      state.lastAction = { actor, kind: 'unlock', refs: [t.target], owners: [] };
      pushLog(state, actor, `${W} guna ${tag} dan membuka kunci ${cardPhrase(state, t.target, actor)}.`);
      break;
    }
    case 'shuffle': {
      const owner = state.players[t.owner];
      const free = owner.slots.map((s, i) => (s.locked ? -1 : i)).filter((i) => i >= 0);
      let perm = shuffle(free, rng);
      // Make sure something actually moves.
      for (let tries = 0; tries < 10 && perm.every((v, i) => v === free[i]); tries++) perm = shuffle(free, rng);
      if (perm.every((v, i) => v === free[i])) perm = [...free.slice(1), free[0]];
      const oldSlots = owner.slots.map((s) => ({ ...s }));
      const oldKnow = state.knowledge.map((k) => k[t.owner].slice());
      free.forEach((dest, i) => {
        owner.slots[dest] = oldSlots[perm[i]];
        state.knowledge.forEach((k, v) => {
          // The shuffler tracks where each card went; everyone else loses track.
          k[t.owner][dest] = v === actor ? oldKnow[v][perm[i]] : null;
        });
      });
      state.lastAction = { actor, kind: 'shuffle', refs: [], owners: [t.owner] };
      const whose = t.owner === actor ? 'sendiri' : ownerPhrase(state, t.owner, actor);
      pushLog(state, actor, `${W} guna ${tag} dan merombak kedudukan kad ${whose}.`);
      break;
    }
  }
  endTurn(state);
  return state;
}
