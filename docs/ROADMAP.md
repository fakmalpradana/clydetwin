# ClydeTwin: Roadmap Eksekusi Berfase (versi matang)

## Context

Plan asal (`~/Downloads/glasgow-digital-twin-plan.md`) sudah lengkap sebagai *visi*: data inventory, lisensi, arsitektur, dan analitik. Kelemahannya sebagai *rencana eksekusi*:
- Fase 0 makan 3 minggu tanpa output yang bisa dilihat, dan 3D baru muncul akhir Desember.
- Beberapa fase menumpuk banyak hal sekaligus (Fase 2 = semua collector + transit + aviasi + WebSocket), jadi deliverable-nya baru terasa di akhir.
- Stack awal terlalu berat (Martin, Prefect, 3DCityDB, workspace package) untuk hal yang belum dibutuhkan.

Goal: **portfolio Fairuz bertambah secepat mungkin dengan Glasgow digital twin yang online.** Setiap phase berakhir dengan URL publik yang bisa dipakai dan satu artefak portfolio (blog/GIF/post). Phase 1 = kota 3D online. Eksekusi oleh Sonnet, review akhir per phase oleh Opus, Fairuz memantau dan mengerjakan task yang hanya bisa dilakukan manusia.

Keputusan yang sudah dikunci: **pg2b3dm** untuk 3D Tiles (convertwin masuk saat LoD2 di Phase 4), **hosting gratis + VM ~£5/bln mulai Phase 2**, **pace maksimal** (agent yang implementasi, bukan jam Fairuz), **setiap progress di-commit dengan git yang rapi**, **Immersive viewer dasar sudah ada di Phase 1**, lisensi AGPL (kode) / CC BY-SA (data), README GitHub lengkap.

Repo: `/Users/akmal/Desktop/3_dummy/clydetwin` (masih kosong). Plan asal tetap jadi referensi detail (endpoint, lisensi, metode) dan disalin ke `docs/reference-plan.md`.

---

## Protokol Eksekusi (Opus ↔ Sonnet ↔ Fairuz)

| Peran | Tugas |
|---|---|
| **Opus (saya)** | Menulis brief phase (`docs/phases/PN.md`: task + acceptance), memecah jadi workstream, dispatch agent Sonnet, menjalankan **gate review** di akhir phase, mengirim temuan balik ke agent sampai lulus. |
| **Sonnet (agent `general-purpose`, `model: sonnet`)** | Implementasi task berurutan, commit per task di branch `phase-N`, update `docs/PROGRESS.md` setiap task selesai. |
| **Fairuz** | Mengerjakan **Track USER** (akun, key, pembayaran, email, publish), memantau `PROGRESS.md`, approve merge ke `main` + deploy produksi + publikasi blog/CV/Upwork. |

**Alur per phase:**
1. Opus menulis brief → Fairuz skim (opsional).
2. Sonnet mengerjakan workstream. Default berurutan. Paralel hanya kalau direktori tidak bersinggungan (mis. `pipelines/` vs `web/`).
3. **Gate Opus:** clone/checkout bersih, jalankan sendiri semua acceptance check (tidak percaya laporan "GREEN" dari agent), baca diff, cek preview deployment di browser pane.
4. Temuan dikirim ke agent yang sama (SendMessage) → fix → gate ulang.
5. Lulus → Fairuz approve → merge `main`, deploy prod, publish artefak.

