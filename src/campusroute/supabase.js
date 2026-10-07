const config = {
  url: String(import.meta.env.VITE_SUPABASE_URL || '').trim(),
  key: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim(),
};

let client = null;

function getClient() {
  if (client) return client;
  if (!config.url || !config.key) return null;
  const factory = globalThis.supabase?.createClient;
  if (typeof factory !== 'function') {
    throw new Error('Supabase library belum tersedia. Pastikan CDN Supabase termuat.');
  }
  client = factory(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function isSupabaseConfigured() {
  return Boolean(config.url && config.key && globalThis.supabase?.createClient);
}

export async function fetchCampusGraph() {
  const db = getClient();
  if (!db) return null;

  const [nodesResult, edgesResult] = await Promise.all([
    db.from('campus_nodes').select('id,name,lat,lon').order('name'),
    db.from('campus_edges').select('id,from_node,to_node,points,weight_m').order('id'),
  ]);

  if (nodesResult.error) throw nodesResult.error;
  if (edgesResult.error) throw edgesResult.error;

  return {
    nodes: nodesResult.data.map((node) => ({
      id: node.id,
      name: node.name,
      lat: Number(node.lat),
      lon: Number(node.lon),
    })),
    edges: edgesResult.data.map((edge) => ({
      id: edge.id,
      from: edge.from_node,
      to: edge.to_node,
      points: Array.isArray(edge.points) ? edge.points : [],
      weight: Number(edge.weight_m),
    })),
  };
}

export async function saveCampusGraph(nodes, edges, calculateWeight) {
  const db = getClient();
  if (!db) throw new Error('Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY.');

  const normalizedNodes = nodes.map((node) => ({
    id: String(node.id),
    name: String(node.name),
    lat: Number(node.lat),
    lon: Number(node.lon),
  }));

  const normalizedEdges = edges.map((edge) => {
    const from = String(edge.from);
    const to = String(edge.to);
    const nodeA = nodes.find((node) => node.id === from);
    const nodeB = nodes.find((node) => node.id === to);
    if (!nodeA || !nodeB) throw new Error(`Node edge ${from} ↔ ${to} tidak ditemukan.`);
    const points = Array.isArray(edge.points)
      ? edge.points.map((point) => ({ lat: Number(point.lat), lon: Number(point.lon) }))
      : [];
    return {
      id: edge.id || `edge-${[from, to].sort().join('-')}`,
      from_node: from,
      to_node: to,
      points,
      // IMPORTANT: weight is calculated only from endpoint A -> B.
      // Geometry/control points are visual only and do not affect Dijkstra weight.
      weight_m: Number(calculateWeight(nodeA, nodeB)),
    };
  });

  const { data: remoteEdges, error: remoteEdgesError } = await db
    .from('campus_edges')
    .select('id');
  if (remoteEdgesError) throw remoteEdgesError;

  const edgeIds = normalizedEdges.map((edge) => edge.id);
  const staleEdgeIds = remoteEdges.map((edge) => edge.id).filter((id) => !edgeIds.includes(id));
  if (staleEdgeIds.length) {
    const { error } = await db.from('campus_edges').delete().in('id', staleEdgeIds);
    if (error) throw error;
  }

  if (normalizedNodes.length) {
    const { error } = await db.from('campus_nodes').upsert(normalizedNodes, { onConflict: 'id' });
    if (error) throw error;
  }

  if (normalizedEdges.length) {
    const { error } = await db.from('campus_edges').upsert(normalizedEdges, { onConflict: 'id' });
    if (error) throw error;
  }

  const { data: remoteNodes, error: remoteNodesError } = await db
    .from('campus_nodes')
    .select('id');
  if (remoteNodesError) throw remoteNodesError;

  const nodeIds = normalizedNodes.map((node) => node.id);
  const staleNodeIds = remoteNodes.map((node) => node.id).filter((id) => !nodeIds.includes(id));
  if (staleNodeIds.length) {
    const { error } = await db.from('campus_nodes').delete().in('id', staleNodeIds);
    if (error) throw error;
  }

  return fetchCampusGraph();
}

export function supabaseConfigHint() {
  return config.url && config.key
    ? 'Supabase siap digunakan.'
    : 'Supabase belum dikonfigurasi. Isi file .env.local.';
}
