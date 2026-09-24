# Lucky 7

Permainan kad berasaskan strategi, memori dan kepantasan membuat keputusan. Matlamat: miliki 3 kad dengan **jumlah mata paling rendah** apabila timbunan cabutan habis.

Versi pertama ini ialah web game **desktop**: anda lawan 1–3 bot AI.

## Menjalankan

```bash
npm install
npm run dev      # buka http://localhost:5173
npm test         # ujian enjin permainan
npm run build    # binaan produksi ke dist/
```

## Laragon / XAMPP (tanpa Node.js)

Repo ini menyertakan versi siap-bina dalam `dist/`, jadi ia boleh terus dijalankan:

1. `git clone` ke dalam folder `www` Laragon (contohnya `C:\laragon\www\lucky7`).
2. Pastikan Laragon (Apache) sedang berjalan.
3. Buka **http://localhost/lucky7**. `index.php` akan mengalihkan anda ke `dist/`.

Jika anda mengubah kod dalam `src/`, bina semula dengan `npm install` dan `npm run build`, kemudian commit folder `dist/` yang dikemas kini.

## Peraturan ringkas

| Kad | Mata | Kuasa (apabila masuk ke timbunan buang) |
| --- | --- | --- |
| 7 | 0 | — |
| A | 1 | — |
| 2–6, 8 | ikut angka | — |
| 9 | 9 | **Buka Kunci**: buka kunci mana-mana kad |
| 10 | 10 | **Rombak**: rombak kedudukan kad sendiri atau seorang lawan |
| J | 10 | **Intip**: lihat 1 kad sendiri atau lawan |
| Q | 10 | **Tukar**: tukar 1 kad anda dengan 1 kad lawan |
| K | 10 | **Kunci**: kunci 1 kad (anda atau lawan) |

Setiap giliran: cabut 1 kad, kemudian **gantikan** salah satu kad anda (kad lama dibuang terbuka) atau **buang** kad itu terus.

Keputusan reka bentuk yang dipilih:

- Kuasa aktif untuk **kedua-dua** kes: kad kuasa yang dicabut lalu dibuang, dan kad kuasa lama yang keluar dari tangan. Penggunaan kuasa adalah pilihan.
- Kad yang dikunci **kebal sepenuhnya**: tidak boleh ditukar, diganti (walaupun oleh pemiliknya) atau dirombak, sehingga dibuka dengan kad 9.
- Kuasa 10: pemain yang merombak tahu susunan baharu; pemain lain hilang jejak kad tersebut.
- Tiada pemain tahu kadnya pada awal permainan. Pilihan "Bantuan memori" menunjukkan kad yang pernah anda lihat.
- Markah sama = menang bersama. Markah terkumpul disimpan merentas pusingan.

## Struktur kod

```
src/
  engine/          Logik permainan tulen (tiada UI), mudah diuji & diguna semula
    cards.ts       Dek, nilai kad, kuasa, PRNG
    game.ts        Keadaan permainan, tindakan, model "pengetahuan" setiap pemain
    bot.ts         AI bot (Mudah / Biasa / Sukar)
    game.test.ts   Ujian unit + simulasi ratusan permainan bot
  ui/              Komponen React (meja, kad, tetapan, peraturan)
```

Enjin menjejak `knowledge[pemerhati][pemilik][slot]`: kad yang setiap pemain tahu. Bot hanya membuat keputusan berdasarkan apa yang ia "ingat", sama seperti pemain manusia. Ini juga asas untuk mod online pada masa hadapan.

## Idea seterusnya

- Mod online multiplayer (WebSocket), dengan enjin sama dijalankan di server
- Versi mudah alih / responsif
- Kesan bunyi dan animasi kad bergerak antara tempat
- Statistik & rekod kemenangan
