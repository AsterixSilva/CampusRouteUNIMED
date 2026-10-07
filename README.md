# CampusRoute UNIMED 3D

CampusRoute UNIMED 3D is a campus navigation prototype for Universitas Negeri Medan (UNIMED). It combines a full-screen 3D map with a weighted graph model and Dijkstra shortest-path search.

## Fitur utama

- Navigasi dari lokasi awal ke tujuan.
- Weighted graph: node = lokasi, edge = koneksi, weight = jarak.
- Perhitungan jarak berbasis koordinat menggunakan Haversine.
- Pencarian shortest path menggunakan Dijkstra.
- Visualisasi rute pada peta 3D.
- Mapping Mode untuk menambah, mengubah, menghubungkan, dan menghapus node serta membentuk jalur dengan beberapa titik kontrol.
- Simpan, muat, dan ekspor graph sebagai JSON.
- Panel navigasi dapat disembunyikan dan dibuka kembali dari quick bar.

## Menjalankan project

```bash
npm ci
npm run dev
```

Kemudian buka URL lokal yang diberikan Vite.

## Teknologi

- HTML5
- CSS3
- Vanilla JavaScript
- CesiumJS
- Google Photorealistic 3D Tiles (opsional, bergantung konfigurasi provider)

## Catatan data

Koordinat node dan koneksi CampusRoute merupakan dataset prototipe. Verifikasi posisi lokasi dan jaringan jalan kampus sebelum menyebut jarak hasil aplikasi sebagai pengukuran resmi.

## CampusRoute shared mapping database

CampusRoute supports shared mapping through Supabase. See `SUPABASE_SETUP.md` and run `supabase/schema.sql` in your Supabase project before using **LOAD CLOUD** or **SIMPAN CLOUD**.
