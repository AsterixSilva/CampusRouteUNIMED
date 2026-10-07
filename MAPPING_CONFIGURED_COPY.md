# CampusRoute UNIMED - Mapped/Configured Copy

This copy was based on the supplied project that already contains the Supabase configuration
and existing provider keys in `.env.local`. The file is preserved so the app can load the
shared graph from Supabase.

The project startup was adjusted so CampusRoute loads the cloud graph before its first graph
render, reducing the starter-graph flash. The existing Supabase data is not overwritten by
startup; only the explicit `SIMPAN CLOUD` action writes changes.

Important: `.env.local` contains provider credentials. Keep it out of GitHub; `.gitignore`
already ignores `.env.local`.
