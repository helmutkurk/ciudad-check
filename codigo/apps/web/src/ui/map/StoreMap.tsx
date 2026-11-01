import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitView,
  metersPerPixel,
  panView,
  toViewport,
  visibleTiles,
  zoomView,
} from "./projection.js";
import type { LatLon, MapView, Size } from "./projection.js";

// Dependency-free slippy map (no map SDK, no CDN script). Tiles are plain <img> elements from the
// OpenStreetMap tile server (CSP img-src, contracts.md section 0). Marker and "me" positions are
// set with CSSOM (`style` props), which style-src 'self' allows.

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  /** Accessible name, e.g. the store name. */
  label: string;
  /** Number shown on the marker and in its accessible name (open tasks or requests). */
  count?: number;
  selected?: boolean;
}

/** The worker's own position, shown on this device only. Never sent or stored by the app. */
export interface MapMe {
  lat: number;
  lon: number;
  accuracyM: number;
}

export interface StoreMapProps {
  markers: readonly MapMarker[];
  me?: MapMe | null;
  onSelect: (id: string) => void;
  /** Accessible name of the map. */
  label: string;
  /** Singular noun for `count`, e.g. "task" or "request". Plural adds "s". */
  countNoun?: string;
  emptyText?: string;
}

const FALLBACK_SIZE: Size = { width: 320, height: 240 };
const PAN_STEP_PX = 64;
const DRAG_START_PX = 3;
const ME_RADIUS_MAX_PX = 1200;

function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>(FALLBACK_SIZE);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width <= 0 || height <= 0) return;
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function markerName(m: MapMarker, noun: string): string {
  if (m.count === undefined) return m.label;
  return `${m.label}: ${m.count} open ${m.count === 1 ? noun : `${noun}s`}`;
}

/**
 * Read-only-by-default map: drag or arrow keys pan, +/- or the buttons zoom. The view fits all
 * markers (and `me`) when the set of points changes; a user pan or zoom is kept until it does.
 */
export function StoreMap(props: StoreMapProps) {
  const { markers, onSelect, countNoun = "task" } = props;
  const me = props.me ?? null;
  const hostRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(hostRef);

  const points: LatLon[] = [...markers, ...(me ? [me] : [])];
  const fitKey = [
    ...markers.map((m) => `${m.id}@${m.lat},${m.lon}`),
    me ? `me@${me.lat},${me.lon}` : "",
  ].join("|");
  const fitted = fitView(points, size);

  // A manual view is only valid for the point set it was made for; a new set refits.
  const [manual, setManual] = useState<{ key: string; view: MapView } | null>(null);
  const view = manual && manual.key === fitKey ? manual.view : fitted;
  const commit = (next: MapView) => setManual({ key: fitKey, view: next });

  const [failedTiles, setFailedTiles] = useState<ReadonlySet<string>>(() => new Set());
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; start: MapView; pointerId: number } | null>(null);

  if (points.length === 0) {
    return (
      <div className="map-frame map-frame-empty">
        <p className="map-empty">{props.emptyText ?? "No locations to show."}</p>
      </div>
    );
  }

  const tiles = visibleTiles(view, size);
  const failedVisible = tiles.filter((t) => failedTiles.has(t.url)).length;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Markers and controls handle their own clicks.
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, start: view, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!dragging && Math.abs(dx) + Math.abs(dy) < DRAG_START_PX) return;
    if (!dragging) setDragging(true);
    commit(panView(d.start, dx, dy));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      // Content moves in the arrow's direction, as with the pointer.
      case "ArrowLeft":
        commit(panView(view, -PAN_STEP_PX, 0));
        break;
      case "ArrowRight":
        commit(panView(view, PAN_STEP_PX, 0));
        break;
      case "ArrowUp":
        commit(panView(view, 0, -PAN_STEP_PX));
        break;
      case "ArrowDown":
        commit(panView(view, 0, PAN_STEP_PX));
        break;
      case "+":
      case "=":
        commit(zoomView(view, 1));
        break;
      case "-":
      case "_":
        commit(zoomView(view, -1));
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const inside = (p: { left: number; top: number }) =>
    p.left > -40 && p.top > -40 && p.left < size.width + 40 && p.top < size.height + 40;

  return (
    <div className="map-frame">
      <div
        ref={hostRef}
        className={`map-viewport${dragging ? " is-dragging" : ""}`}
        role="group"
        aria-label={props.label}
        aria-describedby="map-keys-hint"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="map-tiles" aria-hidden="true">
          {tiles.map((t) => (
            <img
              key={t.key}
              className={`map-tile${failedTiles.has(t.url) ? " is-failed" : ""}`}
              src={t.url}
              alt=""
              loading="lazy"
              // OSM tile policy needs a Referer; the page policy is no-referrer, so send only the origin
              referrerPolicy="origin"
              draggable={false}
              style={{ left: t.left, top: t.top }}
              onError={() => setFailedTiles((prev) => new Set(prev).add(t.url))}
            />
          ))}
        </div>

        {markers.map((m) => {
          const p = toViewport(m, view, size);
          if (!inside(p)) return null;
          return (
            <button
              key={m.id}
              type="button"
              className={`map-marker${m.selected ? " is-selected" : ""}`}
              style={{ left: p.left, top: p.top }}
              aria-label={markerName(m, countNoun)}
              aria-pressed={m.selected ?? false}
              onClick={() => onSelect(m.id)}
            >
              <span className="map-marker-count" aria-hidden="true">
                {m.count !== undefined && m.count > 0 ? m.count : ""}
              </span>
            </button>
          );
        })}

        {me ? <MeDot me={me} view={view} size={size} /> : null}

        <div className="map-controls">
          <button
            type="button"
            className="map-control"
            aria-label="Zoom in"
            disabled={view.zoom >= MAX_ZOOM}
            onClick={() => commit(zoomView(view, 1))}
          >
            +
          </button>
          <button
            type="button"
            className="map-control"
            aria-label="Zoom out"
            disabled={view.zoom <= MIN_ZOOM}
            onClick={() => commit(zoomView(view, -1))}
          >
            −
          </button>
        </div>
      </div>

      <p id="map-keys-hint" className="sr-only">
        Drag the map or use the arrow keys to move it. Use plus and minus to zoom.
      </p>
      <div className="map-foot">
        <p className="map-attribution">
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            © OpenStreetMap contributors
          </a>
        </p>
        {failedVisible > 0 ? (
          <p className="map-notice" role="status">
            Map tiles did not load. The store positions are still shown.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MeDot(props: { me: MapMe; view: MapView; size: Size }) {
  const { me, view, size } = props;
  const p = toViewport(me, view, size);
  const radius = Math.min(
    ME_RADIUS_MAX_PX,
    Math.max(6, me.accuracyM / metersPerPixel(me.lat, view.zoom)),
  );
  return (
    <>
      <div
        className="map-accuracy"
        aria-hidden="true"
        style={{
          left: p.left - radius,
          top: p.top - radius,
          width: radius * 2,
          height: radius * 2,
        }}
      />
      <div
        className="map-me"
        role="img"
        aria-label="Your position, shown on this device only"
        style={{ left: p.left, top: p.top }}
      />
    </>
  );
}
