// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreMap } from "./ui/map/StoreMap.js";
import type { MapMarker } from "./ui/map/StoreMap.js";
import {
  MAX_ZOOM,
  fitView,
  lonLatToWorld,
  metersPerPixel,
  panView,
  tileOf,
  tileUrl,
  toViewport,
  viewAt,
  visibleTiles,
  worldToLonLat,
  zoomView,
} from "./ui/map/projection.js";
import type { LatLon, Size } from "./ui/map/projection.js";

afterEach(cleanup);

// Catalog fixture coordinates (testing.ts catalogFixture).
const STORE_A: LatLon = { lat: 48.1255, lon: 11.6109 };
const STORE_B: LatLon = { lat: 48.14, lon: 11.57 };
const SIZE: Size = { width: 320, height: 240 };

function inside(p: { left: number; top: number }, size: Size): boolean {
  return p.left >= 0 && p.top >= 0 && p.left <= size.width && p.top <= size.height;
}

describe("web mercator projection", () => {
  it("puts lon 0 and lat 0 at the centre of the world", () => {
    expect(lonLatToWorld({ lat: 0, lon: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(lonLatToWorld({ lat: 0, lon: 0 }, 3)).toEqual({ x: 1024, y: 1024 });
  });

  it("finds the OSM tile for a known point (London, zoom 10 is 511/340)", () => {
    expect(tileOf({ lat: 51.5, lon: -0.1 }, 10)).toEqual({ x: 511, y: 340 });
  });

  it("round-trips lon/lat through world pixels", () => {
    const back = worldToLonLat(lonLatToWorld(STORE_A, 15).x, lonLatToWorld(STORE_A, 15).y, 15);
    expect(back.lat).toBeCloseTo(STORE_A.lat, 6);
    expect(back.lon).toBeCloseTo(STORE_A.lon, 6);
  });

  it("clamps latitudes beyond Mercator's range instead of returning infinity", () => {
    const p = lonLatToWorld({ lat: 90, lon: 0 }, 4);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.y).toBeCloseTo(0, 0);
  });

  it("builds OSM tile URLs and wraps x around the world", () => {
    expect(tileUrl(2, 1, 1)).toBe("https://tile.openstreetmap.org/2/1/1.png");
    expect(tileUrl(2, -1, 0)).toBe("https://tile.openstreetmap.org/2/3/0.png");
    expect(tileUrl(2, 4, 1)).toBe("https://tile.openstreetmap.org/2/0/1.png");
  });

  it("lists the tiles that cover the viewport with their offsets", () => {
    // World is 512 px at zoom 1; the viewport (256 px) is centred on (256, 256).
    const tiles = visibleTiles({ zoom: 1, cx: 256, cy: 256 }, { width: 256, height: 256 });
    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => [t.left, t.top]).sort()).toEqual([
      [-128, -128],
      [-128, 128],
      [128, -128],
      [128, 128],
    ]);
    for (const t of tiles) expect(t.url.startsWith("https://tile.openstreetmap.org/1/")).toBe(true);
  });

  it("places a point at the viewport centre when the view is centred on it", () => {
    const view = viewAt(STORE_A, 15);
    const p = toViewport(STORE_A, view, SIZE);
    expect(p.left).toBeCloseTo(SIZE.width / 2, 6);
    expect(p.top).toBeCloseTo(SIZE.height / 2, 6);
  });

  it("estimates ground resolution (about 156 km per 256 px tile at the equator, zoom 0)", () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543.03, 0);
    expect(metersPerPixel(60, 0)).toBeCloseTo(156543.03 / 2, 0);
  });
});

describe("fitting markers", () => {
  it("centres a single point at street level (zoom 15)", () => {
    const view = fitView([STORE_A], SIZE);
    expect(view.zoom).toBe(15);
    const p = toViewport(STORE_A, view, SIZE);
    expect(p.left).toBeCloseTo(SIZE.width / 2, 6);
  });

  it("chooses an integer zoom in 11..16 that keeps every point inside the viewport", () => {
    for (const points of [
      [STORE_A, STORE_B],
      [
        { lat: 48.1, lon: 11.5 },
        { lat: 48.15, lon: 11.6 },
      ],
      [STORE_A, { lat: STORE_A.lat + 0.0001, lon: STORE_A.lon + 0.0001 }],
    ]) {
      const view = fitView(points, SIZE);
      expect(Number.isInteger(view.zoom)).toBe(true);
      expect(view.zoom).toBeGreaterThanOrEqual(11);
      expect(view.zoom).toBeLessThanOrEqual(16);
      for (const p of points) {
        expect(inside(toViewport(p, view, SIZE), SIZE)).toBe(true);
      }
    }
  });

  it("zooms in further for nearby stores than for far apart ones", () => {
    const near = fitView([STORE_A, STORE_B], SIZE).zoom;
    const far = fitView([STORE_A, { lat: 49.5, lon: 12.5 }], SIZE).zoom;
    expect(near).toBeGreaterThan(far);
  });
});

