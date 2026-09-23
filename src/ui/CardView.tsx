import { type Card, POWER_INFO, SUIT_SYMBOL, cardPower, isRed } from '../engine/cards';

export type CardSize = 'lg' | 'md' | 'sm';

interface Props {
  card?: Card | null;
  faceUp?: boolean;
  size?: CardSize;
  locked?: boolean;
  clickable?: boolean;
  selected?: boolean;
  highlight?: boolean;
  /** Memory-aid hint shown on a face-down card the viewer knows. */
  hint?: Card | null;
  label?: string;
  onClick?: () => void;
  title?: string;
}

export function CardFace({ card }: { card: Card }) {
  const power = cardPower(card);
  const sym = SUIT_SYMBOL[card.suit];
  return (
    <div className={`card-face ${isRed(card) ? 'red' : 'black'} ${card.rank === '7' ? 'lucky' : ''}`}>
      <div className="corner tl">
        <span className="rank">{card.rank}</span>
        <span className="suit">{sym}</span>
      </div>
      <div className="pip">{card.rank === '7' ? '7' : sym}</div>
      {power && <div className="power-tag">{POWER_INFO[power].name}</div>}
      <div className="corner br">
        <span className="rank">{card.rank}</span>
        <span className="suit">{sym}</span>
      </div>
    </div>
  );
}

export function CardBack() {
  return (
    <div className="card-back">
      <div className="back-inner">
        <span>7</span>
      </div>
    </div>
  );
}

export function CardView({
  card,
  faceUp = false,
  size = 'md',
  locked = false,
  clickable = false,
  selected = false,
  highlight = false,
  hint,
  label,
  onClick,
  title,
}: Props) {
  const showFace = faceUp && !!card;
  const cls = [
    'card',
    `size-${size}`,
    locked && 'locked',
    clickable && 'clickable',
    selected && 'selected',
    highlight && 'highlight',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={`card-slot size-${size}`}>
      <button type="button" className={cls} onClick={clickable ? onClick : undefined} disabled={!clickable} title={title}>
        <div className={`card-inner ${showFace ? 'flipped' : ''}`}>
          <div className="side back">
            <CardBack />
          </div>
          <div className="side front">{card && <CardFace card={card} />}</div>
        </div>
        {locked && (
          <span className="lock-badge" aria-label="Terkunci" title="Terkunci">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#2b1a05" strokeWidth="2.4" strokeLinecap="round" />
              <rect x="4" y="10" width="16" height="11" rx="2.5" fill="#2b1a05" />
            </svg>
          </span>
        )}
        {!showFace && hint && (
          <span className={`hint ${isRed(hint) ? 'red' : ''}`} title="Bantuan memori">
            {hint.rank}
            {SUIT_SYMBOL[hint.suit]}
          </span>
        )}
      </button>
      {label && <div className="slot-label">{label}</div>}
    </div>
  );
}
