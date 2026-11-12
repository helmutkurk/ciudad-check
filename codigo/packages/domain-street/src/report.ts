import { formatMoney, streetCategoryLabels } from "@shelfie/core";
import type {
  StreetCategory,
  StreetCountry,
  StreetCurrency,
  StreetEvaluateKind,
  StreetReportStatus,
} from "@shelfie/core";

// Spanish report template for a municipality or neighbourhood group: one row per verified item.
// Free text (notes) is flattened into a table cell; nothing here is rendered as HTML.

export const STREET_STATUS_LABELS_ES: Record<StreetReportStatus, string> = {
  new: "Nuevo",
  verified: "Verificado",
  rejected: "Rechazado",
  repaired: "Reparado",
};

export const STREET_KIND_LABELS_ES: Record<StreetEvaluateKind, string> = {
  report: "Reporte ciudadano",
  confirm: "Confirmación",
  measure: "Medición",
  repair_check: "Revisión de reparación",
};

export interface StreetReportRow {
  category: StreetCategory;
  status: StreetReportStatus;
  lat: number;
  lng: number;
  capturedAtIso: string;
  /** Reports in the same 15 m cluster. */
  clusterSize: number;
  note?: string | undefined;
  payout?: { amountMinor: number; currency: StreetCurrency } | null | undefined;
}

export interface StreetReportInput {
  country: StreetCountry;
  city: string;
  generatedAtIso: string;
  rows: readonly StreetReportRow[];
  /** True while FAKE_PAYMENTS is on: every payout is footnoted as simulated. */
  simulatedPayments: boolean;
}

const cell = (s: string): string => s.replace(/[|<>]/g, "/").replace(/\r?\n/g, " ").trim();

export function renderStreetReport(input: StreetReportInput): string {
  const labels = streetCategoryLabels(input.country);
  const lines: string[] = [
    `# Informe de calle: ${cell(input.city)}`,
    ``,
    `Generado ${input.generatedAtIso} | ${input.rows.length} registros`,
    ``,
    `| Categoría | Estado | Ubicación | Fecha | Reportes cercanos | Pago | Nota |`,
    `|---|---|---|---|---|---|---|`,
  ];
  const totals = new Map<StreetCurrency, number>();
  for (const row of input.rows) {
    const pay = row.payout ? formatMoney(row.payout) : "-";
    if (row.payout) {
      totals.set(
        row.payout.currency,
        (totals.get(row.payout.currency) ?? 0) + row.payout.amountMinor,
      );
    }
    lines.push(
      `| ${labels[row.category]} | ${STREET_STATUS_LABELS_ES[row.status]} | ${row.lat.toFixed(5)}, ${row.lng.toFixed(5)} | ${row.capturedAtIso} | ${row.clusterSize} | ${pay} | ${cell(row.note ?? "") || "-"} |`,
    );
  }
  if (input.rows.length === 0) lines.push(`| - | - | - | - | - | - | Sin registros |`);
  lines.push(``);
  for (const [currency, amountMinor] of totals) {
    lines.push(`Total pagado: ${formatMoney({ amountMinor, currency })}`);
  }
  if (input.simulatedPayments && totals.size > 0) {
    lines.push(``, `Nota: los pagos de este informe son simulados; no se movió dinero real.`);
  }
  lines.push(
    ``,
    `Las fotos se verifican por categoría, ubicación y hora. Las caras y placas se difuminan antes de publicar (en desarrollo).`,
  );
  return lines.join("\n");
}