describe("view changes", () => {
  it("keeps the centre of the view when zooming", () => {
    const view = viewAt(STORE_A, 12);
    const zoomed = zoomView(view, 1);
    expect(zoomed.zoom).toBe(13);
    const centre = worldToLonLat(zoomed.cx, zoomed.cy, 13);
    expect(centre.lat).toBeCloseTo(STORE_A.lat, 6);
    expect(centre.lon).toBeCloseTo(STORE_A.lon, 6);
  });

  it("clamps zoom to the manual range", () => {
    expect(zoomView(viewAt(STORE_A, 12), 20).zoom).toBe(MAX_ZOOM);
    expect(zoomView(viewAt(STORE_A, 10), -5).zoom).toBe(10);
  });

  it("moves the content with the pan delta and keeps latitude in the world", () => {
    const moved = panView({ zoom: 5, cx: 100, cy: 100 }, 10, -20);
    expect(moved).toEqual({ zoom: 5, cx: 90, cy: 120 });
    expect(panView({ zoom: 5, cx: 100, cy: 5 }, 0, 500).cy).toBe(0);
  });
});

describe("StoreMap", () => {
  const markers: MapMarker[] = [
    { id: "s1", lat: STORE_A.lat, lon: STORE_A.lon, label: "Store A", count: 2 },
    { id: "s2", lat: STORE_B.lat, lon: STORE_B.lon, label: "Store B", count: 1 },
  ];

  function renderMap(extra: Partial<Parameters<typeof StoreMap>[0]> = {}) {
    const onSelect = vi.fn();
    const utils = render(
      createElement(StoreMap, {
        markers,
        onSelect,
        label: "Test map",
        countNoun: "task",
        ...extra,
      }),
    );
    return { ...utils, onSelect };
  }

  function tileZoom(container: HTMLElement): number {
    const src = container.querySelector("img.map-tile")?.getAttribute("src") ?? "";
    const match = /tile\.openstreetmap\.org\/(\d+)\//.exec(src);
    return Number(match?.[1]);
  }

  it("draws OSM tiles only from the tile server and credits OpenStreetMap", () => {
    const { container } = renderMap();
    const tiles = [...container.querySelectorAll("img.map-tile")];
    expect(tiles.length).toBeGreaterThan(0);
    for (const img of tiles) {
      expect(img.getAttribute("src")?.startsWith("https://tile.openstreetmap.org/")).toBe(true);
      expect(img.getAttribute("alt")).toBe("");
      // OSM requires a Referer while the page sends none: the tile sends its origin only
      expect(img.getAttribute("referrerpolicy")).toBe("origin");
      expect(img.getAttribute("loading")).toBe("lazy");
    }
    const link = screen.getByRole("link", { name: "© OpenStreetMap contributors" });
    expect(link.getAttribute("href")).toBe("https://www.openstreetmap.org/copyright");
  });

  it("names each marker with its store and count, and reports the selected id", () => {
    const { onSelect } = renderMap();
    fireEvent.click(screen.getByRole("button", { name: "Store A: 2 open tasks" }));
    expect(onSelect).toHaveBeenCalledWith("s1");
    expect(screen.getByRole("button", { name: "Store B: 1 open task" })).toBeTruthy();
  });

  it("zooms with the plus and minus keys and the buttons", () => {
    const { container } = renderMap();
    const start = tileZoom(container);
    const group = screen.getByRole("group", { name: "Test map" });
    fireEvent.keyDown(group, { key: "+" });
    expect(tileZoom(container)).toBe(start + 1);
    fireEvent.keyDown(group, { key: "-" });
    expect(tileZoom(container)).toBe(start);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(tileZoom(container)).toBe(start - 1);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(tileZoom(container)).toBe(start);
  });

  it("pans with the arrow keys: content moves 64 px in the arrow's direction", () => {
    renderMap();
    const marker = screen.getByRole("button", { name: "Store A: 2 open tasks" });
    const before = parseFloat(marker.style.left);
    const group = screen.getByRole("group", { name: "Test map" });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(parseFloat(marker.style.left) - before).toBeCloseTo(64, 6);
    const top = parseFloat(marker.style.top);
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(top - parseFloat(marker.style.top)).toBeCloseTo(64, 6);
  });

  it("keeps the markers and says so when a tile fails to load", () => {
    const { container } = renderMap();
    const img = container.querySelector("img.map-tile");
    expect(img).not.toBeNull();
    fireEvent.error(img as Element);
    expect(img?.classList.contains("is-failed")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Map tiles did not load");
    expect(screen.getByRole("button", { name: "Store A: 2 open tasks" })).toBeTruthy();
  });

  it("shows the own-position dot only when it is given", () => {
    renderMap();
    expect(
      screen.queryByRole("img", { name: "Your position, shown on this device only" }),
    ).toBeNull();
    cleanup();
    renderMap({ me: { lat: STORE_A.lat, lon: STORE_A.lon, accuracyM: 25 } });
    expect(
      screen.getByRole("img", { name: "Your position, shown on this device only" }),
    ).toBeTruthy();
  });

  it("draws no tiles and shows the empty text when there is nothing to place", () => {
    const { container } = renderMap({ markers: [], emptyText: "Nothing here." });
    expect(screen.getByText("Nothing here.")).toBeTruthy();
    expect(container.querySelectorAll("img.map-tile")).toHaveLength(0);
  });
});