**Disiplin Git (wajib, dicek di setiap gate):**
- `main` selalu deployable dan dilindungi. Satu branch per phase (`phase-1-glasgow-3d`). Sub-branch per workstream kalau paralel (`p1/pipeline`, `p1/web`), di-merge ke branch phase.
- **Setiap task selesai = 1+ commit atomik + push.** Format Conventional Commits dengan scope: `feat(pipeline): ...`, `fix(web): ...`, `docs(adr): ...`, `chore(infra): ...`. Body menjelaskan *kenapa*. Commit WIP tidak boleh masuk ke branch phase (rapikan dulu sebelum push dengan `git commit --fixup` + `rebase --autosquash` hanya di branch sendiri yang belum di-review).
- Akhir phase: PR `phase-N → main` dengan deskripsi (ringkasan, checklist acceptance, screenshot), di-merge dengan merge commit (histori task tetap terbaca), lalu tag `v0.N.0` + entri `CHANGELOG.md` (Keep a Changelog) + GitHub Release.
- `pre-commit`: ruff (lint+format), prettier/eslint untuk web, `gitleaks`, check-added-large-files (maks 1 MB). Data mentah, tiles, dan `.env` tidak pernah masuk git (`data/`, `build/` di `.gitignore`).
- `docs/PROGRESS.md` diupdate di commit yang sama dengan task-nya.
- CI GitHub Actions dari P1: lint + pytest + build web di setiap push/PR.

**Aturan keras untuk agent Sonnet:**
- Tidak membuat akun, mengisi kredensial, membayar, atau mengirim email. Secret hanya di `.env` (gitignored) yang diisi Fairuz; `.env.example` di-commit.
- Tidak publish apa pun (repo publik, prod deploy, post) tanpa approve Fairuz.
- Lisensi §4.2 plan asal adalah hard rule: tiles publik hanya dari OpenMap Local + LiDAR; NGD/Digimap hanya validasi internal; EPC tanpa alamat; layer ODbL (OSM/adsb.lol) dipisah.
- **Stop-and-escalate:** jika data tidak tersedia, lisensi ambigu, atau endpoint berubah, agent berhenti dan melapor. Tidak boleh berimprovisasi dengan sumber lain.
- Download besar jalan di background, resumable, dengan checksum.

**Simplifikasi dari plan asal (sengaja):**
- Phase 1 hanya memakai raster DSM/DTM, belum LAZ (hemat ratusan GB). LAZ baru dipakai untuk LoD2 di Phase 4.
- Belum ada Martin/pg_tileserv, Prefect, 3DCityDB, atau workspace `packages/data`. Cukup Makefile + Docker Compose, migrasi berupa file SQL biasa, kode bersama kedua viewer di `web/lib/` (config tileset, konversi koordinat, skema atribut). Tambahkan nanti kalau memang terasa kurang.

**Lisensi ("melindungi namun terbuka"):**
| Bagian | Lisensi | Alasan |
|---|---|---|
| Kode | **AGPL-3.0-or-later** | Terbuka penuh, tetapi siapa pun yang meng-host versi modifikasi sebagai layanan web wajib membuka source-nya. Celah SaaS yang ada di MIT/GPL tertutup. Fairuz sebagai pemegang hak cipta tetap bisa dual-license kalau nanti dibutuhkan secara komersial. |
| Data turunan (tiles, atribut analitik) | **CC BY-SA 4.0** (layer turunan OSM/adsb.lol: **ODbL**) | Wajib atribusi + share-alike. Kompatibel dengan input OGL v3. |
| Dokumentasi, blog, metode | **CC BY 4.0** | Mudah dikutip dan disebarkan. |
Dicatat di `LICENSE`, `DATA_LICENSES.md`, header SPDX di file kode, dan `CITATION.cff`.
- Zona banjir untuk tampilan memakai WMS/MapServer SEPA langsung, tanpa processing. Processing baru dibutuhkan untuk eksposur per bangunan (Phase 4).
- Terrain Phase 1 sementara memakai Cesium World Terrain (ion), lalu diganti terrain sendiri dari DTM di Phase 2 (dicatat di ADR).

---

## Track USER (jalan paralel, mulai hari ini)

Approval akun butuh waktu, jadi semua didaftarkan **minggu pertama** walaupun baru dipakai di phase berikutnya.

