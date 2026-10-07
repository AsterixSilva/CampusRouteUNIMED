// CampusRoute starter dataset for Universitas Negeri Medan (UNIMED).
// Coordinates are approximate anchor points for the MVP and should be verified
// against the current campus map before presenting measured distances as final.
export const UNIMED_CENTER = { lat: 3.60822, lon: 98.71722 };

export const CAMPUS_NODES = [
  { id: 'gerbang', name: 'Gerbang Utama UNIMED', lat: 3.60690, lon: 98.71595 },
  { id: 'biro', name: 'Biro Rektor', lat: 3.60770, lon: 98.71745 },
  { id: 'fmipa', name: 'FMIPA', lat: 3.60775, lon: 98.71625 },
  { id: 'ft', name: 'Fakultas Teknik', lat: 3.60815, lon: 98.71485 },
  { id: 'fbs', name: 'Fakultas Bahasa dan Seni', lat: 3.60935, lon: 98.71490 },
  { id: 'fis', name: 'Fakultas Ilmu Sosial', lat: 3.60905, lon: 98.71455 },
  { id: 'puskom', name: 'PUSKOM UNIMED', lat: 3.60855, lon: 98.71565 },
  { id: 'auditorium', name: 'Auditorium UNIMED', lat: 3.60835, lon: 98.71670 },
  { id: 'perpustakaan', name: 'Digital Library', lat: 3.60900, lon: 98.71655 },
  { id: 'stadion', name: 'Stadion UNIMED', lat: 3.60905, lon: 98.71825 },
  { id: 'gelanggang', name: 'Gelanggang Mahasiswa H. Anif', lat: 3.60795, lon: 98.71825 },
  { id: 'masjid', name: 'Masjid Baiturrahman', lat: 3.60695, lon: 98.71755 },
];

// Edges represent walkable campus connections for the MVP.
// The Dijkstra weights are calculated from the node coordinates at runtime.
export const CAMPUS_EDGES = [
  ['gerbang', 'fmipa'],
  ['gerbang', 'ft'],
  ['gerbang', 'masjid'],
  ['fmipa', 'biro'],
  ['fmipa', 'puskom'],
  ['fmipa', 'auditorium'],
  ['ft', 'fbs'],
  ['ft', 'puskom'],
  ['fbs', 'fis'],
  ['fbs', 'perpustakaan'],
  ['fis', 'perpustakaan'],
  ['puskom', 'auditorium'],
  ['puskom', 'perpustakaan'],
  ['biro', 'auditorium'],
  ['biro', 'gelanggang'],
  ['biro', 'masjid'],
  ['auditorium', 'perpustakaan'],
  ['auditorium', 'gelanggang'],
  ['perpustakaan', 'stadion'],
  ['gelanggang', 'stadion'],
];
