import { useEffect, useMemo, useRef, useState } from 'react';
import { type Card, POWER_INFO, cardById, cardValue } from '../engine/cards';
import { choosePower, decideDrawn, forget } from '../engine/bot';
import {
  type CardRef,
  type GameState,
  type PowerTarget,
  canReplace,
  createGame,
  discardDrawn,
  draw,
  legalTargets,
  replaceWithDrawn,
  scores,
  skipPower,
  usePower,
  who,
  winners,
} from '../engine/game';
import { CardView } from './CardView';
import type { GameConfig } from './Setup';

const HUMAN = 0;
const BOT_NAMES = ['Bot Ali', 'Bot Mei', 'Bot Raju'];
const PEEK_MS = 2600;

type Seat = 'bottom' | 'top' | 'left' | 'right';
const SEATS: Record<number, Seat[]> = {
  2: ['bottom', 'top'],
  3: ['bottom', 'left', 'right'],
  4: ['bottom', 'left', 'top', 'right'],
};

interface Props {
  config: GameConfig;
  round: number;
  totals: number[];
  onRoundEnd: (roundScores: number[]) => void;
  onNextRound: () => void;
  onExit: () => void;
  onRules: () => void;
  onToggleMemoryAid: () => void;
}

function botStep(s: GameState): GameState {
  const me = s.current;
  switch (s.phase.kind) {
    case 'draw':
      return forget(draw(s), me);
    case 'decide': {
      const d = decideDrawn(s, me);
      return d.kind === 'discard' ? discardDrawn(s) : replaceWithDrawn(s, d.slot);
    }
    case 'power': {
      const t = choosePower(s, me, s.phase.power);
      return t ? usePower(s, t) : skipPower(s);
    }
    default:
      return s;
  }
}

const sameRef = (a: CardRef, b: CardRef) => a.owner === b.owner && a.slot === b.slot;

