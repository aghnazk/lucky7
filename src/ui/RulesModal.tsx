import { POWER_INFO, type Power } from '../engine/cards';

const POWERS: Power[] = ['peek', 'swap', 'lock', 'unlock', 'shuffle'];

export function RulesContent() {
  return (
    <div className="rules">
      <h3>Objektif</h3>
      <p>
        Miliki 3 kad di hadapan anda dengan <strong>jumlah mata paling rendah</strong> apabila timbunan cabutan habis.
      </p>

      <h3>Nilai Kad</h3>
      <ul className="values">
        <li>
          <b>7</b> = 0 mata (kad terbaik!)
        </li>
        <li>
          <b>A</b> = 1 mata
        </li>
        <li>
          <b>2–6, 8</b> = ikut angka
        </li>
        <li>
          <b>9, 10</b> = ikut angka
        </li>
        <li>
          <b>J, Q, K</b> = 10 mata
        </li>
      </ul>

      <h3>Giliran</h3>
      <ol>
        <li>Cabut 1 kad dari timbunan tengah dan lihat secara rahsia.</li>
        <li>
          <b>Tukar</b>: letak kad itu (tertutup) menggantikan salah satu kad anda. Kad lama dibuang secara terbuka.
          <br />
          <b>Buang</b>: buang terus kad yang dicabut ke timbunan buang.
        </li>
        <li>
          Jika kad yang masuk ke timbunan buang ialah <b>Kad Kuasa</b> (sama ada kad cabutan atau kad lama dari tangan),
          anda boleh mengaktifkan kuasanya atau melangkaunya.
        </li>
      </ol>

      <h3>Kad Kuasa</h3>
      <ul className="powers">
        {POWERS.map((p) => (
          <li key={p}>
            <span className="power-rank">{POWER_INFO[p].rank}</span>
            <div>
              <b>{POWER_INFO[p].name}</b> — {POWER_INFO[p].desc}
            </div>
          </li>
        ))}
      </ul>

      <h3>Peraturan Tambahan</h3>
      <ul>
        <li>Anda tidak tahu nilai kad sendiri pada awal permainan. Gunakan memori dan kuasa Intip!</li>
        <li>
          Kad yang <b>dikunci</b> kebal sepenuhnya: tidak boleh ditukar, diganti (walaupun oleh pemiliknya) atau dirombak,
          sehingga dibuka dengan kad 9.
        </li>
        <li>Pemain yang merombak (10) tahu susunan baharu; pemain lain hilang jejak kad tersebut.</li>
        <li>Permainan tamat apabila timbunan cabutan habis. Markah sama = menang bersama.</li>
      </ul>
    </div>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Cara Bermain</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>
        <RulesContent />
      </div>
    </div>
  );
}
