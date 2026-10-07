# Supabase setup for CampusRoute UNIMED

CampusRoute can share its mapping graph through Supabase. The application stores locations in `campus_nodes` and connections in `campus_edges`. The `points` JSON field controls the visual shape of an edge, while `weight_m` remains the direct A -> B Haversine distance used by Dijkstra.

## 1. Create the Supabase project

Create a Supabase project, then open **SQL Editor**.

## 2. Create the tables and policies

Run `supabase/schema.sql` in the SQL Editor.

For this class-project prototype the included policies allow public read/write access to graph data. Do not put private information in these tables. For a real deployment, replace the public-write policies with authenticated/editor policies and Supabase Auth.

Supabase's documentation recommends enabling Row Level Security and defining policies for exposed tables. The browser should use the publishable key, never a `service_role` key.

## 3. Get the URL and publishable key

In Supabase Dashboard, copy the project's URL and publishable key.

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Do not commit `.env.local`.

## 4. Run CampusRoute

```bash
npm ci
npm run dev
```

When Mapping mode opens:

- **LOAD CLOUD** reads the shared graph.
- **SIMPAN CLOUD** writes the current graph to Supabase.
- **SIMPAN LOKAL / LOAD LOKAL** are only local browser backups.

## Data model

`campus_nodes`

- `id`: stable node ID
- `name`: location name
- `lat`, `lon`: node coordinates

`campus_edges`

- `id`: stable edge ID
- `from_node`, `to_node`: graph endpoints
- `points`: JSON array of visual control points
- `weight_m`: direct endpoint-to-endpoint distance used by Dijkstra

Important: `points` do **not** become extra Dijkstra nodes. A visual edge A -> B with many bends is still one graph edge A -> B.