| Kapan dibutuhkan | Task Fairuz |
|---|---|
| P1 hari 1 | Buat repo GitHub (atau approve `gh repo create` publik); akun Cesium ion → token; akun Cloudflare + bucket R2 + API token (Cloudflare minta kartu); akun Vercel; isi `.env` + GitHub Secrets |
| P1 minggu 1 | Daftar: Glasgow developer portal, OS Data Hub, Spatial Hub, BODS, Rail Data Marketplace (Darwin JSON + TD), OpenSky API client, Digimap (via akun UofG) |
| P1 minggu 1 | Kirim email akses GBFS ke Voi (draft dari Opus) |
| P2 awal | Sewa VM (Hetzner CX22 atau setara) + SSH key; akun Healthchecks.io + UptimeRobot; domain opsional (default: `<ip>.sslip.io` + Caddy TLS) |
| P4 awal | SSD eksternal untuk LAZ; aktifkan OS Premium (NGD) untuk validasi |
| Tiap akhir phase | Approve merge/deploy; publish blog + post LinkedIn; approve update CV/Upwork portfolio |

---

## Phase 1: "Glasgow in 3D" (2–16 Okt 2026)

**Deliverable:** URL publik, berisi landing auto-orbit + `/explore` (Cesium) dengan LoD1 **seluruh Glasgow City**. Bangunan bisa diklik (tinggi, luas, ground z, sumber tinggi, tahun LiDAR), diwarnai berdasarkan tinggi, URL kamera bisa dibagikan, ada halaman atribusi. Ditambah **`/immersive` v0.1** (R3F) yang memuat tileset yang sama. README lengkap, release `v0.1.0`.

**Kenapa Immersive sudah masuk P1:** memastikan sejak awal bahwa output pipeline (3D Tiles 1.1 + metadata, tinggi ellipsoid) terbaca benar di **dua renderer**. Setiap ekspansi data (terrain sendiri, LoD2, kendaraan) langsung teruji di keduanya, jadi Phase 5 tinggal menambah efek, tidak perlu memperbaiki fondasi.

1. **Scaffold:** `git init` + branch `phase-1-glasgow-3d`, struktur `pipelines/ web/ db/ docs/ collectors/`, `pyproject.toml` (uv), `Makefile`, `docker-compose.yml` (PostGIS lokal), `.env.example`, `.gitignore`, `.pre-commit-config.yaml`, CI workflow, `LICENSE` (AGPL-3.0), `DATA_LICENSES.md`, `CITATION.cff`, `CHANGELOG.md`, `docs/PROGRESS.md`, salin plan asal → `docs/reference-plan.md`. Commit pertama: `chore: scaffold repository`.
2. **Spike verifikasi data** (subset §15): cakupan SRSP LiDAR untuk Glasgow (fase mana, tahun, resolusi DSM/DTM, apakah National LiDAR 2025–27 sudah masuk), unduh 1 tile City Centre, cek CRS + datum vertikal (ODN), unduh OS OpenMap Local grid NS. Output: `docs/data-verification.md` + keputusan sumber LiDAR. *Escalate ke Opus jika cakupan bolong.*
3. **AOI:** batas Glasgow City (OS Boundary-Line, OGL) + buffer 500 m → `data/aoi.gpkg`. Koridor bandara ditunda ke P3 (cukup ubah config).
4. **Raster:** unduh tile DSM/DTM yang beririsan AOI (script resumable) → `gdalbuildvrt` → nDSM = DSM − DTM → COG (nDSM, DTM, hillshade).
5. **Footprint:** OpenMap Local buildings → clip AOI.
6. **Tinggi per bangunan:** `exactextract` → `h_p50/p70/p90/max`, `ground_z` (DTM p10), `area`, `valid_px_ratio`. Tinggi LoD1 = `h_p70`. Flag `height_source = lidar | default` untuk bangunan yang dibangun setelah akuisisi LiDAR atau tanpa piksel valid (default 6 m, diberi warna berbeda di viewer, persentasenya dilaporkan).
7. **Datum vertikal:** `ground_z` ODN → tinggi ellipsoid ETRS89 via pyproj + grid OSGM15 (`uk_os_OSGM15_GB.tif`). **pytest dengan test vector resmi OSTN15/OSGM15** dari OS developer pack.
8. **3D Tiles:** load ke PostGIS → **pg2b3dm** (Docker) → 3D Tiles 1.1 + atribut sebagai metadata → `3d-tiles-validator` harus 0 error. Catat ukuran total.
9. **Hosting tiles:** upload ke R2 via `rclone` (CORS + `Cache-Control` immutable). Target `make publish-tiles`.
10. **Web** (Next.js App Router + TS + CesiumJS langsung, tanpa resium; Tailwind):
    - `/`: hero auto-orbit + pitch 1 kalimat + CTA.
    - `/explore`: ion World Terrain (interim) + tileset + style tinggi (viridis) + panel info saat klik + toggle layer + state kamera di query string + lighting matahari sesuai jam nyata.
    - `/about/data`: atribusi §4.3 + disclaimer non-operasional.
