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

function pick(obj: any, path: string): unknown {
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function buildRows(items: StoredReceiptItem[]) {
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
    "subtotal",
    "tax",
    "tip",
    "discount",
    "total",
    "line_items_count",
    "line_items_json",
  ] as const;

  const rows = items.map((it) => {
    const r: Record<(typeof cols)[number], unknown> = {
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
      subtotal: pick(it.receipt, "totals.subtotal"),
      tax: pick(it.receipt, "totals.tax"),
      tip: pick(it.receipt, "totals.tip"),
      discount: pick(it.receipt, "totals.discount"),
      total: pick(it.receipt, "totals.total"),
      line_items_count: Array.isArray(pick(it.receipt, "line_items"))
        ? (pick(it.receipt, "line_items") as unknown[]).length
        : 0,
      line_items_json: pick(it.receipt, "line_items"),
    };
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


