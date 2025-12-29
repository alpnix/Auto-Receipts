export type StoredReceiptItem = {
  id: string;
  createdAt: number;
  fileName: string;
  mimeType: string;
  size: number;
  status: "processing" | "done" | "error";
  error?: string;
  receipt?: unknown;
};

const DB_NAME = "receipt-automation";
const DB_VERSION = 1;
const STORE_ITEMS = "items";
const STORE_IMAGES = "images";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        db.createObjectStore(STORE_ITEMS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function withTx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeNames, mode);
    const result = await fn(tx);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction error"));
    });
    return result;
  } finally {
    db.close();
  }
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function dbUpsertItem(item: StoredReceiptItem): Promise<void> {
  await withTx(STORE_ITEMS, "readwrite", async (tx) => {
    tx.objectStore(STORE_ITEMS).put(item);
    return;
  });
}

export async function dbPutImage(id: string, blob: Blob): Promise<void> {
  await withTx(STORE_IMAGES, "readwrite", async (tx) => {
    tx.objectStore(STORE_IMAGES).put({ id, blob });
    return;
  });
}

export async function dbGetImage(id: string): Promise<Blob | null> {
  return await withTx(STORE_IMAGES, "readonly", async (tx) => {
    const row = await reqToPromise<{ id: string; blob: Blob } | undefined>(
      tx.objectStore(STORE_IMAGES).get(id),
    );
    return row?.blob ?? null;
  });
}

export async function dbDelete(id: string): Promise<void> {
  await withTx([STORE_ITEMS, STORE_IMAGES], "readwrite", async (tx) => {
    tx.objectStore(STORE_ITEMS).delete(id);
    tx.objectStore(STORE_IMAGES).delete(id);
    return;
  });
}

export async function dbListItems(): Promise<StoredReceiptItem[]> {
  return await withTx(STORE_ITEMS, "readonly", async (tx) => {
    const store = tx.objectStore(STORE_ITEMS);
    const items: StoredReceiptItem[] = [];
    await new Promise<void>((resolve, reject) => {
      const cursorReq = store.openCursor();
      cursorReq.onerror = () => reject(cursorReq.error ?? new Error("Failed to read items"));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return resolve();
        items.push(cursor.value as StoredReceiptItem);
        cursor.continue();
      };
    });
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items;
  });
}


