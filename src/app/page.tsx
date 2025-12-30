"use client";

import styles from "./page.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { dbDelete, dbGetImage, dbListItems, dbPutImage, dbUpsertItem } from "@/lib/db";
import type { StoredReceiptItem } from "@/lib/db";
import { downloadCsv, downloadExcel } from "@/lib/exporters";

type ApiOk = { ok: true; receipt: unknown };
type ApiErr = { ok: false; error: string; details?: unknown };
type ApiResp = ApiOk | ApiErr;

type UiItem = StoredReceiptItem & { previewUrl?: string };

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

export default function Home() {
  const [items, setItems] = useState<UiItem[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const exportableItems = useMemo(() => items.filter((i) => i.status === "done"), [items]);

  const exportBaseName = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = d.toLocaleString("en-US", { month: "long" });
    return `Receipts - ${year} ${month}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await dbListItems();
        if (cancelled) return;
        setItems(list);
        setIsHydrated(true);
      } catch (e) {
        setPageError(e instanceof Error ? e.message : "Failed to load saved items");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load preview URLs (blobs) for any items missing one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = items.filter((i) => !i.previewUrl);
      if (missing.length === 0) return;
      const updates: Array<{ id: string; previewUrl: string }> = [];
      for (const it of missing) {
        const blob = await dbGetImage(it.id);
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        updates.push({ id: it.id, previewUrl: url });
      }
      if (cancelled || updates.length === 0) return;
      setItems((prev) =>
        prev.map((p) => {
          const u = updates.find((x) => x.id === p.id);
          return u ? { ...p, previewUrl: u.previewUrl } : p;
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  async function transcribeOne(file: File) {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const base: StoredReceiptItem = {
      id,
      createdAt,
      fileName: file.name,
      mimeType: file.type || "image/*",
      size: file.size,
      status: "processing",
    };

    // Optimistic UI + persistence
    const previewUrl = URL.createObjectURL(file);
    setItems((prev) => [{ ...base, previewUrl }, ...prev]);
    await dbPutImage(id, file);
    await dbUpsertItem(base);

    try {
      const form = new FormData();
      form.set("image", file);

      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await res.json()) as ApiResp;
      if (!data.ok) throw new Error(data.error);
      const updated: StoredReceiptItem = { ...base, status: "done", receipt: data.receipt };
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      await dbUpsertItem(updated);
    } catch (e) {
      const updated: StoredReceiptItem = {
        ...base,
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
      };
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      await dbUpsertItem(updated);
    }
  }

  async function onAddFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setPageError(null);
    const files = Array.from(fileList).filter((f) => f.type?.startsWith("image/"));
    if (files.length === 0) {
      setPageError("Please choose an image file.");
      return;
    }
    // Fire sequentially to avoid spiky Bedrock usage; can be parallelized later.
    for (const f of files) {
      await transcribeOne(f);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onDelete(id: string) {
    setItems((prev) => {
      const victim = prev.find((p) => p.id === id);
      if (victim?.previewUrl) URL.revokeObjectURL(victim.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    await dbDelete(id);
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Receipt Dashboard</h1>
            <p className={styles.subtitle}>
              Add receipt photos, see extracted fields instantly, delete what you don’t need, and
              export whenever you’re ready.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              className={styles.secondaryButton}
              onClick={() =>
                downloadCsv(`${exportBaseName}.csv`, exportableItems)
              }
              disabled={exportableItems.length === 0}
              title={exportableItems.length === 0 ? "No completed receipts to export yet" : "Export CSV"}
            >
              Export CSV
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() =>
                void downloadExcel(
                  `${exportBaseName}.xlsx`,
                  exportableItems,
                )
              }
              disabled={exportableItems.length === 0}
              title={
                exportableItems.length === 0 ? "No completed receipts to export yet" : "Export Excel"
              }
            >
              Export Excel
            </button>
          </div>
        </header>

        {pageError ? <div className={styles.error}>{pageError}</div> : null}

        <section className={styles.grid}>
          <button
            className={styles.addTile}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add receipt photos"
          >
            <div className={styles.plus}>+</div>
            <div className={styles.addText}>Add photos</div>
            <div className={styles.addSub}>PNG / JPEG / WebP</div>
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => void onAddFiles(e.currentTarget.files)}
            />
          </button>

          {items.map((it) => {
            const merchant = pick(it.receipt, "merchant.name");
            const total = pick(it.receipt, "totals.total");
            const date = pick(it.receipt, "transaction.date");
            const currency = pick(it.receipt, "transaction.currency");
            const lineItems = pick(it.receipt, "line_items");
            const lineCount = Array.isArray(lineItems) ? lineItems.length : 0;
            return (
              <article key={it.id} className={styles.itemCard}>
                <div className={styles.thumbWrap}>
                  {it.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.thumb} src={it.previewUrl} alt={it.fileName} />
                  ) : (
                    <div className={styles.thumbPlaceholder} />
                  )}
                  <button
                    className={styles.trash}
                    onClick={() => void onDelete(it.id)}
                    title="Delete"
                    aria-label="Delete"
                    type="button"
                  >
                    <svg
                      className={styles.trashIcon}
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        fill="currentColor"
                        d="M9 3a1 1 0 0 0-1 1v1H5a1 1 0 1 0 0 2h1v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7h1a1 1 0 1 0 0-2h-3V4a1 1 0 0 0-1-1H9Zm1 2h4v0H10v0Zm-2 2h8v14H8V7Zm2 3a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0v-8a1 1 0 0 1 1-1Zm5 0a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0v-8a1 1 0 0 1 1-1Z"
                      />
                    </svg>
                  </button>
                  <div className={styles.badge} data-status={it.status}>
                    {it.status === "processing"
                      ? "Processing"
                      : it.status === "done"
                        ? "Done"
                        : "Error"}
                  </div>
                </div>

                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>
                    {(typeof merchant === "string" && merchant) || it.fileName}
                  </div>
                  <div className={styles.itemMeta}>
                    {typeof date === "string" && date ? (
                      <span>{date}</span>
                    ) : (
                      <span>{new Date(it.createdAt).toLocaleString()}</span>
                    )}
                    <span>·</span>
                    <span>{(it.size / 1024).toFixed(0)} KB</span>
                    {it.status === "done" ? (
                      <>
                        <span>·</span>
                        <span>
                          {typeof currency === "string" && currency ? `${currency} ` : ""}
                          {typeof total === "number" && Number.isFinite(total) ? total.toFixed(2) : "—"}
                        </span>
                        <span>·</span>
                        <span>{lineCount} items</span>
                      </>
                    ) : null}
                  </div>

                  {it.status === "error" ? <div className={styles.itemError}>{it.error}</div> : null}

                  {it.status === "done" ? (
                    <details className={styles.details}>
                      <summary className={styles.summary}>Transcript JSON</summary>
                      <pre className={styles.pre}>{JSON.stringify(it.receipt, null, 2)}</pre>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>

        {!isHydrated ? <div className={styles.hint}>Loading your saved receipts…</div> : null}
      </main>
    </div>
  );
}