export function Table({ config, round, totals, onRoundEnd, onNextRound, onExit, onRules, onToggleMemoryAid }: Props) {
  const [state, setState] = useState<GameState>(() =>
    createGame(
      [
        { name: config.name, isHuman: true },
        ...BOT_NAMES.slice(0, config.bots).map((name) => ({ name, isHuman: false, difficulty: config.difficulty })),
      ],
      Math.random,
      (round - 1) % (config.bots + 1),
    ),
  );
  const [swapMine, setSwapMine] = useState<number | null>(null);
  const [peek, setPeek] = useState<{ ref: CardRef; card: Card } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const reported = useRef(false);
  const logEnd = useRef<HTMLDivElement>(null);

  const { phase, current } = state;
  const myTurn = current === HUMAN && phase.kind !== 'gameOver';
  const over = phase.kind === 'gameOver';
  const seats = SEATS[state.players.length];

  // Drive the bots, one visible step at a time.
  useEffect(() => {
    if (over || state.players[current].isHuman) return;
    const delay = phase.kind === 'draw' ? 900 : 1300;
    const t = setTimeout(() => setState(botStep(state)), delay);
    return () => clearTimeout(t);
  }, [state, over, current, phase.kind]);

  // Report the round once, then show the results after the reveal animation.
  useEffect(() => {
    if (!over || reported.current) return;
    reported.current = true;
    onRoundEnd(scores(state).map((s) => s.total));
  }, [over, state, onRoundEnd]);

  useEffect(() => {
    if (!over) return;
    const t = setTimeout(() => setShowResult(true), 1400);
    return () => clearTimeout(t);
  }, [over]);

  useEffect(() => {
    if (!peek) return;
    const t = setTimeout(() => setPeek(null), PEEK_MS);
    return () => clearTimeout(t);
  }, [peek]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' });
  }, [state.log.length]);

  const legal = useMemo(
    () => (myTurn && phase.kind === 'power' ? legalTargets(state, phase.power, HUMAN) : []),
    [state, myTurn, phase],
  );

  // -------------------------------------------------------------------------
  // Human actions
  // -------------------------------------------------------------------------

  const act = (next: GameState) => {
    setSwapMine(null);
    setState(next);
  };

  const applyPower = (t: PowerTarget) => {
    const next = usePower(state, t);
    if (t.power === 'peek' && next.lastPeek) setPeek({ ref: next.lastPeek.ref, card: next.lastPeek.card });
    act(next);
  };

  const cardClickable = (ref: CardRef): boolean => {
    if (!myTurn) return false;
    if (phase.kind === 'decide') return ref.owner === HUMAN && canReplace(state, ref.slot);
    if (phase.kind !== 'power') return false;
    switch (phase.power) {
      case 'peek':
      case 'lock':
      case 'unlock':
        return legal.some((t) => 'target' in t && sameRef(t.target, ref));
      case 'swap':
        if (ref.owner === HUMAN) return legal.some((t) => t.power === 'swap' && t.mine === ref.slot);
        return swapMine !== null && legal.some((t) => t.power === 'swap' && t.mine === swapMine && sameRef(t.target, ref));
      case 'shuffle':
        return legal.some((t) => t.power === 'shuffle' && t.owner === ref.owner);
    }
  };

  const onCardClick = (ref: CardRef) => {
    if (!cardClickable(ref)) return;
    if (phase.kind === 'decide') return act(replaceWithDrawn(state, ref.slot));
    if (phase.kind !== 'power') return;
    switch (phase.power) {
      case 'peek':
      case 'lock':
      case 'unlock':
        return applyPower({ power: phase.power, target: ref } as PowerTarget);
      case 'swap':
        if (ref.owner === HUMAN) return setSwapMine(ref.slot === swapMine ? null : ref.slot);
        return applyPower({ power: 'swap', mine: swapMine!, target: ref });
      case 'shuffle':
        return applyPower({ power: 'shuffle', owner: ref.owner });
    }
  };

  // -------------------------------------------------------------------------
  // Rendering helpers
  // -------------------------------------------------------------------------

  const highlighted = (ref: CardRef): boolean => {
    const a = state.lastAction;
    if (!a || a.kind === 'draw') return false;
    return a.refs.some((r) => sameRef(r, ref)) || a.owners.includes(ref.owner);
  };

  const hintFor = (ref: CardRef): Card | null => {
    if (!config.memoryAid) return null;
    const id = state.knowledge[HUMAN][ref.owner][ref.slot];
    return id === null ? null : cardById(id);
  };

  const final = over ? scores(state) : null;
  const winIds = over ? winners(state) : [];

  const renderPlayer = (id: number) => {
    const p = state.players[id];
    const seat = seats[id];
    const size = p.isHuman ? 'lg' : 'md';
    const active = current === id && !over;
    return (
      <div key={id} className={`seat seat-${seat} ${active ? 'active' : ''} ${winIds.includes(id) ? 'winner' : ''}`}>
        <div className="nameplate">
          <span className="avatar">{p.isHuman ? '★' : p.name.replace('Bot ', '')[0]}</span>
          <span className="pname">{p.isHuman ? `${p.name} (Anda)` : p.name}</span>
          {active && <span className="turn-pill">Giliran</span>}
          {final && <span className="score-pill">{final[id].total} mata</span>}
        </div>
        <div className="hand">
          {p.slots.map((slot, i) => {
            const ref = { owner: id, slot: i };
            const peeking = peek && sameRef(peek.ref, ref) && peek.card.id === slot.card.id;
            const hl = highlighted(ref);
            return (
              <CardView
                key={`${i}-${hl ? state.log.length : 'x'}`}
                card={slot.card}
                faceUp={over || !!peeking}
                size={size}
                locked={slot.locked}
                clickable={cardClickable(ref)}
                selected={phase.kind === 'power' && phase.power === 'swap' && id === HUMAN && swapMine === i}
                highlight={hl}
                hint={hintFor(ref)}
                label={over ? `${cardValue(slot.card)} mata` : `#${i + 1}`}
                onClick={() => onCardClick(ref)}
              />
            );
          })}
        </div>
      </div>
    );
  };

  const prompt = (() => {
    if (over) return 'Permainan tamat!';
    if (!myTurn) {
      const verb = phase.kind === 'draw' ? 'akan mencabut kad' : phase.kind === 'decide' ? 'sedang berfikir' : 'sedang menggunakan kuasa';
      return `${who(state, current)} ${verb}…`;
    }
    switch (phase.kind) {
      case 'draw':
        return 'Giliran anda — klik timbunan cabutan untuk mencabut kad.';
      case 'decide':
        return 'Klik salah satu kad anda untuk menggantikannya, atau buang kad ini.';
      case 'power':
        switch (phase.power) {
          case 'peek':
            return 'J · Intip: pilih mana-mana kad untuk dilihat secara rahsia.';
          case 'swap':
            return swapMine === null
              ? 'Q · Tukar: pilih salah satu kad anda (tidak berkunci).'
              : `Q · Tukar: sekarang pilih kad lawan untuk ditukar dengan kad #${swapMine + 1} anda.`;
          case 'lock':
            return 'K · Kunci: pilih kad (anda atau lawan) untuk dikunci.';
          case 'unlock':
            return '9 · Buka Kunci: pilih kad yang terkunci.';
          case 'shuffle':
            return '10 · Rombak: pilih pemain yang kadnya ingin dirombak.';
        }
    }
  })();

  const drawn = phase.kind === 'decide' ? phase.drawn : null;
  const topDiscard = state.discardPile.at(-1) ?? null;

  return (
    <div className="game">
      <div className="felt">
        <div className="table-grid">
          {state.players.map((p) => renderPlayer(p.id))}

          <div className="center">
            <div className="piles">
              <div className="pile">
                {state.drawPile.length ? (
                  <CardView
                    size="md"
                    clickable={myTurn && phase.kind === 'draw'}
                    highlight={myTurn && phase.kind === 'draw'}
                    onClick={() => act(draw(state))}
                    title="Cabut kad"
                  />
                ) : (
                  <div className="pile-empty">Habis</div>
                )}
                <div className="pile-label">Cabutan · {state.drawPile.length}</div>
              </div>

              <div className="pile held">
                {phase.kind === 'decide' ? (
                  <CardView card={drawn} faceUp={myTurn} size="lg" highlight={myTurn} />
                ) : (
                  <div className="held-empty">{phase.kind === 'power' ? POWER_INFO[phase.power].name : ''}</div>
                )}
                <div className="pile-label">{phase.kind === 'decide' ? (myTurn ? 'Kad anda' : `Dipegang ${who(state, current)}`) : ' '}</div>
              </div>

              <div className="pile">
                {topDiscard ? (
                  <CardView key={topDiscard.id} card={topDiscard} faceUp size="md" />
                ) : (
                  <div className="pile-empty">Kosong</div>
                )}
                <div className="pile-label">Buangan · {state.discardPile.length}</div>
              </div>
            </div>

            <div className={`prompt ${myTurn ? 'mine' : ''}`}>{prompt}</div>

            <div className="actions">
              {myTurn && phase.kind === 'decide' && (
                <button type="button" className="btn gold" onClick={() => act(discardDrawn(state))}>
                  Buang ke Tengah
                </button>
              )}
              {myTurn && phase.kind === 'power' && (
                <>
                  {phase.power === 'shuffle' &&
                    legal.map(
                      (t) =>
                        t.power === 'shuffle' && (
                          <button key={t.owner} type="button" className="btn gold small" onClick={() => applyPower(t)}>
                            {t.owner === HUMAN ? 'Kad saya' : state.players[t.owner].name}
                          </button>
                        ),
                    )}
                  <button type="button" className="btn ghost small" onClick={() => act(skipPower(state))}>
                    Langkau kuasa
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {peek && (
          <div className="peek-toast">
            Kad #{peek.ref.slot + 1} {peek.ref.owner === HUMAN ? 'anda' : state.players[peek.ref.owner].name} ialah{' '}
            <b>
              {peek.card.rank}
            </b>{' '}
            ({cardValue(peek.card)} mata). Ingat baik-baik!
          </div>
        )}
      </div>

      <aside className="sidebar">
        <div className="side-head">
          <div>
            <div className="brand">
              Lucky <span>7</span>
            </div>
            <div className="round">Pusingan {round}</div>
          </div>
          <div className="side-buttons">
            <button type="button" className="btn small ghost" onClick={onRules}>
              Peraturan
            </button>
            <button type="button" className="btn small ghost" onClick={onExit}>
              Menu
            </button>
          </div>
        </div>

        <label className="check compact">
          <input type="checkbox" checked={config.memoryAid} onChange={onToggleMemoryAid} />
          <span>Bantuan memori</span>
        </label>

        <div className="scoreboard">
          <div className="sb-title">Markah terkumpul</div>
          {state.players.map((p) => (
            <div key={p.id} className="sb-row">
              <span>{p.isHuman ? `${p.name} (Anda)` : p.name}</span>
              <b>{totals[p.id] ?? 0}</b>
            </div>
          ))}
        </div>

        <div className="log">
          <div className="sb-title">Log permainan</div>
          <div className="log-list">
            {state.log.map((e) => (
              <div key={e.id} className={`log-row ${e.actor === HUMAN ? 'me' : e.actor < 0 ? 'sys' : ''}`}>
                {e.text}
              </div>
            ))}
            <div ref={logEnd} />
          </div>
        </div>
      </aside>

      {showResult && final && (
        <div className="modal-backdrop">
          <div className="modal result">
            <h2>{winIds.includes(HUMAN) ? (winIds.length > 1 ? 'Seri — anda menang bersama!' : 'Tahniah, anda menang! 🎉') : 'Anda kalah kali ini'}</h2>
            <div className="result-list">
              {[...final]
                .sort((a, b) => a.total - b.total)
                .map((s) => {
                  const p = state.players[s.id];
                  return (
                    <div key={s.id} className={`result-row ${winIds.includes(s.id) ? 'win' : ''}`}>
                      <span className="rname">
                        {winIds.includes(s.id) && '👑 '}
                        {p.isHuman ? `${p.name} (Anda)` : p.name}
                      </span>
                      <span className="rcards">
                        {p.slots.map((sl) => (
                          <span key={sl.card.id} className={`chip ${sl.card.suit === 'H' || sl.card.suit === 'D' ? 'red' : ''}`}>
                            {sl.card.rank}
                          </span>
                        ))}
                      </span>
                      <span className="rscore">{s.total}</span>
                    </div>
                  );
                })}
            </div>
            <div className="result-actions">
              <button type="button" className="btn ghost" onClick={() => {
                  setShowResult(false);
                  setResultDismissed(true);
                }}>
                Lihat meja
              </button>
              <button type="button" className="btn ghost" onClick={onExit}>
                Menu utama
              </button>
              <button type="button" className="btn gold" onClick={onNextRound}>
                Pusingan seterusnya
              </button>
            </div>
          </div>
        </div>
      )}
      {over && !showResult && resultDismissed && (
        <button type="button" className="btn gold floating" onClick={() => setShowResult(true)}>
          Lihat keputusan
        </button>
      )}
    </div>
  );
}
