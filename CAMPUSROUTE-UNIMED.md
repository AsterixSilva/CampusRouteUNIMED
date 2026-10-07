# CampusRoute UNIMED

CampusRoute UNIMED adalah aplikasi navigasi kampus berbasis teori graf untuk proyek Matematika Diskrit. Lokasi kampus direpresentasikan sebagai node, koneksi sebagai edge, dan jarak sebagai bobot.

## Komponen utama

- `src/campusroute/data.js`: dataset node dan edge.
- `src/campusroute/dijkstra.js`: implementasi pencarian shortest path.
- `src/campusroute/index.js`: antarmuka navigasi, Mapping Mode, visualisasi node/edge/rute, serta penyimpanan graph.
- `src/campusroute/style.css`: gaya antarmuka CampusRoute.
- `src/campusroute/clean.css`: tampilan full-screen map dan penyembunyian komponen yang tidak diperlukan.
- `src/main.js`: bootstrap renderer 3D dan CampusRoute.

## Alur algoritma

1. Pengguna memilih node awal dan tujuan.
2. Sistem mengambil graph `G = (V, E)`.
3. Bobot edge dihitung berdasarkan jarak antar koordinat menggunakan Haversine.
4. Dijkstra menghitung jarak minimum dan menyimpan `previous[]`.
5. Path direkonstruksi dari tujuan ke awal menggunakan `previous[]`.
6. Jalur, jarak total, dan estimasi waktu ditampilkan pada peta 3D.

## Mapping Mode

Mapping Mode memungkinkan pengguna menambahkan node dan membentuk edge melalui beberapa titik kontrol. Bobot edge mengikuti total panjang segmen yang membentuk jalur tersebut, sehingga model dapat mengikuti bentuk jalan secara lebih fleksibel daripada garis lurus tunggal.

## Menjalankan

```bash
npm ci
npm run dev
```

## Catatan data

Dataset bawaan adalah data prototipe dan perlu diverifikasi terhadap kondisi kampus saat digunakan untuk pengukuran resmi.
