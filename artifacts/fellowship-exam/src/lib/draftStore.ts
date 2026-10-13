const DB_NAME = "fellowship_draft_db";
const STORE_NAME = "drafts";

function openDraftDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDraft(token: string, state: { form: any; step: number; files: Record<string, File>; paymentVerified?: any }) {
  try {
    const db = await openDraftDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(state, token);
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("[DraftStore] Failed to save draft to IndexedDB", e);
  }
}

export async function loadDraft(token: string): Promise<{ form: any; step: number; files: Record<string, File>; paymentVerified?: any } | null> {
  try {
    const db = await openDraftDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(token);
    const result = await new Promise<any>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!result) return null;
    return result;
  } catch (e) {
    console.error("[DraftStore] Failed to load draft from IndexedDB", e);
    return null;
  }
}

export async function clearDraft(token: string) {
  try {
    const db = await openDraftDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(token);
    return new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error("[DraftStore] Failed to clear draft", e);
  }
}
