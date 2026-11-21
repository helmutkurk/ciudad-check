# App glossary

Domain terms used in the app code. UI words are Spanish; code names are English.

## Explorar

**Explorar** - The full-screen map of nearby reports, opened from Inicio with "Explorar mi ciudad". It has two modes,
**Mapa** and **Lista**, under the same floating controls.

**Explorar query** (`ExploreQuery`) - The filters, the visible map area and the Mapa/Lista mode that together decide
which reports Explorar shows. Mapa and Lista always show the same result set.

**Filters** - State group, category and search text, chosen in the filter sheet. Search is matched in the app (category
label, state label, note) because the API has no text search.

**Clusters** - Grouped pins from `GET /api/reports/clusters`, shown only when no filter is active (the endpoint has no
filters). The app asks for them 3 zoom levels out, so each grid cell is about 128 px on screen. Tapping a cluster opens
a list of every report in its **grid cell** (360 / 2^(zoom+4) degrees, anchored at -180/-90). A one-report cluster
whose report is among the newest 100 of the area is drawn as that report's state pin. When the endpoint fails, the
map falls back to plain pins.

**Pins** - Single reports from `GET /api/reports` for the visible area, shown when a filter is active or clusters are
not available. Loaded 100 at a time; "Ver más" loads the next page.

**State group** - The public lifecycle group of a report (contract `state_group`): open, in work, resolved, closed.
