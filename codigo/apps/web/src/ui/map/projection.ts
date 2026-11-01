// Web Mercator (EPSG:3857) tile math for the slippy map. Pure functions, no DOM, no network.
// The map shows OpenStreetMap raster tiles (256 px, XYZ scheme); contracts.md section 1.2.

export const TILE_SIZE = 256;
/** Manual zoom limits (buttons and keys). */
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 17;
/** Zoom range used when fitting markers. */
export const FIT_MIN_ZOOM = 11;
export const FIT_MAX_ZOOM = 16;
/** Zoom for a single point: street level, neighbourhood still visible. */
export const SINGLE_POINT_ZOOM = 15;
/** Web Mercator is undefined at the poles; this is the usual clamp. */
const MAX_LAT = 85.0511287798;

export interface LatLon {
  lat: number;
  lon: number;
}
export interface Size {
  width: number;
  height: number;
}
/** Centre of the view in world pixels at `zoom` (world width = 256 * 2^zoom). Zoom is an integer. */
export interface MapView {
  zoom: number;
  cx: number;
  cy: number;
}
export interface PlacedTile {
  key: string;
  url: string;
  /** Position inside the viewport, in CSS pixels. */
  left: number;
  top: number;
}

export function clampLat(lat: number): number {
  return Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));
}

export function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

/** lon/lat to world pixels at `zoom`. x grows east, y grows south (0 at the north edge). */
export function lonLatToWorld(p: LatLon, zoom: number): { x: number; y: number } {
  const size = worldSize(zoom);
  const x = ((p.lon + 180) / 360) * size;
  const rad = (clampLat(p.lat) * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * size;
  return { x, y };
}

/** World pixels at `zoom` back to lon/lat (inverse of lonLatToWorld). */
export function worldToLonLat(x: number, y: number, zoom: number): LatLon {
  const size = worldSize(zoom);
  const lon = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

/** XYZ tile indices that contain the point. Not wrapped and not clamped. */
export function tileOf(p: LatLon, zoom: number): { x: number; y: number } {
  const w = lonLatToWorld(p, zoom);
  return { x: Math.floor(w.x / TILE_SIZE), y: Math.floor(w.y / TILE_SIZE) };
}

/** Tile URL on the public OSM tile server. `x` wraps around the world; `y` must be in range. */
export function tileUrl(zoom: number, x: number, y: number): string {
  const n = 2 ** zoom;
  const wrappedX = ((x % n) + n) % n;
  return `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
}

export function viewAt(p: LatLon, zoom: number): MapView {
  const w = lonLatToWorld(p, zoom);
  return { zoom, cx: w.x, cy: w.y };
}

/** Tiles that cover the viewport, with their offsets inside it. */
export function visibleTiles(view: MapView, size: Size): PlacedTile[] {
  const n = 2 ** view.zoom;
  const originX = view.cx - size.width / 2;
  const originY = view.cy - size.height / 2;
  const x0 = Math.floor(originX / TILE_SIZE);
  const x1 = Math.floor((originX + size.width) / TILE_SIZE);
  const y0 = Math.max(0, Math.floor(originY / TILE_SIZE));
  const y1 = Math.min(n - 1, Math.floor((originY + size.height) / TILE_SIZE));
  const tiles: PlacedTile[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      tiles.push({
        key: `${view.zoom}:${tx}:${ty}`,
        url: tileUrl(view.zoom, tx, ty),
        left: tx * TILE_SIZE - originX,
        top: ty * TILE_SIZE - originY,
      });
    }
  }
  return tiles;
}

/** Viewport position (CSS px) of a point, relative to the viewport's top-left corner. */
export function toViewport(p: LatLon, view: MapView, size: Size): { left: number; top: number } {
  const w = lonLatToWorld(p, view.zoom);
  return { left: w.x - (view.cx - size.width / 2), top: w.y - (view.cy - size.height / 2) };
}

/**
 * The largest zoom in the fit range at which all points fit into the viewport with `padPx` to
 * spare on each side. One point: SINGLE_POINT_ZOOM centred on it. No points: a neutral view at
 * the fit minimum (callers do not draw a map without points).
 */
export function fitView(points: readonly LatLon[], size: Size, padPx = 48): MapView {
  const first = points[0];
  if (first === undefined) return viewAt({ lat: 0, lon: 0 }, FIT_MIN_ZOOM);
  let minLat = first.lat;
  let maxLat = first.lat;
  let minLon = first.lon;
  let maxLon = first.lon;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  if (minLat === maxLat && minLon === maxLon) {
    return viewAt(first, SINGLE_POINT_ZOOM);
  }
  for (let zoom = FIT_MAX_ZOOM; zoom >= FIT_MIN_ZOOM; zoom--) {
    // Top-left (north-west) and bottom-right (south-east) corners in world pixels.
    const nw = lonLatToWorld({ lat: maxLat, lon: minLon }, zoom);
    const se = lonLatToWorld({ lat: minLat, lon: maxLon }, zoom);
    const width = Math.abs(se.x - nw.x);
    const height = Math.abs(se.y - nw.y);
    if (width + 2 * padPx <= size.width && height + 2 * padPx <= size.height) {
      return { zoom, cx: (nw.x + se.x) / 2, cy: (nw.y + se.y) / 2 };
    }
  }
  return viewAt({ lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 }, FIT_MIN_ZOOM);
}

/** Pan by a pointer or key delta in CSS px. Content moves with the delta (dx > 0 moves it right). */
export function panView(view: MapView, dx: number, dy: number): MapView {
  const max = worldSize(view.zoom);
  return { zoom: view.zoom, cx: view.cx - dx, cy: Math.min(max, Math.max(0, view.cy - dy)) };
}

/** Change zoom by `delta` steps, keeping the centre of the view on the same place. */
export function zoomView(view: MapView, delta: number, min = MIN_ZOOM, max = MAX_ZOOM): MapView {
  const zoom = Math.min(max, Math.max(min, view.zoom + delta));
  const factor = 2 ** (zoom - view.zoom);
  return { zoom, cx: view.cx * factor, cy: view.cy * factor };
}

/** Ground resolution in metres per CSS pixel (for drawing an accuracy circle). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((clampLat(lat) * Math.PI) / 180)) / 2 ** zoom;
}
