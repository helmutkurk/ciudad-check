import { useState } from "react";
import { isAppError } from "@shelfie/core/browser";
import type { ClaimLocation, TaskListItem } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { GeoError, readDevicePosition } from "../lib/geo.js";
import { useCatalog, useTaskFeed } from "../lib/hooks.js";
import { describeError, S } from "../lib/messages.js";
import { Banner, EmptyState, Skeleton } from "../ui/index.js";
import type { MapMarker, MapMe } from "../ui/map/StoreMap.js";
import { StoreMap } from "../ui/map/StoreMap.js";
import { LocationPrompt, TaskCard } from "./Feed.js";
import type { LocationState } from "./Feed.js";

type LocateState = "idle" | "reading" | "denied" | "unavailable";

/**
 * W1b: map of the stores that have open tasks. Same live feed as the Tasks tab (`useTaskFeed`),
 * joined to catalog store positions by `storeId`. The list below shows every open task, including
 * those whose store has no known position. Claiming is the same TaskDetail flow as the list.
 *
 * Privacy: the worker's own position is read only after "Show my location" is pressed, kept in
 * this component's state (gone when the tab closes), and never sent or stored.
 */
export function MapTab(props: {
  location: ClaimLocation | undefined;
  locationState: LocationState;
  onRequestLocation: () => void;
  onOpen: (task: TaskListItem) => void;
}) {
  const { geolocation } = useDeps();
  const feed = useTaskFeed(props.location);
  const { catalog, loading: catalogLoading, error: catalogError } = useCatalog();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [me, setMe] = useState<MapMe | null>(null);
  const [locate, setLocate] = useState<LocateState>("idle");

  const locationMissing = props.locationState !== "ok";
  const rows: TaskListItem[] = feed.rows.filter((r) => !r.leaving).map((r) => r.task);
  const count = rows.length;

  const stores = new Map<string, { name: string; address: string; lat: number; lon: number }>();
  for (const city of catalog?.cities ?? []) {
    for (const s of city.stores) {
      stores.set(s.id, { name: s.name, address: s.address, lat: s.lat, lon: s.lon });
    }
  }

  const byStore = new Map<string, TaskListItem[]>();
  for (const task of rows) {
    const list = byStore.get(task.storeId);
    if (list) list.push(task);
    else byStore.set(task.storeId, [task]);
  }

  // Markers only for stores with a catalog position; count = open tasks at that store.
  const markers: MapMarker[] = [];
  for (const [storeId, tasks] of byStore) {
    const info = stores.get(storeId);
    if (!info) continue;
    markers.push({
      id: storeId,
      lat: info.lat,
      lon: info.lon,
      label: info.name,
      count: tasks.length,
      selected: storeId === selectedId,
    });
  }

  const selectedTasks = selectedId ? byStore.get(selectedId) : undefined;
  const selectedStore = selectedTasks?.[0];

  const showMe = () => {
    setLocate("reading");
    void readDevicePosition(geolocation).then(
      (pos) => {
        setMe(pos);
        setLocate("idle");
      },
      (err: unknown) => {
        setLocate(err instanceof GeoError && err.kind === "denied" ? "denied" : "unavailable");
      },
    );
  };

  let locateNote: string;
  if (me) locateNote = "Your position is shown on this phone only. It is not sent or stored.";
  else if (locate === "reading") locateNote = "Getting your position.";
  else if (locate === "denied")
    locateNote =
      "Location is blocked for this site, so your position is not shown. The map and the list still work.";
  else if (locate === "unavailable")
    locateNote = "Could not read your position. The map and the list still work.";
  else
    locateNote =
      "Show my location to see where you are among the stores. Only this phone sees it; it is not sent to Shelfie or stored.";

  return (
    <section className="tab-section map-tab" aria-labelledby="map-title">
      <div className="feed-title">
        <h1 id="map-title">Map</h1>
        {!locationMissing && !(feed.loading && count === 0) ? (
          <p className="subhead">{count === 1 ? "1 open task" : `${count} open tasks`}</p>
        ) : null}
      </div>

      {locationMissing ? (
        <LocationPrompt state={props.locationState} onRequest={props.onRequestLocation} />
      ) : (
        <>
          {feed.status === "reconnecting" ? (
            <Banner tone="warning" title="Reconnecting.">
              The list refreshes every few seconds meanwhile.
            </Banner>
          ) : null}
          {feed.error && isAppError(feed.error) ? (
            <p className="error-text" role="alert">
              {describeError(feed.error)}
            </p>
          ) : null}
          {feed.pendingCount > 0 ? (
            <button type="button" className="new-pill" onClick={feed.flush}>
              {feed.pendingCount === 1 ? "1 new task" : `${feed.pendingCount} new tasks`}
            </button>
          ) : null}

          {feed.loading && count === 0 ? (
            <div className="task-list" aria-busy="true" aria-label="Loading tasks">
              <Skeleton />
            </div>
          ) : count === 0 ? (
            <EmptyState text={S.feedEmpty} help={S.feedHint} />
          ) : (
            <>
              <div className="map-locate">
                <button
                  type="button"
                  className="map-locate-button"
                  onClick={me ? () => setMe(null) : showMe}
                  disabled={locate === "reading"}
                >
                  {me ? "Hide my location" : "Show my location"}
                </button>
                <p className="footnote" role="status">
                  {locateNote}
                </p>
              </div>

              {markers.length > 0 ? (
                <StoreMap
                  markers={markers}
                  me={me}
                  onSelect={(id) => setSelectedId(id)}
                  label="Map of stores with open tasks"
                  countNoun="task"
                  emptyText="No store positions to show."
                />
              ) : (
                <p className="footnote map-unmapped">
                  {!catalog && catalogLoading
                    ? "Loading store positions."
                    : catalogError
                      ? "Store positions could not be loaded. The list below still shows every task."
                      : "Store positions for these tasks are not known yet. The list below still shows them."}
                </p>
              )}

              {selectedId && selectedTasks && selectedStore ? (
                <section className="map-card" aria-label="Tasks at this store">
                  <div className="map-card-head">
                    <div className="map-card-text">
                      <h2 className="map-card-title">{selectedStore.storeName}</h2>
                      <p className="footnote">{selectedStore.storeAddress}</p>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setSelectedId(null)}
                    >
                      Close
                    </button>
                  </div>
                  <ul className="task-list" aria-label="Open tasks at this store">
                    {selectedTasks.map((task) => (
                      <li key={task.id} className="task-item">
                        <TaskCard task={task} onOpen={() => props.onOpen(task)} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <h2 className="section-title">All open tasks</h2>
              <ul className="task-list" aria-label="Open tasks">
                {rows.map((task) => (
                  <li key={task.id} className="task-item">
                    <TaskCard task={task} onOpen={() => props.onOpen(task)} />
                    {stores.has(task.storeId) ? null : (
                      <p className="footnote task-unmapped">
                        Store position unknown, not shown on the map.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
