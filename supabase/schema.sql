-- CampusRoute UNIMED: shared graph database
-- Run this file in Supabase Dashboard -> SQL Editor.

create table if not exists public.campus_nodes (
  id text primary key,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campus_edges (
  id text primary key,
  from_node text not null references public.campus_nodes(id) on delete cascade,
  to_node text not null references public.campus_nodes(id) on delete cascade,
  points jsonb not null default '[]'::jsonb,
  weight_m double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_edges_nodes_different check (from_node <> to_node)
);

create unique index if not exists campus_edges_undirected_unique
on public.campus_edges (
  least(from_node, to_node),
  greatest(from_node, to_node)
);

create index if not exists campus_edges_from_idx on public.campus_edges(from_node);
create index if not exists campus_edges_to_idx on public.campus_edges(to_node);

alter table public.campus_nodes enable row level security;
alter table public.campus_edges enable row level security;

-- Required table privileges for the Supabase Data API. RLS policies below
-- further restrict which rows each role may access.
grant select, insert, update, delete on public.campus_nodes to anon, authenticated;
grant select, insert, update, delete on public.campus_edges to anon, authenticated;

-- Class-project prototype policies:
-- public graph data can be read and edited by the app's publishable key.
-- Do NOT store secrets in these tables.
drop policy if exists "campus nodes public read" on public.campus_nodes;
drop policy if exists "campus nodes public insert" on public.campus_nodes;
drop policy if exists "campus nodes public update" on public.campus_nodes;
drop policy if exists "campus nodes public delete" on public.campus_nodes;

drop policy if exists "campus edges public read" on public.campus_edges;
drop policy if exists "campus edges public insert" on public.campus_edges;
drop policy if exists "campus edges public update" on public.campus_edges;
drop policy if exists "campus edges public delete" on public.campus_edges;

create policy "campus nodes public read"
on public.campus_nodes for select
to anon, authenticated
using (true);

create policy "campus nodes public insert"
on public.campus_nodes for insert
to anon, authenticated
with check (true);

create policy "campus nodes public update"
on public.campus_nodes for update
to anon, authenticated
using (true)
with check (true);

create policy "campus nodes public delete"
on public.campus_nodes for delete
to anon, authenticated
using (true);

create policy "campus edges public read"
on public.campus_edges for select
to anon, authenticated
using (true);

create policy "campus edges public insert"
on public.campus_edges for insert
to anon, authenticated
with check (true);

create policy "campus edges public update"
on public.campus_edges for update
to anon, authenticated
using (true)
with check (true);

create policy "campus edges public delete"
on public.campus_edges for delete
to anon, authenticated
using (true);
