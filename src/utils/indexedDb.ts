import type {
  ChangeLogEntry,
  LocalMediaCapture,
  OfflineOutboxItem,
  SightingEntry,
  SpeciesRecord,
  SyncBatchLog,
} from '../types/cbls';

const DB_NAME = 'bitacora_cbls_db';
const DB_VERSION = 3;

const STORE_SPECIES = 'species';
const STORE_SIGHTINGS = 'sightings';
const STORE_SYNCLOGS = 'synclogs';
const STORE_META = 'metadata';
const STORE_CHANGELOGS = 'changelogs';
const STORE_MEDIA_CAPTURES = 'media_captures';
const STORE_OFFLINE_OUTBOX = 'offline_outbox';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB no está soportado en este navegador'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_SPECIES)) {
        db.createObjectStore(STORE_SPECIES, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_SIGHTINGS)) {
        db.createObjectStore(STORE_SIGHTINGS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_SYNCLOGS)) {
        db.createObjectStore(STORE_SYNCLOGS, { keyPath: 'batchHash' });
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORE_CHANGELOGS)) {
        db.createObjectStore(STORE_CHANGELOGS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_MEDIA_CAPTURES)) {
        const mediaStore = db.createObjectStore(STORE_MEDIA_CAPTURES, {
          keyPath: 'id',
        });
        mediaStore.createIndex('by_sightingId', 'sightingId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_OFFLINE_OUTBOX)) {
        db.createObjectStore(STORE_OFFLINE_OUTBOX, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGetAllSpecies(): Promise<SpeciesRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SPECIES, 'readonly');
    const store = tx.objectStore(STORE_SPECIES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSaveSpecies(record: SpeciesRecord): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SPECIES, 'readwrite');
    const store = tx.objectStore(STORE_SPECIES);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeleteSpecies(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_SPECIES, STORE_SIGHTINGS, STORE_MEDIA_CAPTURES],
      'readwrite',
    );
    const spStore = tx.objectStore(STORE_SPECIES);
    spStore.delete(id);

    const siStore = tx.objectStore(STORE_SIGHTINGS);
    const mediaStore = tx.objectStore(STORE_MEDIA_CAPTURES);
    const req = siStore.getAll();
    req.onsuccess = () => {
      const sightings = req.result as SightingEntry[];
      const deletedSightingIds = new Set<string>();
      sightings.forEach((s) => {
        if (s.speciesId === id) {
          deletedSightingIds.add(s.id);
          siStore.delete(s.id);
        }
      });

      if (deletedSightingIds.size > 0) {
        const mediaReq = mediaStore.getAll();
        mediaReq.onsuccess = () => {
          const captures = (mediaReq.result || []) as LocalMediaCapture[];
          captures.forEach((c) => {
            if (deletedSightingIds.has(c.sightingId)) {
              mediaStore.delete(c.id);
            }
          });
        };
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAllSightings(): Promise<SightingEntry[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SIGHTINGS, 'readonly');
    const store = tx.objectStore(STORE_SIGHTINGS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSaveSighting(entry: SightingEntry): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SIGHTINGS, 'readwrite');
    const store = tx.objectStore(STORE_SIGHTINGS);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeleteSighting(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SIGHTINGS, 'readwrite');
    const store = tx.objectStore(STORE_SIGHTINGS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAllSyncLogs(): Promise<SyncBatchLog[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SYNCLOGS, 'readonly');
    const store = tx.objectStore(STORE_SYNCLOGS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSaveSyncLog(log: SyncBatchLog): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SYNCLOGS, 'readwrite');
    const store = tx.objectStore(STORE_SYNCLOGS);
    const req = store.put(log);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAllChangeLogs(): Promise<ChangeLogEntry[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHANGELOGS, 'readonly');
    const store = tx.objectStore(STORE_CHANGELOGS);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as ChangeLogEntry[];
      items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function idbSaveChangeLog(entry: ChangeLogEntry): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHANGELOGS, 'readwrite');
    const store = tx.objectStore(STORE_CHANGELOGS);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Local Photo / Video Blob Storage (100% Offline in Mountain Fieldwork)
export async function idbSaveMediaCapture(
  capture: LocalMediaCapture,
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA_CAPTURES, 'readwrite');
    const store = tx.objectStore(STORE_MEDIA_CAPTURES);
    const req = store.put(capture);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetMediaCapture(
  id: string,
): Promise<LocalMediaCapture | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA_CAPTURES, 'readonly');
    const store = tx.objectStore(STORE_MEDIA_CAPTURES);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as LocalMediaCapture | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAllMediaCaptures(): Promise<LocalMediaCapture[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA_CAPTURES, 'readonly');
    const store = tx.objectStore(STORE_MEDIA_CAPTURES);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []) as LocalMediaCapture[]);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetMediaBySighting(
  sightingId: string,
): Promise<LocalMediaCapture[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA_CAPTURES, 'readonly');
    const store = tx.objectStore(STORE_MEDIA_CAPTURES);
    if (store.indexNames.contains('by_sightingId')) {
      const idx = store.index('by_sightingId');
      const req = idx.getAll(sightingId);
      req.onsuccess = () => resolve((req.result || []) as LocalMediaCapture[]);
      req.onerror = () => reject(req.error);
    } else {
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result || []) as LocalMediaCapture[];
        resolve(all.filter((item) => item.sightingId === sightingId));
      };
      req.onerror = () => reject(req.error);
    }
  });
}

