export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: number;
  rank: Rank;
  suit: Suit;
}

export type Power = 'peek' | 'swap' | 'lock' | 'unlock' | 'shuffle';

export type Rng = () => number;

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export const POWER_INFO: Record<Power, { rank: Rank; name: string; desc: string }> = {
  peek: { rank: 'J', name: 'Intip', desc: 'Lihat secara rahsia 1 kad milik sendiri atau lawan.' },
  swap: { rank: 'Q', name: 'Tukar', desc: 'Tukar 1 kad anda dengan 1 kad lawan tanpa mendedahkannya.' },
  lock: { rank: 'K', name: 'Kunci', desc: 'Kunci 1 kad (anda atau lawan). Kad terkunci tidak boleh diubah langsung.' },
  unlock: { rank: '9', name: 'Buka Kunci', desc: 'Buka kunci pada mana-mana kad yang terkunci.' },
  shuffle: { rank: '10', name: 'Rombak', desc: 'Rombak kedudukan kad tidak berkunci milik anda atau seorang lawan.' },
};

/** Point value of a card at the end of the round. */
export function cardValue(card: Card): number {
  switch (card.rank) {
    case '7':
      return 0;
    case 'A':
      return 1;
    case 'J':
    case 'Q':
    case 'K':
      return 10;
    default:
      return Number(card.rank);
  }
}

export function cardPower(card: Card): Power | null {
  switch (card.rank) {
    case 'J':
      return 'peek';
    case 'Q':
      return 'swap';
    case 'K':
      return 'lock';
    case '9':
      return 'unlock';
    case '10':
      return 'shuffle';
    default:
      return null;
  }
}

export function isRed(card: Card): boolean {
  return card.suit === 'H' || card.suit === 'D';
}

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: id++, rank, suit });
    }
  }
  return deck;
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deterministic PRNG (mulberry32) for tests and reproducible games. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Look up a card by id (ids follow createDeck order). */
export function cardById(id: number): Card {
  return { id, rank: RANKS[id % 13], suit: SUITS[Math.floor(id / 13)] };
}