11. **`/immersive` v0.1** (React Three Fiber + `3d-tiles-renderer` + `@takram/three-atmosphere`, versi dikunci):
    - Memuat tileset LoD1 yang sama dari R2. Terrain via `CesiumIonAuthPlugin`/`QuantizedMeshPlugin` jika didukung versi terkunci; jika tidak, cukup ground plane (dicatat di ADR-004).
    - Langit + matahari fisik sesuai jam nyata Glasgow, kamera orbit, material bangunan netral + bayangan matahari.
    - Deteksi GPU (`detect-gpu`): perangkat lemah/mobile diarahkan ke `/explore` dengan tombol "coba Immersive".
    - Tombol switch dua arah `/explore ↔ /immersive` yang membawa posisi kamera lewat query string. Konversi kamera ada di `web/lib/camera.ts` (dipakai kedua viewer).
    - Sengaja **belum** ada awan volumetrik, shader fasad, atau kendaraan (masuk Phase 5).
12. **Deploy** ke Vercel (preview → prod setelah gate).
13. **Mulai arsip data (penting, history tidak bisa diulang):** GitHub Actions cron `*/15` → level sungai + hujan SEPA KiWIS (stasiun Glasgow) + Open-Meteo UKMO → NDJSON di R2 `raw/`. SCOOT ditambahkan begitu key Glasgow portal keluar.
14. **Docs:** README lengkap (lihat standar README di bawah), ADR-001 (OpenMap Local vs NGD), ADR-002 (terrain interim), ADR-003 (pg2b3dm), ADR-004 (dua renderer + kontrak data bersama), ADR-005 (lisensi), `docs/methods/lod1.md` (berisi statistik QA).
15. **Rilis:** PR `phase-1 → main`, tag `v0.1.0`, GitHub Release dengan GIF + link demo.
16. **Portfolio:** draft blog #1 "City-scale LoD1 of Glasgow from open LiDAR", draft post LinkedIn, draft baris CV/Upwork (perlu approve).

**Gate P1 (Opus):** `make lod1` reproducible dari clone bersih (sample 1 tile); kelengkapan ≥ 98% footprint; % `default` dilaporkan; test datum hijau; validator 0 error; tinggi 5 landmark dibandingkan dengan tinggi terpublikasi (selisih wajar); 5 titik dicek tidak melayang/tenggelam > 2 m terhadap terrain; prod URL memunculkan bangunan < 5 dtk di broadband dan bisa dibuka di mobile; **`/immersive` memuat tileset yang sama di posisi identik dengan `/explore` (cek 3 landmark), ≥ 30 fps di MacBook, fallback GPU lemah jalan**; atribusi lengkap; **histori git rapi** (conventional commits, tanpa WIP/secret/file besar, CI hijau); README memenuhi standar.

---

## Phase 2: "Glasgow Now" (17 Okt–15 Nov 2026)

**Deliverable:** kota 3D di atas **terrain sendiri**, ditambah kondisi lingkungan live (cuaca, sungai, hujan, kualitas udara), halaman `/live`, zona banjir SEPA, dan grafik 24 jam.

