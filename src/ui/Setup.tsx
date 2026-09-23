import { useState } from 'react';
import type { Difficulty } from '../engine/game';

export interface GameConfig {
  name: string;
  bots: number;
  difficulty: Difficulty;
  memoryAid: boolean;
}

const DIFFICULTIES: { id: Difficulty; label: string; desc: string }[] = [
  { id: 'mudah', label: 'Mudah', desc: 'Bot pelupa dan kadang-kadang cuai.' },
  { id: 'biasa', label: 'Biasa', desc: 'Bot berfikir dengan baik tetapi tidak sempurna.' },
  { id: 'sukar', label: 'Sukar', desc: 'Bot dengan memori sempurna.' },
];

interface Props {
  initial: GameConfig;
  onStart: (config: GameConfig) => void;
  onRules: () => void;
}

export function Setup({ initial, onStart, onRules }: Props) {
  const [cfg, setCfg] = useState(initial);
  const set = <K extends keyof GameConfig>(k: K, v: GameConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <div className="setup">
      <div className="logo">
        <div className="logo-cards">
          <span className="mini-card">7♠</span>
          <span className="mini-card red">7♥</span>
          <span className="mini-card red">7♦</span>
        </div>
        <h1>
          Lucky <span>7</span>
        </h1>
        <p className="tagline">Strategi · Memori · Kepantasan</p>
      </div>

      <form
        className="setup-panel"
        onSubmit={(e) => {
          e.preventDefault();
          onStart({ ...cfg, name: cfg.name.trim() || 'Pemain' });
        }}
      >
        <label className="field">
          <span>Nama anda</span>
          <input value={cfg.name} maxLength={16} onChange={(e) => set('name', e.target.value)} placeholder="Pemain" />
        </label>

        <div className="field">
          <span>Bilangan lawan (bot)</span>
          <div className="seg">
            {[1, 2, 3].map((n) => (
              <button type="button" key={n} className={cfg.bots === n ? 'on' : ''} onClick={() => set('bots', n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Tahap kesukaran</span>
          <div className="seg">
            {DIFFICULTIES.map((d) => (
              <button
                type="button"
                key={d.id}
                className={cfg.difficulty === d.id ? 'on' : ''}
                onClick={() => set('difficulty', d.id)}
                title={d.desc}
              >
                {d.label}
              </button>
            ))}
          </div>
          <small>{DIFFICULTIES.find((d) => d.id === cfg.difficulty)?.desc}</small>
        </div>

        <label className="check">
          <input type="checkbox" checked={cfg.memoryAid} onChange={(e) => set('memoryAid', e.target.checked)} />
          <span>
            Bantuan memori <small>(tunjuk kad yang pernah anda lihat — sesuai untuk pemula)</small>
          </span>
        </label>

        <button type="submit" className="btn gold big">
          Mula Bermain
        </button>
        <button type="button" className="btn ghost" onClick={onRules}>
          Cara Bermain
        </button>
      </form>
    </div>
  );
}
