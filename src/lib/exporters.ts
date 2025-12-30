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
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function getKey(rec: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!rec) return "";
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeDateDmy(input: unknown): string {
  if (typeof input !== "string") return "";
  const s = input.trim();
  if (!s) return "";

  // Accept common receipt formats: DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
  const m = s.match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})/);
  if (!m) return s;

  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return s;

  // Heuristic: if first part looks like year (>= 1900), treat as Y-M-D.
  if (a >= 1900) return `${pad2(c)}/${pad2(b)}/${String(a)}`;

  // Otherwise treat as D-M-Y (or D-M-YY).
  const year = c < 100 ? 2000 + c : c;
  return `${pad2(a)}/${pad2(b)}/${String(year)}`;
}

export function buildRows(items: StoredReceiptItem[]) {
  // Sort by upload time so NO increases by first uploaded, second uploaded, etc.
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt);

  const cols = [
    "NO",
    "FIS NO",
    "TARİH",
    "FİRMA ADI",
    "KDV %1",
    "KDV %10",
    "KDV %20",
    "TOPLAM TUTAR",
    "Vergi Dairesi",
    "Vergi No",
  ];

  const rows = sorted.map((it, idx) => {
    const rec = asRecord(it.receipt);
    const date = getKey(rec, "TARİH", "TARIH", "transaction_date");

    const r: Record<string, unknown> = {
      NO: idx + 1,
      "FIS NO": getKey(rec, "FİŞ NO", "FIS NO", "FİS NO"),
      TARİH: normalizeDateDmy(date),
      "FİRMA ADI": getKey(rec, "FİRMA ADI", "FIRMA ADI", "FİRMA", "FIRMA"),
      "KDV %1": getKey(rec, "KDV %1", "KDV %01"),
      "KDV %10": getKey(rec, "KDV %10"),
      "KDV %20": getKey(rec, "KDV %20"),
      "TOPLAM TUTAR": getKey(rec, "TOPLAM TUTAR", "TOPLAM", "TOTAL"),
      "Vergi Dairesi": getKey(rec, "Vergi Dairesi", "VERGİ DAİRESİ"),
      "Vergi No": getKey(rec, "Vergi No", "VERGİ NO", "VKN", "TCKN"),
    };

    // Ensure all columns exist for every row.
    for (const c of cols) if (!(c in r)) r[c] = "";
    return r;
  });

  return { cols, rows };
}

export function downloadCsv(filename: string, items: StoredReceiptItem[]) {
  const { cols, rows } = buildRows(items);
  const header = cols.join(",");
  const lines = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","));
  // UTF-8 BOM helps Excel on Windows correctly display Turkish characters.
  const csv = "\ufeff" + [header, ...lines].join("\n");
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

export async function downloadExcel(filename: string, items: StoredReceiptItem[]) {
  const { cols, rows } = buildRows(items);

  // Lazy-load to keep initial bundle smaller.
  const XLSX = await import("xlsx");

  // Build an array-of-arrays so column order is exactly `cols`.
  const aoa: unknown[][] = [cols, ...rows.map((r) => cols.map((c) => r[c] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Receipts");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