1. **Infra VM:** Docker Compose berisi `timescale/timescaledb-ha` (sudah termasuk PostGIS), `api` (FastAPI), `collectors` (satu container, scheduler loop), dan Caddy (TLS). Migrasi berupa `db/migrations/*.sql` (schema `ref`, `ts`, `meta`).
2. **Collector:** satu helper `collectors/common.py` (retry, validasi pydantic, upsert idempotent, `meta.ingest_runs`). Collector: weather (Open-Meteo UKMO grid 3×3, termasuk `cloud_cover_low/mid/high` untuk Immersive nanti), SEPA (katalog stasiun + level + hujan 15m), air quality (SAQD situs Glasgow; verifikasi dulu metode aksesnya).
3. **Backfill:** impor arsip R2 dari P1 + histori KiWIS. Pindahkan cron arsip dari GitHub Actions ke VM, sambil tetap dump raw harian ke R2.
4. **API:** `/api/v1/stations` (GeoJSON), `/timeseries/{id}`, `/now`, `/health`. CORS hanya untuk domain web. pytest dengan seed DB.
5. **Terrain sendiri:** DTM → tinggi ellipsoid (OSGM15) → quantized-mesh (`tumgis/ctb-quantized-mesh`) → R2. Viewer pindah ke terrain ini, ion jadi fallback. Cek ulang alignment bangunan.
6. **Layer statis lingkungan:** SEPA Flood Maps via ImageryProvider (WMS/MapServer langsung), OS Open Rivers, Greenspace.
7. **Web:** `/live` (kartu + grafik 24 jam + badge "last updated/stale"), ticker bawah di `/explore`, gauge sungai sebagai entitas 3D berwarna status, widget cuaca, toggle zona banjir.
8. **Monitoring:** ping Healthchecks per collector, UptimeRobot ke `/health`, `/admin/health` sederhana.
9. **Docs + blog #2** "Streaming a city's environment" + ADR-004 (VM vs serverless) + ADR-005 (terrain).

**Gate P2:** ingest 72 jam tanpa gap > 2× interval (dicek via query); pytest API hijau; `gitleaks` bersih dan tidak ada secret di bundle web; RAM VM idle < 60%; alignment terrain–bangunan lolos di `/explore` **dan** `/immersive`; Lighthouse `/live` mobile ≥ 80; release `v0.2.0` + README terupdate.

---

## Phase 3: "Moving City" (16 Nov–20 Des 2026)

**Deliverable:** kota yang bergerak: arus lalu lintas, parkir, bus terjadwal, Subway (simulasi), kereta live, pesawat live, ditambah time slider replay 24 jam. Semuanya diberi label jujur *live / scheduled / simulated*.

1. **AOI diperluas ke Glasgow Airport:** jalankan ulang pipeline LoD1 dan terrain hanya dengan mengubah config (sekaligus menguji reproducibility).
2. **Collector Glasgow portal:** SCOOT, car park, cycle counter, DATEX II → hypertable + compression + continuous aggregate (15 mnt, 1 jam).
3. **GTFS BODS:** unduh mingguan → filter AOI → `ref.gtfs_*` → endpoint trip aktif (shape + stop_times untuk window 1 jam). Interpolasi posisi di klien (`web/lib/vehicles.ts`, nanti dipakai ulang oleh Immersive).
4. **Subway simulasi:** geometri OSM `railway=subway` + 15 stasiun NaPTAN + headway → jalur interpolasi yang sama.
5. **Rail:** konsumer Kafka Darwin Push Port, difilter ke TIPLOC Glasgow → `ts.rail_events` → posisi kereta diinterpolasi antar stasiun di geometri rel OSM. Pemetaan berth TD = *Could*.
6. **Aviasi:** poller OpenSky OAuth2 (~20 dtk, bbox ±40 km, patuhi header rate-limit) dengan fallback adsb.lol → `ts.aircraft_positions` (retensi 30 hari) + METAR EGPF untuk QNH + deteksi arrival/departure EGPF.
7. **Realtime:** FastAPI SSE `/api/v1/stream/vehicles`. Kredensial tidak pernah sampai ke browser.
8. **Web:** grup layer mobilitas; SCOOT sebagai garis berwarna di OS Open Roads (detektor di-snap ke link terdekat); car park sebagai bar; model glTF CC0 untuk bus/kereta/pesawat; kamera follow; time slider via Cesium clock + `SampledPositionProperty`.
9. **Blog #3** "Streaming a city: sensors, trains and aircraft" + ADR.

