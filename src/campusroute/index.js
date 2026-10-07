import * as Cesium from 'cesium';
import { CAMPUS_EDGES, CAMPUS_NODES, UNIMED_CENTER } from './data.js';
import { buildGraph, dijkstra, distanceMeters, edgeDistanceMeters } from './dijkstra.js';
import { fetchCampusGraph, isSupabaseConfigured, saveCampusGraph, supabaseConfigHint } from './supabase.js';
import './style.css';

const APP_ID = 'campusroute-panel';
const QUICK_ID = 'campusroute-quickbar';
const STORAGE_KEY = 'campusroute-unimed-graph-v2';

function formatMeters(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function walkingMinutes(meters) {
  return Math.max(1, Math.round(meters / 83.3));
}

function normalizeEdge(raw) {
  if (Array.isArray(raw)) {
    return {
      id: raw[3] || `edge-${[raw[0], raw[1]].sort().join('-')}`,
      from: raw[0],
      to: raw[1],
      points: Array.isArray(raw[2]) ? raw[2].map((point) => ({ lat: Number(point.lat), lon: Number(point.lon) })) : [],
    };
  }
  return {
    id: raw?.id || `edge-${[raw?.from, raw?.to].sort().join('-')}`,
    from: raw?.from,
    to: raw?.to,
    points: Array.isArray(raw?.points) ? raw.points.map((point) => ({ lat: Number(point.lat), lon: Number(point.lon) })) : [],
    weight: Number.isFinite(Number(raw?.weight)) ? Number(raw.weight) : undefined,
  };
}

function cloneGraphData(nodes, edges) {
  return {
    nodes: nodes.map((node) => ({ ...node })),
    edges: edges.map((edge) => {
      const normalized = normalizeEdge(edge);
      return {
        id: normalized.id,
        from: normalized.from,
        to: normalized.to,
        points: normalized.points.map((point) => ({ ...point })),
        ...(Number.isFinite(normalized.weight) ? { weight: normalized.weight } : {}),
      };
    }),
  };
}

function makeNodeId(nodes) {
  let index = nodes.length + 1;
  let id = `node-${index}`;
  const used = new Set(nodes.map((node) => node.id));
  while (used.has(id)) id = `node-${++index}`;
  return id;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sameUndirectedEdge(a, b, edge) {
  return (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a);
}

function edgeKey(edge) {
  return `${edge.from}::${edge.to}`;
}

export async function createCampusRoute({ viewer }) {
  if (!viewer) throw new Error('CampusRoute requires a Cesium viewer');

  const initial = cloneGraphData(CAMPUS_NODES, CAMPUS_EDGES);
  let nodes = initial.nodes;
  let edges = initial.edges;
  let graph = buildGraph(nodes, edges);
  let routeEntities = [];
  let graphEntities = [];
  let handleEntities = [];
  let mappingMode = false;
  let activeTool = null;
  let connectStart = null;
  let connectWaypoints = [];
  let dragNodeId = null;
  let dragEdgeHandle = null;
  let selectedEdgeKey = null;
  let cameraRotateBeforeDrag = true;
  let routePath = null;

  const removeEntities = (entities) => {
    for (const entity of entities) viewer.entities.remove(entity);
    entities.length = 0;
  };

  const rebuildGraph = () => {
    graph = buildGraph(nodes, edges);
  };
  const getGraphCenter = () => {
    if (!nodes.length) return UNIMED_CENTER;
    const valid = nodes.filter((node) => Number.isFinite(Number(node.lat)) && Number.isFinite(Number(node.lon)));
    if (!valid.length) return UNIMED_CENTER;
    return {
      lat: valid.reduce((sum, node) => sum + Number(node.lat), 0) / valid.length,
      lon: valid.reduce((sum, node) => sum + Number(node.lon), 0) / valid.length,
    };
  };

  const flyToCampusCenter = (duration = 1.2, height = 1500) => {
    const center = getGraphCenter();
    return viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, height),
      orientation: {
        heading: Cesium.Math.toRadians(4),
        pitch: Cesium.Math.toRadians(-48),
        roll: 0,
      },
      duration,
    });
  };

  const findNode = (id) => nodes.find((node) => node.id === id);
  const findEdge = (aId, bId) => edges.find((edge) => sameUndirectedEdge(aId, bId, normalizeEdge(edge)));
  const nodeEntityId = (id) => `campusroute-node-${id}`;

  const positionsForEdge = (edge) => {
    const normalized = normalizeEdge(edge);
    const a = findNode(normalized.from);
    const b = findNode(normalized.to);
    if (!a || !b) return [];
    const positions = [a.lon, a.lat];
    for (const point of normalized.points) positions.push(point.lon, point.lat);
    positions.push(b.lon, b.lat);
    return positions;
  };

  const renderHandles = () => {
    removeEntities(handleEntities);
    if (!mappingMode || activeTool !== 'shape' || !selectedEdgeKey) return;
    const edge = edges.find((item) => edgeKey(normalizeEdge(item)) === selectedEdgeKey);
    if (!edge) return;
    const normalized = normalizeEdge(edge);
    normalized.points.forEach((point, index) => {
      const handle = viewer.entities.add({
        id: `campusroute-handle-${selectedEdgeKey}-${index}`,
        position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 7),
        point: {
          pixelSize: 11,
          color: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        properties: {
          campusRouteEdgeHandle: JSON.stringify({ key: selectedEdgeKey, index }),
        },
      });
      handleEntities.push(handle);
    });
  };

  const renderGraph = () => {
    removeEntities(graphEntities);

    for (const rawEdge of edges) {
      const normalized = normalizeEdge(rawEdge);
      const positions = positionsForEdge(rawEdge);
      if (positions.length < 4) continue;
      const isSelected = edgeKey(normalized) === selectedEdgeKey;
      const entity = viewer.entities.add({
        id: `campusroute-edge-${normalized.from}-${normalized.to}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(positions),
          width: isSelected ? 7 : mappingMode ? 4 : 2,
          material: isSelected
            ? Cesium.Color.YELLOW
            : Cesium.Color.CYAN.withAlpha(mappingMode ? 0.58 : 0.32),
          clampToGround: true,
        },
        properties: {
          campusRouteEdge: true,
          campusRouteEdgeKey: edgeKey(normalized),
          from: normalized.from,
          to: normalized.to,
        },
      });
      graphEntities.push(entity);
    }

    for (const node of nodes) {
      const selected = node.id === connectStart;
      const entity = viewer.entities.add({
        id: nodeEntityId(node.id),
        position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, 4),
        point: {
          pixelSize: selected ? 13 : mappingMode ? 10 : 8,
          color: selected ? Cesium.Color.LIME : Cesium.Color.WHITE,
          outlineColor: Cesium.Color.CYAN,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: node.name,
          font: '12px Inter, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.62),
          backgroundPadding: new Cesium.Cartesian2(5, 3),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4200),
        },
        properties: { campusRouteNode: node.id },
      });
      graphEntities.push(entity);
    }

    renderHandles();
  };

  const panel = document.createElement('aside');
  panel.id = APP_ID;
  panel.innerHTML = `
    <div class="cr-header">
      <div>
        <div class="cr-kicker">MATEMATIKA DISKRIT</div>
        <h2>CampusRoute <span>UNIMED</span></h2>
      </div>
      <button class="cr-close" title="Sembunyikan panel" aria-label="Sembunyikan panel">×</button>
    </div>

    <div class="cr-tabs" role="tablist">
      <button class="cr-tab cr-tab-active" data-mode="nav">🧭 NAVIGASI</button>
      <button class="cr-tab" data-mode="mapping">🗺 MAPPING</button>
    </div>

    <section class="cr-section" data-section="nav">
      <p class="cr-desc">Cari rute terpendek berdasarkan weighted graph kampus menggunakan algoritma Dijkstra.</p>
      <label>DARI</label>
      <select id="cr-start"></select>
      <label>TUJUAN</label>
      <select id="cr-goal"></select>
      <button id="cr-find" class="cr-find">CARI RUTE</button>
      <button id="cr-center" class="cr-secondary">PUSATKAN UNIMED</button>
      <div id="cr-result" class="cr-result">Pilih lokasi lalu tekan <b>CARI RUTE</b>.</div>
    </section>

    <section class="cr-section cr-hidden-section" data-section="mapping">
      <p class="cr-desc">Bangun graph kampus langsung di atas peta. Gunakan waypoint untuk membentuk jalur mengikuti jalan.</p>
      <div class="cr-tools">
        <button data-tool="add" class="cr-tool">＋ TAMBAH NODE</button>
        <button data-tool="draw" class="cr-tool">╱ BUAT JALUR</button>
        <button data-tool="edit" class="cr-tool">✏ NAMA NODE</button>
        <button data-tool="shape" class="cr-tool">⌁ BENTUK JALUR</button>
        <button data-tool="delete" class="cr-tool cr-danger">🗑 HAPUS</button>
      </div>
      <div class="cr-save-row cr-save-row-wide">
        <button id="cr-save" class="cr-secondary">☁ SIMPAN CLOUD</button>
        <button id="cr-load" class="cr-secondary">↻ LOAD CLOUD</button>
      </div>
      <div class="cr-save-row">
        <button id="cr-local-save" class="cr-secondary">💾 SIMPAN LOKAL</button>
        <button id="cr-local-load" class="cr-secondary">📂 LOAD LOKAL</button>
        <button id="cr-reset" class="cr-secondary">↺ RESET</button>
      </div>
      <div id="cr-map-status" class="cr-result cr-map-status">Pilih alat lalu klik peta.</div>
      <div id="cr-cloud-status" class="cr-cloud-status">${isSupabaseConfigured() ? '☁ Supabase terhubung' : '○ Supabase belum dikonfigurasi'}</div>
      <div class="cr-stats">
        <span><b id="cr-node-count">0</b> NODE</span>
        <span><b id="cr-edge-count">0</b> EDGE</span>
      </div>
      <div class="cr-note">BUAT JALUR: klik node awal, klik beberapa titik tikungan di jalan, lalu klik node tujuan.</div>
      <div class="cr-note">BENTUK JALUR: klik garis kuning lalu tarik titik kontrol. Klik dua kali dekat garis untuk menambah titik kontrol.</div>
    </section>

    <div class="cr-note cr-global-note">Dataset awal adalah prototipe. Verifikasi posisi node dan jalur kampus sebelum menjadikan jarak sebagai pengukuran resmi.</div>
  `;
  document.body.appendChild(panel);

  const quickbar = document.createElement('nav');
  quickbar.id = QUICK_ID;
  quickbar.innerHTML = `
    <button class="cr-brand" data-open-mode="nav" aria-label="Buka CampusRoute">
      <img class="cr-brand-mark" src="/campusroute-mark.webp?v=3" alt="CampusRoute UNIMED" />
      <span><strong>CampusRoute <b>UNIMED</b></strong><small>Navigasi kampus</small></span>
    </button>
    <div class="cr-quick-actions">
      <button class="cr-quick cr-quick-active" data-open-mode="nav">🧭 Cari Rute</button>
      <button class="cr-quick" data-open-mode="mapping">🗺 Mapping</button>
    </div>
    <button class="cr-search-pill" data-open-mode="nav">⌕ <span>Cari rute atau lokasi…</span></button>
  `;
  document.body.appendChild(quickbar);

  const startSelect = panel.querySelector('#cr-start');
  const goalSelect = panel.querySelector('#cr-goal');
  const result = panel.querySelector('#cr-result');
  const mapStatus = panel.querySelector('#cr-map-status');

  const updateSelectors = () => {
    const oldStart = startSelect.value;
    const oldGoal = goalSelect.value;
    startSelect.replaceChildren();
    goalSelect.replaceChildren();
    for (const node of nodes) {
      startSelect.add(new Option(node.name, node.id));
      goalSelect.add(new Option(node.name, node.id));
    }
    startSelect.value = findNode(oldStart) ? oldStart : nodes[0]?.id ?? '';
    goalSelect.value = findNode(oldGoal) ? oldGoal : nodes[1]?.id ?? nodes[0]?.id ?? '';
  };

  const updateMappingStats = () => {
    panel.querySelector('#cr-node-count').textContent = nodes.length;
    panel.querySelector('#cr-edge-count').textContent = edges.length;
  };

  const setMapStatus = (message) => {
    mapStatus.textContent = message;
  };

  const setTool = (tool) => {
    activeTool = activeTool === tool ? null : tool;
    connectStart = null;
    connectWaypoints = [];
    selectedEdgeKey = activeTool === 'shape' ? selectedEdgeKey : null;
    panel.querySelectorAll('.cr-tool').forEach((button) => {
      button.classList.toggle('cr-tool-active', button.dataset.tool === activeTool);
    });
    renderGraph();

    const messages = {
      add: 'Mode tambah: klik lokasi di peta untuk membuat node baru.',
      draw: 'Mode buat jalur: klik node awal, klik titik tikungan di jalan, lalu klik node tujuan.',
      edit: 'Mode nama: klik node untuk mengganti namanya. Node tetap bisa digeser dengan drag.',
      shape: 'Mode bentuk jalur: klik garis untuk memilihnya. Tarik titik kontrol kuning untuk membentuk jalan.',
      delete: 'Mode hapus: klik node yang ingin dihapus.',
    };
    setMapStatus(activeTool ? messages[activeTool] : 'Pilih alat lalu klik peta.');
  };

  const setMode = (mode) => {
    mappingMode = mode === 'mapping';
    quickbar.querySelectorAll('.cr-quick').forEach((button) => {
      button.classList.toggle('cr-quick-active', button.dataset.openMode === mode);
    });
    panel.querySelectorAll('.cr-tab').forEach((button) => {
      button.classList.toggle('cr-tab-active', button.dataset.mode === mode);
    });
    panel.querySelectorAll('[data-section]').forEach((section) => {
      section.classList.toggle('cr-hidden-section', section.dataset.section !== mode);
    });
    panel.classList.remove('cr-hidden');
    if (!mappingMode) {
      activeTool = null;
      connectStart = null;
      connectWaypoints = [];
      selectedEdgeKey = null;
      panel.querySelectorAll('.cr-tool').forEach((button) => button.classList.remove('cr-tool-active'));
    }
    renderGraph();
  };

  const showRoute = () => {
    removeEntities(routeEntities);
    routePath = null;
    const start = startSelect.value;
    const goal = goalSelect.value;
    if (!start || !goal || start === goal) {
      result.innerHTML = 'Lokasi awal dan tujuan harus berbeda.';
      return;
    }

    rebuildGraph();
    const solved = dijkstra(graph.graph, start, goal);
    if (!solved) {
      result.innerHTML = 'Tidak ditemukan rute pada graph saat ini.';
      return;
    }

    routePath = solved.path;
    const positions = [];
    for (let index = 0; index < solved.path.length; index += 1) {
      const id = solved.path[index];
      const node = findNode(id);
      if (!node) continue;
      if (index === 0) positions.push(node.lon, node.lat);
      const next = solved.path[index + 1];
      if (!next) continue;
      const edge = findEdge(id, next);
      const normalized = edge ? normalizeEdge(edge) : null;
      for (const point of normalized?.points ?? []) positions.push(point.lon, point.lat);
      const nextNode = findNode(next);
      if (nextNode) positions.push(nextNode.lon, nextNode.lat);
    }

    const route = viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(positions),
        width: 10,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: Cesium.Color.LIME,
        }),
        clampToGround: true,
      },
      properties: { campusRouteResult: true },
    });
    routeEntities.push(route);

    const steps = solved.path.map((id) => `<li>${escapeHtml(graph.byId.get(id)?.name ?? id)}</li>`).join('');
    result.innerHTML = `
      <div class="cr-success">RUTE DITEMUKAN</div>
      <div class="cr-stat"><strong>${formatMeters(solved.distance)}</strong><span>jarak graf</span></div>
      <div class="cr-stat"><strong>±${walkingMinutes(solved.distance)} menit</strong><span>estimasi berjalan</span></div>
      <ol>${steps}</ol>
      <div class="cr-algo">ALGORITMA: DIJKSTRA · BOBOT: Haversine</div>
    `;

    viewer.flyTo(route, {
      duration: 1.4,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-48), Math.max(450, solved.distance * 1.5)),
    });
  };

  const addNodeAt = (cartesian) => {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const name = window.prompt('Nama lokasi/node:', `Lokasi ${nodes.length + 1}`);
    if (!name?.trim()) return;

    const node = {
      id: makeNodeId(nodes),
      name: name.trim(),
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
    };
    nodes.push(node);
    rebuildGraph();
    updateSelectors();
    updateMappingStats();
    renderGraph();
    setMapStatus(`Node "${node.name}" ditambahkan pada ${node.lat}, ${node.lon}.`);
  };

  const commitEdge = (aId, bId, points = []) => {
    if (!aId || !bId || aId === bId) return;
    const exists = edges.some((edge) => sameUndirectedEdge(aId, bId, normalizeEdge(edge)));
    if (exists) {
      setMapStatus('Edge antara kedua node sudah ada. Gunakan BENTUK JALUR untuk mengeditnya.');
      return;
    }
    const a = findNode(aId);
    const b = findNode(bId);
    if (!a || !b) return;
    const normalizedPoints = points.map((point) => ({ lat: Number(point.lat.toFixed(6)), lon: Number(point.lon.toFixed(6)) }));
    edges.push({ id: `edge-${[aId, bId].sort().join('-')}`, from: aId, to: bId, points: normalizedPoints, weight: distanceMeters(a, b) });
    rebuildGraph();
    updateMappingStats();
    renderGraph();
    setMapStatus(`Jalur dibuat: ${a.name} ↔ ${b.name} (${formatMeters(edgeDistanceMeters(a, b, normalizedPoints))}). ${normalizedPoints.length} titik tikungan.`);
  };

  const editNode = (nodeId) => {
    const node = findNode(nodeId);
    if (!node) return;
    const nextName = window.prompt('Nama node:', node.name);
    if (!nextName?.trim()) return;
    node.name = nextName.trim();
    updateSelectors();
    renderGraph();
    setMapStatus(`Nama node diperbarui menjadi "${node.name}".`);
  };

  const deleteNode = (nodeId) => {
    const node = findNode(nodeId);
    if (!node) return;
    if (!window.confirm(`Hapus node "${node.name}" beserta edge yang terhubung?`)) return;
    nodes = nodes.filter((item) => item.id !== nodeId);
    edges = edges.map((edge) => normalizeEdge(edge)).filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
    connectStart = null;
    connectWaypoints = [];
    selectedEdgeKey = null;
    rebuildGraph();
    updateSelectors();
    updateMappingStats();
    removeEntities(routeEntities);
    renderGraph();
    setMapStatus(`Node "${node.name}" dihapus.`);
  };

  const setCloudStatus = (message, ok = true) => {
    const cloudStatus = panel.querySelector('#cr-cloud-status');
    cloudStatus.textContent = message;
    cloudStatus.classList.toggle('cr-cloud-error', !ok);
  };

  const saveLocalGraph = () => {
    const payload = { version: 3, savedAt: new Date().toISOString(), nodes, edges: edges.map((edge) => normalizeEdge(edge)) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setMapStatus(`Graph lokal tersimpan. ${nodes.length} node, ${edges.length} edge.`);
  };

  const loadLocalGraph = () => {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('campusroute-unimed-graph-v1');
    if (!raw) {
      setMapStatus('Belum ada graph lokal tersimpan di browser ini.');
      return;
    }
    try {
      const payload = JSON.parse(raw);
      if (!Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) throw new Error('Format graph tidak valid');
      nodes = payload.nodes.map((node) => ({ ...node }));
      edges = payload.edges.map((edge) => normalizeEdge(edge));
      rebuildGraph();
      updateSelectors();
      updateMappingStats();
      removeEntities(routeEntities);
      selectedEdgeKey = null;
      renderGraph();
      setMapStatus(`Graph lokal berhasil di-load. ${nodes.length} node, ${edges.length} edge.`);
    } catch (error) {
      console.error('CampusRoute local load failed:', error);
      setMapStatus('Graph lokal tidak dapat dibaca.');
    }
  };

  const loadCloudGraph = async () => {
    if (!isSupabaseConfigured()) {
      setCloudStatus(`○ ${supabaseConfigHint()}`, false);
      setMapStatus('Supabase belum dikonfigurasi. Isi .env.local lalu restart Vite.');
      return false;
    }
    try {
      setCloudStatus('◌ Mengambil graph dari Supabase...');
      const remote = await fetchCampusGraph();
      if (!remote || remote.nodes.length === 0) {
        setCloudStatus('☁ Supabase kosong, menggunakan dataset awal.');
        setMapStatus('Belum ada data graph di Supabase. Simpan Cloud untuk mengunggah dataset ini.');
        return false;
      }
      nodes = remote.nodes;
      edges = remote.edges;
      rebuildGraph();
      updateSelectors();
      updateMappingStats();
      removeEntities(routeEntities);
      selectedEdgeKey = null;
      renderGraph();
      setCloudStatus(`☁ Cloud aktif · ${nodes.length} node · ${edges.length} edge`);
      setMapStatus(`Graph dari Supabase berhasil dimuat. ${nodes.length} node, ${edges.length} edge.`);
      return true;
    } catch (error) {
      console.error('CampusRoute Supabase load failed:', error);
      setCloudStatus('⚠ Supabase gagal diakses', false);
      setMapStatus(`Gagal memuat Supabase: ${error.message}`);
      return false;
    }
  };

  const saveCloudGraph = async () => {
    if (!isSupabaseConfigured()) {
      setCloudStatus(`○ ${supabaseConfigHint()}`, false);
      setMapStatus('Supabase belum dikonfigurasi. Isi .env.local lalu restart Vite.');
      return;
    }
    try {
      setCloudStatus('◌ Menyimpan graph ke Supabase...');
      const saved = await saveCampusGraph(nodes, edges, distanceMeters);
      nodes = saved.nodes;
      edges = saved.edges;
      rebuildGraph();
      updateSelectors();
      updateMappingStats();
      renderGraph();
      setCloudStatus(`☁ Tersimpan · ${nodes.length} node · ${edges.length} edge`);
      setMapStatus(`Graph tersimpan ke Supabase. Semua perangkat yang memakai project ini dapat memuat data terbaru.`);
    } catch (error) {
      console.error('CampusRoute Supabase save failed:', error);
      setCloudStatus('⚠ Gagal menyimpan ke Supabase', false);
      setMapStatus(`Gagal menyimpan Supabase: ${error.message}`);
    }
  };

  const resetGraph = () => {
    if (!window.confirm('Kembalikan graph ke dataset awal UNIMED?')) return;
    const reset = cloneGraphData(CAMPUS_NODES, CAMPUS_EDGES);
    nodes = reset.nodes;
    edges = reset.edges;
    rebuildGraph();
    updateSelectors();
    updateMappingStats();
    removeEntities(routeEntities);
    selectedEdgeKey = null;
    renderGraph();
    setMapStatus('Graph dikembalikan ke dataset awal.');
  };

  const pickEntity = (position) => {
    const picked = viewer.scene.pick(position);
    if (!Cesium.defined(picked) || !picked.id) return null;
    return picked.id;
  };

  const pickNodeId = (position) => {
    const entity = pickEntity(position);
    const property = entity?.properties?.campusRouteNode;
    return property?.getValue?.(viewer.clock.currentTime) ?? property ?? null;
  };

  const pickEdgeKey = (position) => {
    const entity = pickEntity(position);
    const property = entity?.properties?.campusRouteEdgeKey;
    return property?.getValue?.(viewer.clock.currentTime) ?? property ?? null;
  };

  const pickHandle = (position) => {
    const entity = pickEntity(position);
    const raw = entity?.properties?.campusRouteEdgeHandle;
    const value = raw?.getValue?.(viewer.clock.currentTime) ?? raw;
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const pickMapPosition = (position) => {
    let cartesian = null;
    if (viewer.scene.pickPositionSupported) cartesian = viewer.scene.pickPosition(position);
    if (!Cesium.defined(cartesian)) cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
    return Cesium.defined(cartesian) ? cartesian : null;
  };

  const cartesianToPoint = (cartesian) => {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    return {
      lat: Number(Cesium.Math.toDegrees(cartographic.latitude).toFixed(6)),
      lon: Number(Cesium.Math.toDegrees(cartographic.longitude).toFixed(6)),
    };
  };

  const screenHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  screenHandler.setInputAction((movement) => {
    if (!mappingMode || !activeTool) return;
    const nodeId = pickNodeId(movement.position);

    if (activeTool === 'draw') {
      if (nodeId && !connectStart) {
        connectStart = nodeId;
        connectWaypoints = [];
        const node = findNode(nodeId);
        setMapStatus(`Node awal: ${node.name}. Klik titik tikungan mengikuti jalan, lalu klik node tujuan.`);
        renderGraph();
        return;
      }
      if (nodeId && connectStart && nodeId !== connectStart) {
        const first = connectStart;
        const points = [...connectWaypoints];
        connectStart = null;
        connectWaypoints = [];
        commitEdge(first, nodeId, points);
        setTool('draw');
        return;
      }
      if (!nodeId && connectStart) {
        const cartesian = pickMapPosition(movement.position);
        if (cartesian) {
          connectWaypoints.push(cartesianToPoint(cartesian));
          setMapStatus(`Titik tikungan ${connectWaypoints.length} ditambahkan. Lanjut klik mengikuti jalan, lalu klik node tujuan.`);
        }
      }
      return;
    }

    if (activeTool === 'shape') {
      const pickedEdge = pickEdgeKey(movement.position);
      if (pickedEdge) {
        selectedEdgeKey = pickedEdge;
        const edge = edges.find((item) => edgeKey(normalizeEdge(item)) === pickedEdge);
        if (edge) {
          const normalized = normalizeEdge(edge);
          if (!normalized.points.length) {
            const a = findNode(normalized.from);
            const b = findNode(normalized.to);
            normalized.points.push({ lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 });
            Object.assign(edge, normalized);
          }
          setMapStatus('Garis dipilih. Tarik titik kontrol kuning untuk mengikuti bentuk jalan.');
          renderGraph();
        }
        return;
      }
    }

    if (activeTool === 'edit' && nodeId) {
      editNode(nodeId);
      return;
    }

    if (activeTool === 'delete' && nodeId) {
      deleteNode(nodeId);
      return;
    }

    if (activeTool === 'add' && !nodeId) {
      const cartesian = pickMapPosition(movement.position);
      if (cartesian) addNodeAt(cartesian);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  screenHandler.setInputAction((movement) => {
    if (!mappingMode) return;

    const handle = pickHandle(movement.position);
    if (handle && activeTool === 'shape') {
      dragEdgeHandle = handle;
      cameraRotateBeforeDrag = viewer.scene.screenSpaceCameraController.enableRotate;
      viewer.scene.screenSpaceCameraController.enableRotate = false;
      return;
    }

    const nodeId = pickNodeId(movement.position);
    if (!nodeId) return;
    dragNodeId = nodeId;
    cameraRotateBeforeDrag = viewer.scene.screenSpaceCameraController.enableRotate;
    viewer.scene.screenSpaceCameraController.enableRotate = false;
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  screenHandler.setInputAction((movement) => {
    if (!mappingMode) return;

    if (dragEdgeHandle) {
      const cartesian = pickMapPosition(movement.endPosition);
      if (!cartesian) return;
      const point = cartesianToPoint(cartesian);
      const edge = edges.find((item) => edgeKey(normalizeEdge(item)) === dragEdgeHandle.key);
      if (!edge) return;
      const normalized = normalizeEdge(edge);
      if (!normalized.points[dragEdgeHandle.index]) return;
      normalized.points[dragEdgeHandle.index] = point;
      Object.assign(edge, normalized);
      rebuildGraph();
      removeEntities(routeEntities);
      renderGraph();
      setMapStatus(`Titik jalur digeser ke ${point.lat}, ${point.lon}.`);
      return;
    }

    if (!dragNodeId) return;
    const cartesian = pickMapPosition(movement.endPosition);
    if (!cartesian) return;
    const point = cartesianToPoint(cartesian);
    const node = findNode(dragNodeId);
    if (!node) return;
    node.lat = point.lat;
    node.lon = point.lon;
    rebuildGraph();
    removeEntities(routeEntities);
    renderGraph();
    updateMappingStats();
    setMapStatus(`Memindahkan "${node.name}" → ${node.lat}, ${node.lon}`);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  screenHandler.setInputAction(() => {
    if (!dragNodeId && !dragEdgeHandle) return;
    dragNodeId = null;
    dragEdgeHandle = null;
    viewer.scene.screenSpaceCameraController.enableRotate = cameraRotateBeforeDrag;
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  screenHandler.setInputAction((movement) => {
    if (!mappingMode || activeTool !== 'shape') return;
    const key = pickEdgeKey(movement.position);
    if (!key) return;
    const edge = edges.find((item) => edgeKey(normalizeEdge(item)) === key);
    const cartesian = pickMapPosition(movement.position);
    if (!edge || !cartesian) return;
    const normalized = normalizeEdge(edge);
    normalized.points.push(cartesianToPoint(cartesian));
    Object.assign(edge, normalized);
    selectedEdgeKey = key;
    rebuildGraph();
    renderGraph();
    setMapStatus(`Titik kontrol baru ditambahkan. Sekarang tarik titik kuning untuk merapikan jalur.`);
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  panel.querySelectorAll('.cr-tab').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  panel.querySelectorAll('.cr-tool').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
  panel.querySelector('#cr-find').addEventListener('click', showRoute);
  panel.querySelector('#cr-center').addEventListener('click', () => flyToCampusCenter());
  panel.querySelector('#cr-save').addEventListener('click', saveCloudGraph);
  panel.querySelector('#cr-load').addEventListener('click', loadCloudGraph);
  panel.querySelector('#cr-local-save').addEventListener('click', saveLocalGraph);
  panel.querySelector('#cr-local-load').addEventListener('click', loadLocalGraph);
  panel.querySelector('#cr-reset').addEventListener('click', resetGraph);
  panel.querySelector('.cr-close').addEventListener('click', () => panel.classList.add('cr-hidden'));

  quickbar.querySelectorAll('[data-open-mode]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.openMode));
  });

  updateSelectors();
  updateMappingStats();

  // Prefer the shared Supabase graph before the first CampusRoute render.
  // This prevents the local starter graph from flashing before the team's
  // mapped graph arrives from Supabase.
  await loadCloudGraph();
  updateSelectors();
  updateMappingStats();
  renderGraph();
  flyToCampusCenter(1.0, 1500);

  return {
    destroy() {
      screenHandler.destroy();
      removeEntities(graphEntities);
      removeEntities(handleEntities);
      removeEntities(routeEntities);
      panel.remove();
      quickbar.remove();
    },
    showRoute,
  };
}
