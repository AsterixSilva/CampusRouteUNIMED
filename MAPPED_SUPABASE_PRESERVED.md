# CampusRoute UNIMED - Existing Mapping Preserved

This package is based directly on the CampusRoute UNIMED project you supplied, including
its `.env.local` Supabase configuration and existing provider keys.

The application still loads the shared graph from the Supabase project referenced by
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. The existing remote mapping is not
replaced or reset by startup.

Changes in this copy:
- CampusRoute logo applied to startup, browser favicon and visible CampusRoute brand.
- Legacy Austin/shared-view startup camera and message removed.
- Legacy first-run/cockpit UI is suppressed early to avoid the old interface flashing.
- Cloud graph is loaded before the first CampusRoute graph render when Supabase is configured.
- "PUSATKAN UNIMED" uses the center of the currently loaded graph.
- Existing flexible edge geometry (control points) remains visual-only for Dijkstra weights.

Security:
- `.env.local` is intentionally preserved in this personal working copy because the supplied
  project already contains your configuration. Keep `.env.local` out of GitHub; `.gitignore`
  already excludes `.env.local`.
