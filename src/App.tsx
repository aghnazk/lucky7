import { useCallback, useState } from 'react';
import { RulesModal } from './ui/RulesModal';
import { type GameConfig, Setup } from './ui/Setup';
import { Table } from './ui/Table';

const DEFAULT_CONFIG: GameConfig = { name: 'Pemain', bots: 2, difficulty: 'biasa', memoryAid: false };

export function App() {
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [playing, setPlaying] = useState(false);
  const [round, setRound] = useState(1);
  const [totals, setTotals] = useState<number[]>([]);
  const [rules, setRules] = useState(false);

  const onRoundEnd = useCallback((roundScores: number[]) => {
    setTotals((t) => roundScores.map((s, i) => (t[i] ?? 0) + s));
  }, []);

  const start = (cfg: GameConfig) => {
    setConfig(cfg);
    setRound(1);
    setTotals([]);
    setPlaying(true);
  };

  return (
    <>
      {playing ? (
        <Table
          key={round}
          config={config}
          round={round}
          totals={totals}
          onRoundEnd={onRoundEnd}
          onNextRound={() => setRound((r) => r + 1)}
          onExit={() => setPlaying(false)}
          onRules={() => setRules(true)}
          onToggleMemoryAid={() => setConfig((c) => ({ ...c, memoryAid: !c.memoryAid }))}
        />
      ) : (
        <Setup initial={config} onStart={start} onRules={() => setRules(true)} />
      )}
      {rules && <RulesModal onClose={() => setRules(false)} />}
    </>
  );
}