**Gate P3:** SSE stabil 1 jam; bundle web bebas kredensial; CPU/RAM VM aman saat konsumer rail jalan; 3 trip bus dicocokkan dengan timetable; compression Timescale aktif; badge live/scheduled/simulated benar; pesawat + kereta tampil juga di `/immersive` (titik/model sederhana); release `v0.3.0` + README terupdate.

---

## Phase 4: "Analytical Twin" (Jan–Feb 2027)

**Deliverable:** LoD2 pilot City Centre/Merchant City + atribut analitik per bangunan + styling tematik + `/scenarios/flood` + laporan validasi publik.

1. **LoD2 pilot:** LAZ pilot (SSD) → PDAL → **roofer** (Docker) → CityJSON LoD2.2 → `val3dity`.
2. **Validasi:** tinggi NGD + Digimap BHA (internal) → grid search parameter roofer → laporan RMSE LoD1 & LoD2 (hanya angka agregat).
3. **Tiles LoD2:** coba **convertwin** di sini sebagai showcase (fallback pg2b3dm). Pilot LoD2 menggantikan LoD1 di area pilot.
4. **Kunci join:** OS Open UPRN + Linked Identifiers → crosswalk `building_id ↔ TOID ↔ UPRN`.
5. **Analitik per bangunan:** X1 (volume, jumlah lantai), X3 (eksposur banjir per return period), X6 (kebisingan Round 4), EPC teragregasi tanpa alamat, flag heritage HES. Tileset di-rebuild dengan atribut baru.
6. **Data Zones 2022 + SIMD + populasi** (lookup DZ2011→2022 dan keterbatasannya didokumentasikan) → choropleth.
7. **Web:** switcher tematik (tinggi/EPC/banjir/kebisingan/heritage) dengan legenda colorblind-safe, `/scenarios/flood`, `/about/methods`.
8. **Blog #4** (LoD2 + validasi) + abstrak konferensi (cek deadline GISRUK 2027 / 3D GeoInfo).

**Gate P4:** `val3dity` ≥ 95% valid; RMSE atap LoD2 < 0,5 m; RMSE LoD1 < 2 m vs NGD; tiles publik tidak memuat field NGD/BHA (cek daftar atribut); schema EPC publik tanpa kolom alamat (dijaga test); LoD2 pilot tampil di `/immersive`; release `v0.4.0` + README terupdate.

---

## Phase 5: "Immersive Glasgow" (Mar 2027)

**Deliverable:** `/immersive` v1 berupa "Glasgow Now" sinematik yang efek visualnya digerakkan data.

Fondasinya (renderer, atmosfer, tileset, fallback GPU, sinkron kamera) sudah ada sejak P1, dan **setiap phase P2–P4 wajib memastikan data barunya ikut tampil minimal di `/immersive`** (terrain sendiri di P2, kendaraan di P3, LoD2 di P4). P5 tinggal menambah efek: awan volumetrik `@takram/three-clouds`, layer awan dari cloud cover UKV; hujan dari SEPA/UKV; water plane Clyde mengikuti gauge; shader fasad prosedural (palet batu pasir) + lampu jendela malam; kendaraan dan pesawat dari `web/lib/vehicles.ts`; mode kamera orbit/drone tour/follow/time-lapse; preset kualitas. Rekam klip demo untuk LinkedIn.

