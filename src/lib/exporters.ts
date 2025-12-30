import type { StoredReceiptItem } from "@/lib/db";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatIso(ts: number): string {
  try {
    return new Date(ts).toISOString();
  } catch {
    return String(ts);
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function pick(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    const rec = asRecord(cur);
    if (!rec) return undefined;
    cur = rec[p];
  }
  return cur;
}

function normalizeRate(rate: unknown): number | null {
  if (typeof rate === "number" && Number.isFinite(rate)) return rate;
  if (typeof rate !== "string") return null;
  const s = rate.replace(/%/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function rateLabel(rate: number): string {
  const base = Number.isInteger(rate) ? String(rate) : String(rate).replace(".", ",");
  return `KDV ${base}%`;
}

function getKdvRates(items: StoredReceiptItem[]): number[] {
  const set = new Set<number>();
  for (const it of items) {
    const kdv = pick(it.receipt, "tax.kdv");
    if (!Array.isArray(kdv)) continue;
    for (const line of kdv) {
      const r = normalizeRate(asRecord(line)?.rate_percent);
      if (r === null) continue;
      set.add(r);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function buildRows(items: StoredReceiptItem[]) {
  const rates = getKdvRates(items);
  const kdvCols = rates.flatMap((r) => [
    `${rateLabel(r)} Matrah`,
    `${rateLabel(r)} Tutar`,
  ]);

  const cols = [
    "id",
    "created_at",
    "file_name",
    "status",
    "error",
    "merchant_name",
    "transaction_date",
    "transaction_time",
    "currency",
    "receipt_number",
    "payment_method",
    "card_last4",
    "tax_office",
    "tax_no",
    ...kdvCols,
    "subtotal",
    "tax",
    "tip",
    "discount",
    "total",
    "kdv_json",
    "line_items_count",
    "line_items_json",
  ];

  const rows = items.map((it) => {
    const r: Record<string, unknown> = {
      id: it.id,
      created_at: formatIso(it.createdAt),
      file_name: it.fileName,
      status: it.status,
      error: it.error ?? "",
      merchant_name: pick(it.receipt, "merchant.name"),
      transaction_date: pick(it.receipt, "transaction.date"),
      transaction_time: pick(it.receipt, "transaction.time"),
      currency: pick(it.receipt, "transaction.currency"),
      receipt_number: pick(it.receipt, "transaction.receipt_number"),
      payment_method: pick(it.receipt, "transaction.payment_method"),
      card_last4: pick(it.receipt, "transaction.card_last4"),
      tax_office: pick(it.receipt, "tax.tax_office"),
      tax_no: pick(it.receipt, "tax.tax_no"),
      subtotal: pick(it.receipt, "totals.subtotal"),
      tax: pick(it.receipt, "totals.tax"),
      tip: pick(it.receipt, "totals.tip"),
      discount: pick(it.receipt, "totals.discount"),
      total: pick(it.receipt, "totals.total"),
      kdv_json: pick(it.receipt, "tax.kdv"),
      line_items_count: Array.isArray(pick(it.receipt, "line_items"))
        ? (pick(it.receipt, "line_items") as unknown[]).length
        : 0,
      line_items_json: pick(it.receipt, "line_items"),
    };

    // Fill dynamic KDV columns.
    const kdv = pick(it.receipt, "tax.kdv");
    if (Array.isArray(kdv)) {
      const byRate = new Map<number, { taxable_amount?: unknown; tax_amount?: unknown }>();
      for (const line of kdv) {
        const rec = asRecord(line);
        const rr = normalizeRate(rec?.rate_percent);
        if (rr === null) continue;
        const existing = byRate.get(rr) ?? {};
        // Prefer explicit values; if multiple lines share same rate, keep the first non-empty values.
        const taxable = rec?.taxable_amount;
        const taxAmount = rec?.tax_amount;
        byRate.set(rr, {
          taxable_amount: existing.taxable_amount ?? taxable,
          tax_amount: existing.tax_amount ?? taxAmount,
        });
      }
      for (const rate of rates) {
        const v = byRate.get(rate);
        r[`${rateLabel(rate)} Matrah`] = v?.taxable_amount;
        r[`${rateLabel(rate)} Tutar`] = v?.tax_amount;
      }
    }
    return r;
  });

  return { cols, rows };
}

export function downloadCsv(filename: string, items: StoredReceiptItem[]) {
  const { cols, rows } = buildRows(items);
  const header = cols.join(",");
  const lines = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadExcel(filename: string, items: StoredReceiptItem[]) {
  // Excel-compatible HTML table (downloads as .xls). This avoids pulling in a full XLSX writer dependency.
  const { cols, rows } = buildRows(items);
  const escapeHtml = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const table =
    "<table>" +
    "<thead><tr>" +
    cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("") +
    "</tr></thead>" +
    "<tbody>" +
    rows
      .map((r) => `<tr>${cols.map((c) => `<td>${escapeHtml(r[c])}</td>`).join("")}</tr>`)
      .join("") +
    "</tbody></table>";

  const html =
    `<!doctype html><html><head><meta charset="utf-8" /></head><body>` + table + `</body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


