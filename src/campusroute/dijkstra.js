const EARTH_RADIUS_M = 6371008.8;

export function distanceMeters(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function normalizeEdge(edge) {
  if (Array.isArray(edge)) {
    return {
      from: edge[0],
      to: edge[1],
      points: Array.isArray(edge[2])
        ? edge[2].map((point) => ({ lat: Number(point.lat), lon: Number(point.lon) }))
        : [],
    };
  }
  return {
    from: edge?.from,
    to: edge?.to,
    points: Array.isArray(edge?.points)
      ? edge.points.map((point) => ({ lat: Number(point.lat), lon: Number(point.lon) }))
      : [],
  };
}

export function edgeDistanceMeters(a, b, _points = []) {
  // Control points only change the visual geometry of an edge.
  // Dijkstra's weight remains the direct endpoint-to-endpoint distance A -> B.
  return distanceMeters(a, b);
}

export function buildGraph(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const graph = new Map(nodes.map((node) => [node.id, []]));

  for (const rawEdge of edges) {
    const edge = normalizeEdge(rawEdge);
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;

    const weight = Number.isFinite(edge.weight) ? edge.weight : distanceMeters(a, b);
    graph.get(edge.from).push({ to: edge.to, weight });
    graph.get(edge.to).push({ to: edge.from, weight });
  }

  return { graph, byId };
}

export function dijkstra(graph, start, goal) {
  const distances = new Map([...graph.keys()].map((id) => [id, Infinity]));
  const previous = new Map();
  const unvisited = new Set(graph.keys());
  distances.set(start, 0);

  while (unvisited.size) {
    let current = null;
    let best = Infinity;
    for (const id of unvisited) {
      const d = distances.get(id);
      if (d < best) {
        best = d;
        current = id;
      }
    }

    if (current === null || best === Infinity) break;
    unvisited.delete(current);
    if (current === goal) break;

    for (const edge of graph.get(current) ?? []) {
      if (!unvisited.has(edge.to)) continue;
      const candidate = best + edge.weight;
      if (candidate < distances.get(edge.to)) {
        distances.set(edge.to, candidate);
        previous.set(edge.to, current);
      }
    }
  }

  if (!Number.isFinite(distances.get(goal))) return null;

  const path = [];
  let current = goal;
  while (current !== undefined) {
    path.unshift(current);
    if (current === start) break;
    current = previous.get(current);
  }

  return { path, distance: distances.get(goal) };
}