**Gate P5:** ≥ 50 fps preset Medium di MacBook; fallback mobile jalan; tidak ada error console.

**Apr–Mei 2027 (ujian):** hanya maintenance. Opus melakukan health check mingguan (collector, VM, URL) dan fix kritis saja.

---

## Phase 6: "Full City + Research" (Jun–Jul 2027)

LoD2 seluruh kota (batch per tile 1 km, Cloud Run Jobs / spot VM); X4 surya; X7 ketimpangan; X8 pola lalu lintas (memakai arsip SCOOT ~8 bulan sejak P1); X9 aksesibilitas (r5py + GTFS); X10 nowcast sungai PINN-LSTM (selaras dengan dissertation, keputusan riset dipegang Fairuz); X11–X16; `/insights` data stories dengan deck.gl TripsLayer.

## Phase 7: "v1.0 & Diseminasi" (Agu 2027)

Audit performa + aksesibilitas (Lighthouse landing ≥ 90); video 2–3 menit; Gaussian splat 2–3 landmark (opsional); rilis v1.0 + DOI Zenodo; paper/poster; update CV/Upwork/LinkedIn (dengan approve).

---

## Standar README GitHub (dicek di setiap gate, diupdate setiap phase)

1. Judul + tagline 1 kalimat + badge (license, CI, versi, demo live, DOI nanti).
2. GIF/screenshot hero (`/explore` dan `/immersive`) + link **Live demo**.
3. "What is ClydeTwin": pitch singkat dan narasi 100% open data.
4. Fitur + tabel **status per phase** (✅ / 🚧 / ⏳).
5. Diagram arsitektur (mermaid): data → pipeline → storage → API → dua viewer.
6. Tabel sumber data: dataset, penerbit, lisensi, frekuensi update (link ke `DATA_LICENSES.md`).
7. **Quickstart:** prasyarat (Docker, uv, Node), `cp .env.example .env`, `make lod1`, `make dev`, perkiraan waktu dan disk.
8. Struktur repo + daftar target `make`.
9. Metodologi & validasi: angka QA utama + link `docs/methods/`.
10. Roadmap (link ke `docs/ROADMAP.md`) + CHANGELOG.
11. Kontribusi (`CONTRIBUTING.md` singkat: commit convention, pre-commit, cara menjalankan test).
12. Sitasi (`CITATION.cff`), lisensi (kode AGPL, data CC BY-SA/ODbL, docs CC BY), atribusi wajib OS/SEPA/LiDAR.
13. Disclaimer non-operasional + author (Fairuz Akmal Pradana, MSc Computational Geoscience, UofG) + kontak/LinkedIn.

## Verifikasi End-to-End

- Setiap phase punya gate yang dijalankan sendiri oleh Opus di checkout bersih: test (`pytest`, datum test vectors, `3d-tiles-validator`, `val3dity`, `gitleaks`), query DB untuk gap ingest, dan inspeksi URL preview di browser pane (load time, klik bangunan, console error, tampilan mobile).
- Status selalu bisa dibaca di `docs/PROGRESS.md`. Keputusan di `docs/decisions/ADR-*.md`.
- Tidak ada merge ke `main` atau deploy prod tanpa gate lulus **dan** approve Fairuz.

## Langkah pertama setelah plan disetujui

1. Opus menulis `docs/phases/P1.md` dan menyerahkan checklist Track USER P1.
2. Dispatch Sonnet A (branch `p1/pipeline`): task P1.1–P1.8. Setelah tileset sample 1 tile jadi, dispatch paralel Sonnet B (`p1/web`, P1.10 `/explore`) dan Sonnet C (`p1/immersive`, P1.11), keduanya memakai tileset sample + `web/lib/` bersama.
3. P1.9, 1.12, 1.13 menunggu kredensial R2/Vercel/GitHub dari Fairuz.
4. Gate P1 → approve → prod + blog #1.
