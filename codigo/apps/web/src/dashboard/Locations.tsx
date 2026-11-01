import { useState } from "react";
import { TaskSpecSchema } from "@shelfie/core/browser";
import type { CatalogResponse, JobView } from "@shelfie/core/browser";
import { StoreMap } from "../ui/map/StoreMap.js";
import type { MapMarker } from "../ui/map/StoreMap.js";
import { isActiveJob } from "./model.js";

/** Open requests per store, counted over the jobs the dashboard has loaded (active states only). */
export function openRequestsByStore(jobs: readonly JobView[] | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const view of jobs ?? []) {
    if (!isActiveJob(view)) continue;
    const storeIds = new Set<string>();
    for (const task of view.tasks) {
      const spec = TaskSpecSchema.safeParse(task.spec);
      if (spec.success) storeIds.add(spec.data.storeId);
    }
    for (const storeId of storeIds) counts.set(storeId, (counts.get(storeId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Read-only Locations section: every catalog store on a map and in a table, with open requests
 * from the loaded jobs. No add, edit or delete (those are out of scope).
 */
export function LocationsPanel(props: {
  catalog: CatalogResponse | undefined;
  jobs: JobView[] | undefined;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stores = (props.catalog?.cities ?? []).flatMap((city) =>
    city.stores.map((s) => ({ ...s, cityName: city.name })),
  );
  const open = openRequestsByStore(props.jobs);
  const loaded = props.jobs?.length ?? 0;

  const markers: MapMarker[] = stores.map((s) => ({
    id: s.id,
    lat: s.lat,
    lon: s.lon,
    label: s.name,
    count: open.get(s.id) ?? 0,
    selected: s.id === selectedId,
  }));

  return (
    <section className="dcard dlocations" aria-label="Locations">
      <div className="dcard-head">
        <h2 className="dh2">Stores</h2>
        <p className="dsub">Read only. Positions come from the public store catalog.</p>
      </div>

      <StoreMap
        markers={markers}
        onSelect={setSelectedId}
        label="Map of catalog stores"
        countNoun="request"
        emptyText={props.catalog ? "No stores in the catalog." : "Loading stores."}
      />

      {stores.length === 0 ? (
        <p className="dsub">
          {props.catalog ? "No stores in the catalog yet." : "Loading stores."}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="dtable">
            <caption className="sr-only">Catalog stores and their open requests</caption>
            <thead>
              <tr>
                <th scope="col">Store</th>
                <th scope="col">Chain</th>
                <th scope="col">Address</th>
                <th scope="col">Open requests</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const selected = s.id === selectedId;
                return (
                  <tr key={s.id} className={selected ? "is-selected" : undefined}>
                    <td>
                      <button
                        type="button"
                        className="dlocations-store"
                        aria-pressed={selected}
                        onClick={() => setSelectedId(s.id)}
                      >
                        {s.name}
                      </button>
                    </td>
                    <td>{s.chain}</td>
                    <td>{s.address}</td>
                    <td className="num">{open.get(s.id) ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="footnote">
        Open requests are counted over the {loaded} most recent requests loaded here.
      </p>
    </section>
  );
}