export async function idbUpdateMediaUploadedUrl(
  captureId: string,
  uploadedUrl: string,
): Promise<void> {
  const existing = await idbGetMediaCapture(captureId);
  if (!existing) return;
  await idbSaveMediaCapture({ ...existing, uploadedUrl });
}

// Offline Sync Outbox Queue (Auto-flushes to Firebase on reconnection)
export async function idbEnqueueOutboxItem(
  item: OfflineOutboxItem,
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_OFFLINE_OUTBOX, 'readwrite');
    const store = tx.objectStore(STORE_OFFLINE_OUTBOX);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAllOutboxItems(): Promise<OfflineOutboxItem[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_OFFLINE_OUTBOX, 'readonly');
    const store = tx.objectStore(STORE_OFFLINE_OUTBOX);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as OfflineOutboxItem[];
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function idbRemoveOutboxItem(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_OFFLINE_OUTBOX, 'readwrite');
    const store = tx.objectStore(STORE_OFFLINE_OUTBOX);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbClearAll(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [
        STORE_SPECIES,
        STORE_SIGHTINGS,
        STORE_SYNCLOGS,
        STORE_CHANGELOGS,
        STORE_MEDIA_CAPTURES,
        STORE_OFFLINE_OUTBOX,
      ],
      'readwrite',
    );
    tx.objectStore(STORE_SPECIES).clear();
    tx.objectStore(STORE_SIGHTINGS).clear();
    tx.objectStore(STORE_SYNCLOGS).clear();
    tx.objectStore(STORE_CHANGELOGS).clear();
    tx.objectStore(STORE_MEDIA_CAPTURES).clear();
    tx.objectStore(STORE_OFFLINE_OUTBOX).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbReplaceAll(data: {
  species: SpeciesRecord[];
  sightings: SightingEntry[];
  syncLogs: SyncBatchLog[];
  changeLogs: ChangeLogEntry[];
}): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_SPECIES, STORE_SIGHTINGS, STORE_SYNCLOGS, STORE_CHANGELOGS],
      'readwrite',
    );
    const spStore = tx.objectStore(STORE_SPECIES);
    const siStore = tx.objectStore(STORE_SIGHTINGS);
    const syStore = tx.objectStore(STORE_SYNCLOGS);
    const chStore = tx.objectStore(STORE_CHANGELOGS);

    spStore.clear();
    siStore.clear();
    syStore.clear();
    chStore.clear();

    data.species.forEach((sp) => spStore.put(sp));
    data.sightings.forEach((si) => siStore.put(si));
    data.syncLogs.forEach((sy) => syStore.put(sy));
    data.changeLogs.forEach((ch) => chStore.put(ch));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
