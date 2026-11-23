import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  disableNetwork,
  doc,
  enableNetwork,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
  sanitizeFirestoreId,
  toFirestoreChangeLogPayload,
  toFirestoreSightingPayload,
  toFirestoreSpeciesPayload,
  toFirestoreSyncLogPayload,
  uploadSightingMediaCapture,
} from '../firebase';
import type {
  ChangeLogAction,
  ChangeLogEntry,
  LocalMediaCapture,
  OfflineOutboxItem,
  SightingEntry,
  SpeciesRecord,
  SyncBatchLog,
  UserSession,
} from '../types/cbls';
import {
  computeDatasetChecksum,
  isPersonalAdminCode,
  validateAccessCode,
} from '../utils/ecology';
import {
  idbDeleteMediaBySighting,
  idbDeleteMediaCapture,
  idbDeleteSighting,
  idbDeleteSpecies,
  idbEnqueueOutboxItem,
  idbGetAllChangeLogs,
  idbGetAllMediaCaptures,
  idbGetAllOutboxItems,
  idbGetAllSightings,
  idbGetAllSpecies,
  idbGetAllSyncLogs,
  idbGetMediaCapture,
  idbRemoveOutboxItem,
  idbReplaceAll,
  idbSaveChangeLog,
  idbSaveMediaCapture,
  idbSaveSighting,
  idbSaveSpecies,
  idbUpdateMediaUploadedUrl,
} from '../utils/indexedDb';

const SESSION_STORAGE_KEY = 'cbls_active_observer_session';
const CLOUD_MIGRATED_KEY = 'cbls_firestore_migrated_v1';

export interface SightingMediaInput {
  photoFile?: File | null;
  videoFile?: File | null;
  removeExistingPhoto?: boolean;
  removeExistingVideo?: boolean;
}

function mergePendingSpecies(
  cloudItems: SpeciesRecord[],
  outbox: OfflineOutboxItem[],
): SpeciesRecord[] {
  const deletedIds = new Set(
    outbox.filter((o) => o.kind === 'species_delete').map((o) => o.entityId),
  );
  const byId = new Map<string, SpeciesRecord>();
  for (const sp of cloudItems) {
    if (!deletedIds.has(sp.id)) {
      byId.set(sp.id, sp);
    }
  }
  for (const item of outbox) {
    if (item.kind === 'species_upsert') {
      const sp = item.payload as SpeciesRecord;
      if (sp && sp.id && !deletedIds.has(sp.id)) {
        byId.set(sp.id, { ...sp, synced: false });
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || ''),
  );
}

function mergePendingSightings(
  cloudItems: SightingEntry[],
  outbox: OfflineOutboxItem[],
): SightingEntry[] {
  const deletedSpeciesIds = new Set(
    outbox.filter((o) => o.kind === 'species_delete').map((o) => o.entityId),
  );
  const deletedSightingIds = new Set(
    outbox.filter((o) => o.kind === 'sighting_delete').map((o) => o.entityId),
  );
  const byId = new Map<string, SightingEntry>();
  for (const si of cloudItems) {
    if (!deletedSpeciesIds.has(si.speciesId) && !deletedSightingIds.has(si.id)) {
      byId.set(si.id, si);
    }
  }
  for (const item of outbox) {
    if (item.kind === 'sighting_create' || item.kind === 'sighting_update') {
      const si = item.payload as SightingEntry;
      if (
        si &&
        si.id &&
        !deletedSpeciesIds.has(si.speciesId) &&
        !deletedSightingIds.has(si.id)
      ) {
        byId.set(si.id, { ...si, synced: false });
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || ''),
  );
}

function mergePendingChangeLogs(
  cloudItems: ChangeLogEntry[],
  outbox: OfflineOutboxItem[],
): ChangeLogEntry[] {
  const byId = new Map<string, ChangeLogEntry>();
  for (const ch of cloudItems) {
    byId.set(ch.id, ch);
  }
  for (const item of outbox) {
    if (item.kind === 'changelog_create') {
      const ch = item.payload as ChangeLogEntry;
      if (ch && ch.id) {
        byId.set(ch.id, ch);
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    (b.timestamp || '').localeCompare(a.timestamp || ''),
  );
}

function formatMb(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function useCblsStore() {
  const [species, setSpecies] = useState<SpeciesRecord[]>([]);
  const [sightings, setSightings] = useState<SightingEntry[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncBatchLog[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);
  const [outboxItems, setOutboxItems] = useState<OfflineOutboxItem[]>([]);
  const [localMediaStats, setLocalMediaStats] = useState<{
    count: number;
    totalBytes: number;
  }>({ count: 0, totalBytes: 0 });
  const [isAutoSyncing, setIsAutoSyncing] = useState<boolean>(false);

  const [offlineAutonomousMode, setOfflineAutonomousMode] = useState<boolean>(false);
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [cloudConnected, setCloudConnected] = useState<boolean>(false);
  const [pendingCloudWrites, setPendingCloudWrites] = useState<number>(0);
  const [lastSavedIso, setLastSavedIso] = useState<string>(() => new Date().toISOString());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<UserSession>;
        if (parsed.observerName && parsed.observerCode) {
          const check = validateAccessCode(parsed.observerCode);
          if (check.valid) {
            return {
              observerName: check.assignedName || parsed.observerName.trim(),
              observerCode: check.normalized,
              isAdmin: check.isAdmin,
            };
          }
        }
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    return null;
  });

  const userSessionRef = useRef(userSession);
  userSessionRef.current = userSession;

  const outboxRef = useRef<OfflineOutboxItem[]>([]);
  outboxRef.current = outboxItems;

  const offlineAutonomousRef = useRef(offlineAutonomousMode);
  offlineAutonomousRef.current = offlineAutonomousMode;

  const syncInFlightRef = useRef<Promise<number> | null>(null);
  const migrationRanRef = useRef(false);
  const idbMirrorReadyRef = useRef(false);
  const initialIdbPromiseRef = useRef<Promise<{
    species: SpeciesRecord[];
    sightings: SightingEntry[];
  }> | null>(null);
  const latestDataRef = useRef({
    species: [] as SpeciesRecord[],
    sightings: [] as SightingEntry[],
    syncLogs: [] as SyncBatchLog[],
    changeLogs: [] as ChangeLogEntry[],
  });

  const refreshMediaStats = useCallback(async () => {
    try {
      const allMedia = await idbGetAllMediaCaptures();
      setLocalMediaStats({
        count: allMedia.length,
        totalBytes: allMedia.reduce((acc, m) => acc + (m.sizeBytes || 0), 0),
      });
    } catch {
      // ignore
    }
  }, []);

  // Load local IndexedDB snapshot + outbox + media stats immediately on boot
  const reloadFromIdb = useCallback(async () => {
    const readPromise = (async () => {
      try {
        const [spList, siList, logs, history, queued, mediaList] = await Promise.all([
          idbGetAllSpecies(),
          idbGetAllSightings(),
          idbGetAllSyncLogs(),
          idbGetAllChangeLogs(),
          idbGetAllOutboxItems(),
          idbGetAllMediaCaptures(),
        ]);

        outboxRef.current = queued;
        setOutboxItems(queued);
        setLocalMediaStats({
          count: mediaList.length,
          totalBytes: mediaList.reduce((acc, m) => acc + (m.sizeBytes || 0), 0),
        });

        const cleanSi = siList.filter(
          (s) => s.microhabitat !== 'Registro primario al catalogar la especie',
        );
        const mergedSp = mergePendingSpecies(spList, queued);
        const mergedSi = mergePendingSightings(cleanSi, queued);
        const mergedCh = mergePendingChangeLogs(history, queued);

        setSpecies(mergedSp);
        setSightings(mergedSi);
        setSyncLogs(logs);
        setChangeLogs(mergedCh);
        return { species: mergedSp, sightings: mergedSi };
      } catch (err) {
        console.error('Error al leer IndexedDB:', err);
        return { species: [], sightings: [] };
      }
    })();
    initialIdbPromiseRef.current = readPromise;
    return readPromise;
  }, []);

  // Mirror cloud state into IndexedDB for offline readiness
  const syncIdbMirror = useCallback(
    (partial: Partial<typeof latestDataRef.current>) => {
      latestDataRef.current = { ...latestDataRef.current, ...partial };
      if (!idbMirrorReadyRef.current) return;
      void idbReplaceAll(latestDataRef.current).catch(() => undefined);
    },
    [],
  );

  // Automatic synchronization function: uploads offline outbox & captured media to Firebase
  const syncOfflineOutboxToFirebase = useCallback(
    async (options?: { silentIfEmpty?: boolean }): Promise<number> => {
      if (offlineAutonomousRef.current || !navigator.onLine) {
        return 0;
      }

      if (syncInFlightRef.current) {
        return syncInFlightRef.current;
      }

      const task = (async () => {
        const queue = await idbGetAllOutboxItems();
        if (queue.length === 0) {
          outboxRef.current = [];
          setOutboxItems([]);
          return 0;
        }

        setIsAutoSyncing(true);
        let syncedCount = 0;

        try {
          await enableNetwork(db).catch(() => undefined);

          // Respect dependency order: species upserts -> sightings -> updates -> deletes -> changelogs
          const orderWeight: Record<OfflineOutboxItem['kind'], number> = {
            species_upsert: 1,
            sighting_create: 2,
            sighting_update: 3,
            sighting_delete: 4,
            species_delete: 5,
            changelog_create: 6,
          };
          const sorted = [...queue].sort(
            (a, b) =>
              orderWeight[a.kind] - orderWeight[b.kind] ||
              a.createdAt.localeCompare(b.createdAt),
          );

          for (const item of sorted) {
            if (!navigator.onLine || offlineAutonomousRef.current) break;

            try {
              if (item.kind === 'species_upsert') {
                const rawSp = item.payload as SpeciesRecord;
                const cleanSp = toFirestoreSpeciesPayload(
                  rawSp,
                  rawSp.updatedAt || new Date().toISOString(),
                );
                await setDoc(doc(db, 'species', cleanSp.id), cleanSp);
                await idbSaveSpecies({ ...cleanSp, synced: true });
                await idbRemoveOutboxItem(item.id);
                syncedCount += 1;
              } else if (item.kind === 'sighting_create' || item.kind === 'sighting_update') {
                const rawSi = item.payload as SightingEntry;
                let nextPhotoUrl = rawSi.photoUrl;
                let nextVideoUrl = rawSi.videoUrl;

                // Try uploading offline-captured photo/video Blobs to Firebase Storage if available
                if (rawSi.localPhotoId && !nextPhotoUrl) {
                  const cap = await idbGetMediaCapture(rawSi.localPhotoId);
                  if (cap) {
                    const url = await uploadSightingMediaCapture(cap);
                    if (url) {
                      nextPhotoUrl = url;
                      await idbUpdateMediaUploadedUrl(cap.id, url);
                    }
                  }
                }
                if (rawSi.localVideoId && !nextVideoUrl) {
                  const cap = await idbGetMediaCapture(rawSi.localVideoId);
                  if (cap) {
                    const url = await uploadSightingMediaCapture(cap);
                    if (url) {
                      nextVideoUrl = url;
                      await idbUpdateMediaUploadedUrl(cap.id, url);
                    }
                  }
                }

                const cleanSi = toFirestoreSightingPayload({
                  ...rawSi,
                  photoUrl: nextPhotoUrl,
                  videoUrl: nextVideoUrl,
                });
                await setDoc(doc(db, 'sightings', cleanSi.id), cleanSi);
                await idbSaveSighting({ ...cleanSi, synced: true });
                await idbRemoveOutboxItem(item.id);
                syncedCount += 1;
              } else if (item.kind === 'sighting_delete') {
                const target = item.payload as { sightingId: string };
                await deleteDoc(doc(db, 'sightings', target.sightingId));
                await idbRemoveOutboxItem(item.id);
                syncedCount += 1;
              } else if (item.kind === 'species_delete') {
                const target = item.payload as {
                  speciesId: string;
                  sightingIds: string[];
                };
                const batch = writeBatch(db);
                batch.delete(doc(db, 'species', target.speciesId));
                (target.sightingIds || []).forEach((sid) => {
                  batch.delete(doc(db, 'sightings', sid));
                });
                await batch.commit();
                await idbRemoveOutboxItem(item.id);
                syncedCount += 1;
              } else if (item.kind === 'changelog_create') {
                const rawCh = item.payload as ChangeLogEntry;
                const cleanCh = toFirestoreChangeLogPayload(rawCh);
                await setDoc(doc(db, 'changelogs', cleanCh.id), cleanCh);
                await idbSaveChangeLog(cleanCh);
                await idbRemoveOutboxItem(item.id);
                syncedCount += 1;
              }
            } catch (err) {
              console.warn('Reintento pendiente para item offline:', item.id, err);
              // Keep item in outbox so next online cycle retries cleanly
            }
          }

          const remaining = await idbGetAllOutboxItems();
          outboxRef.current = remaining;
          setOutboxItems(remaining);

          if (syncedCount > 0) {
            const hash = computeDatasetChecksum(
              latestDataRef.current.species,
              latestDataRef.current.sightings,
            );
            const actor =
              userSessionRef.current?.observerName || 'Dispositivo de campo';
            const syncLog = toFirestoreSyncLogPayload({
              batchHash: `${hash}-${Date.now().toString().slice(-4)}`,
              timestamp: new Date().toLocaleString('es-CR'),
              recordsSynced: syncedCount,
              deviceProfile: actor,
            });
            await setDoc(doc(db, 'synclogs', syncLog.batchHash), syncLog).catch(
              () => undefined,
            );
            setLastSavedIso(new Date().toISOString());
            setStatusMessage(
              `Conexión recuperada: ${syncedCount} registro(s) guardados offline se sincronizaron automáticamente con Firebase.`,
            );
          } else if (!options?.silentIfEmpty && remaining.length > 0) {
            setStatusMessage(
              `${remaining.length} registro(s) permanecen en cola local esperando conexión estable.`,
            );
          }

          return syncedCount;
        } finally {
          setIsAutoSyncing(false);
          syncInFlightRef.current = null;
        }
      })();

      syncInFlightRef.current = task;
      return task;
    },
    [],
  );

  // One-time upload of pre-existing local IndexedDB species (admin) + enable IDB mirror on all devices
  const migrateLegacyLocalRecordsIfNeeded = useCallback(
    async (cloudSpeciesList: SpeciesRecord[]) => {
      if (migrationRanRef.current) return;
      if (localStorage.getItem(CLOUD_MIGRATED_KEY) === '1') {
        migrationRanRef.current = true;
        idbMirrorReadyRef.current = true;
        return;
      }

      const session = userSessionRef.current;
      if (!session?.isAdmin) {
        idbMirrorReadyRef.current = true;
        void idbReplaceAll(latestDataRef.current).catch(() => undefined);
        return;
      }
      migrationRanRef.current = true;

      try {
        const legacy = initialIdbPromiseRef.current
          ? await initialIdbPromiseRef.current
          : { species: await idbGetAllSpecies(), sightings: await idbGetAllSightings() };
        const localSp = legacy.species;
        const localSi = legacy.sightings;

        const cloudIds = new Set(cloudSpeciesList.map((s) => s.id));
        const missingLocalSpecies = localSp.filter(
          (sp) => sp.scientificName?.trim() && sp.commonName?.trim() && !cloudIds.has(sp.id),
        );

        if (missingLocalSpecies.length > 0) {
          const nowIso = new Date().toISOString();
          for (const sp of missingLocalSpecies) {
            const cleanSp = toFirestoreSpeciesPayload(
              { ...sp, creatorName: sp.creatorName || session.observerName },
              nowIso,
            );
            await setDoc(doc(db, 'species', cleanSp.id), cleanSp);
          }

          const validSpeciesIds = new Set([
            ...cloudIds,
            ...missingLocalSpecies.map((s) => sanitizeFirestoreId(s.id, 'sp')),
          ]);
          const cleanLocalSightings = localSi.filter(
            (si) =>
              si.microhabitat !== 'Registro primario al catalogar la especie' &&
              validSpeciesIds.has(sanitizeFirestoreId(si.speciesId, 'sp')),
          );
          for (const si of cleanLocalSightings) {
            const cleanSi = toFirestoreSightingPayload(si);
            await setDoc(doc(db, 'sightings', cleanSi.id), cleanSi);
          }

          setStatusMessage(
            `Se sincronizaron ${missingLocalSpecies.length} especie(s) locales con la nube para todos tus dispositivos.`,
          );
        }

        localStorage.setItem(CLOUD_MIGRATED_KEY, '1');
        idbMirrorReadyRef.current = true;
        void idbReplaceAll(latestDataRef.current).catch(() => undefined);
      } catch (err) {
        console.error('Error al migrar registros locales a la nube:', err);
      }
    },
    [],
  );

  // Real-time Firestore subscriptions + automatic reconnection sync listeners
  useEffect(() => {
    void reloadFromIdb().then(() => {
      if (navigator.onLine && !offlineAutonomousRef.current) {
        void syncOfflineOutboxToFirebase({ silentIfEmpty: true });
      }
    });

    const onOnline = () => {
      setBrowserOnline(true);
      if (!offlineAutonomousRef.current) {
        void syncOfflineOutboxToFirebase({ silentIfEmpty: true });
      }
    };
    const onOffline = () => {
      setBrowserOnline(false);
      setCloudConnected(false);
    };
    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        !offlineAutonomousRef.current
      ) {
        void syncOfflineOutboxToFirebase({ silentIfEmpty: true });
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const speciesQuery = query(
      collection(db, 'species'),
      where('isSample', '==', true),
    );
    const sightingsQuery = query(
      collection(db, 'sightings'),
      where('individualCount', '>=', 1),
    );
    const changelogsQuery = query(
      collection(db, 'changelogs'),
      where('timestamp', '>=', ''),
    );
    const synclogsQuery = query(
      collection(db, 'synclogs'),
      where('recordsSynced', '>=', 0),
    );

    const pendingCounts = { sp: 0, si: 0 };
    const updatePending = () => setPendingCloudWrites(pendingCounts.sp + pendingCounts.si);

    const unsubSpecies = onSnapshot(
      speciesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const items = snapshot.docs.map((d) => {
          const data = d.data() as SpeciesRecord;
          return {
            ...data,
            isSample: true,
            synced: !d.metadata.hasPendingWrites,
          };
        });

        pendingCounts.sp = snapshot.docs.filter((d) => d.metadata.hasPendingWrites).length;
        updatePending();
        setCloudConnected(!snapshot.metadata.fromCache);

        const merged = mergePendingSpecies(items, outboxRef.current);
        setSpecies(merged);
        setLastSavedIso(new Date().toISOString());
        syncIdbMirror({ species: merged });

        if (!snapshot.metadata.fromCache) {
          void migrateLegacyLocalRecordsIfNeeded(items);
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'species');
        } catch (err) {
          setStorageError(
            err instanceof Error && err.message.includes('Quota exceeded')
              ? 'Cuota diaria de Firestore alcanzada. Intenta de nuevo mañana.'
              : 'Error de lectura en tiempo real de especies.',
          );
        }
      },
    );

    const unsubSightings = onSnapshot(
      sightingsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const items = snapshot.docs
          .map((d) => {
            const data = d.data() as SightingEntry;
            return {
              ...data,
              synced: !d.metadata.hasPendingWrites,
            };
          })
          .filter((s) => s.microhabitat !== 'Registro primario al catalogar la especie');

        pendingCounts.si = snapshot.docs.filter((d) => d.metadata.hasPendingWrites).length;
        updatePending();

        const merged = mergePendingSightings(items, outboxRef.current);
        setSightings(merged);
        syncIdbMirror({ sightings: merged });
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'sightings');
        } catch {
          setStorageError('Error de lectura en tiempo real de avistamientos.');
        }
      },
    );

    const unsubChangeLogs = onSnapshot(
      changelogsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => d.data() as ChangeLogEntry);
        const merged = mergePendingChangeLogs(items, outboxRef.current);
        setChangeLogs(merged);
        syncIdbMirror({ changeLogs: merged });
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'changelogs');
        } catch {
          // keep UI running
        }
      },
    );

    const unsubSyncLogs = onSnapshot(
      synclogsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => d.data() as SyncBatchLog);
        setSyncLogs(items);
        syncIdbMirror({ syncLogs: items });
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'synclogs');
        } catch {
          // keep UI running
        }
      },
    );

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubSpecies();
      unsubSightings();
      unsubChangeLogs();
      unsubSyncLogs();
    };
  }, [
    reloadFromIdb,
    syncIdbMirror,
    migrateLegacyLocalRecordsIfNeeded,
    syncOfflineOutboxToFirebase,
  ]);

  // Trigger legacy migration immediately if user logs in as admin after initial load
  useEffect(() => {
    if (userSession?.isAdmin && cloudConnected && !migrationRanRef.current) {
      void migrateLegacyLocalRecordsIfNeeded(species);
    }
  }, [userSession, cloudConnected, species, migrateLegacyLocalRecordsIfNeeded]);

  const effectiveOffline = offlineAutonomousMode || !browserOnline;
  const wsConnected = !effectiveOffline && (cloudConnected || browserOnline);

  const enqueueOutbox = useCallback(async (item: OfflineOutboxItem) => {
    await idbEnqueueOutboxItem(item);
    const updated = await idbGetAllOutboxItems();
    outboxRef.current = updated;
    setOutboxItems(updated);
  }, []);

  const appendCloudChangeLog = useCallback(
    async (
      action: ChangeLogAction,
      target: string,
      details?: string,
      overrideActorName?: string,
    ) => {
      const id = `chg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const entry = toFirestoreChangeLogPayload({
        id,
        actorName: (overrideActorName || userSession?.observerName || 'Observador CBLS').trim(),
        action,
        target,
        details,
        timestamp: new Date().toISOString(),
      });

      await idbSaveChangeLog(entry).catch(() => undefined);
      setChangeLogs((prev) =>
        [entry, ...prev.filter((c) => c.id !== entry.id)].sort((a, b) =>
          b.timestamp.localeCompare(a.timestamp),
        ),
      );

      if (offlineAutonomousRef.current || !navigator.onLine) {
        await enqueueOutbox({
          id: `outbox-chg-${entry.id}`,
          kind: 'changelog_create',
          entityId: entry.id,
          payload: entry,
          createdAt: entry.timestamp,
          retries: 0,
        });
        return entry;
      }

      try {
        await setDoc(doc(db, 'changelogs', entry.id), entry);
      } catch (err) {
        console.warn('Changelog guardado offline en cola:', err);
        await enqueueOutbox({
          id: `outbox-chg-${entry.id}`,
          kind: 'changelog_create',
          entityId: entry.id,
          payload: entry,
          createdAt: entry.timestamp,
          retries: 0,
        });
      }
      return entry;
    },
    [userSession, enqueueOutbox],
  );

  const saveUserSession = useCallback(
    (name: string, code: string): { ok: boolean; error?: string; isAdmin?: boolean } => {
      const check = validateAccessCode(code);
      if (!check.valid) {
        return {
          ok: false,
          error:
            'Código no autorizado. Ingresa tu código personal o uno de los códigos de campo asignados.',
        };
      }

      const cleanName = name.trim();
      let resolvedName = cleanName;

      if (check.assignedName) {
        const normInput = cleanName.toLowerCase().replace(/\./g, '');
        const normAssigned = check.assignedName.toLowerCase().replace(/\./g, '');
        if (
          cleanName &&
          normInput !== normAssigned &&
          !normAssigned.startsWith(normInput)
        ) {
          return {
            ok: false,
            error: `Este código personal está asignado exclusivamente a ${check.assignedName}.`,
          };
        }
        resolvedName = check.assignedName;
      } else if (!cleanName) {
        return { ok: false, error: 'Por favor indica tu nombre completo.' };
      }

      const session: UserSession = {
        observerName: resolvedName,
        observerCode: check.normalized,
        isAdmin: check.isAdmin,
      };
      setUserSession(session);
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch {
        // ignore
      }
      setStatusMessage(
        `Sesión activa: ${session.observerName}${check.isAdmin ? ' · Administrador autorizado' : ''}`,
      );
      return { ok: true, isAdmin: check.isAdmin };
    },
    [],
  );

  const pendingSyncCount = useMemo(() => {
    const unsyncedLocal =
      species.filter((s) => !s.synced).length + sightings.filter((o) => !o.synced).length;
    return Math.max(pendingCloudWrites, unsyncedLocal, outboxItems.length);
  }, [pendingCloudWrites, species, sightings, outboxItems.length]);

  const totalIndividuals = useMemo(
    () => sightings.reduce((sum, s) => sum + s.individualCount, 0),
    [sightings],
  );

  const checksum = useMemo(
    () => computeDatasetChecksum(species, sightings),
    [species, sightings],
  );

  const storageBytes = useMemo(() => {
    try {
      const jsonSize = new Blob([JSON.stringify({ species, sightings })]).size;
      return jsonSize + localMediaStats.totalBytes;
    } catch {
      return localMediaStats.totalBytes;
    }
  }, [species, sightings, localMediaStats.totalBytes]);

  const toggleAutonomousMode = useCallback(async () => {
    const next = !offlineAutonomousMode;
    setOfflineAutonomousMode(next);
    offlineAutonomousRef.current = next;
    try {
      if (next) {
        await disableNetwork(db);
        setCloudConnected(false);
        setStatusMessage(
          'Modo Campo Autónomo activado: Todo se guarda en IndexedDB local sin consumir red.',
        );
      } else {
        await enableNetwork(db);
        setStatusMessage(
          'Enlace en la nube reactivado: sincronizando registros pendientes con Firebase...',
        );
        if (navigator.onLine) {
          void syncOfflineOutboxToFirebase({ silentIfEmpty: true });
        }
      }
    } catch (err) {
      console.error('Error al cambiar estado de red Firestore:', err);
    }
  }, [offlineAutonomousMode, syncOfflineOutboxToFirebase]);

  // Upsert sample species (offline-safe IndexedDB + Cloud Firestore auto-sync)
  const upsertSpecies = useCallback(
    async (record: SpeciesRecord, overrideAdminCode?: string): Promise<boolean> => {
      const authCode = overrideAdminCode || userSession?.observerCode || '';
      const authCheck = validateAccessCode(authCode);
      if (!authCheck.isAdmin) {
        setStorageError('Se requiere clave de administrador para agregar o editar especies.');
        return false;
      }

      const nowIso = new Date().toISOString();
      const exists = species.some((s) => s.id === record.id);
      const { creatorCode: _omitCreatorCode, ...restRecord } = record;
      void _omitCreatorCode;

      const cleanPayload = toFirestoreSpeciesPayload(
        {
          ...restRecord,
          isSample: true,
          creatorName: restRecord.creatorName || userSession?.observerName || 'Administrador',
          updatedAt: nowIso,
        },
        nowIso,
      );

      // Save immediately in IndexedDB + UI state (instantaneous even in zero-signal mountains)
      const isOfflineNow = effectiveOffline || !navigator.onLine;
      const localRecord: SpeciesRecord = {
        ...cleanPayload,
        synced: !isOfflineNow,
      };
      await idbSaveSpecies(localRecord).catch(() => undefined);
      setSpecies((prev) =>
        exists
          ? prev.map((s) => (s.id === localRecord.id ? localRecord : s))
          : [localRecord, ...prev],
      );
      setLastSavedIso(nowIso);

      if (isOfflineNow) {
        await enqueueOutbox({
          id: `outbox-sp-${localRecord.id}`,
          kind: 'species_upsert',
          entityId: localRecord.id,
          payload: localRecord,
          createdAt: nowIso,
          retries: 0,
        });
        await appendCloudChangeLog(
          exists ? 'Editó especie' : 'Creó especie',
          `${localRecord.commonName} (${localRecord.catalogCode})`,
          'Guardado offline en IndexedDB',
        );
        setStorageError(null);
        setStatusMessage(
          `Especie guardada offline en el dispositivo: ${localRecord.commonName}. Se sincronizará con Firebase al recuperar señal.`,
        );
        return true;
      }

      try {
        await setDoc(doc(db, 'species', cleanPayload.id), cleanPayload);
        localStorage.setItem(CLOUD_MIGRATED_KEY, '1');
        setStorageError(null);

        await appendCloudChangeLog(
          exists ? 'Editó especie' : 'Creó especie',
          `${cleanPayload.commonName} (${cleanPayload.catalogCode})`,
          'Especie de muestra en colección',
        );

        setStatusMessage(
          `Especie de muestra guardada y sincronizada en tiempo real con todos los dispositivos: ${cleanPayload.commonName}`,
        );
        return true;
      } catch (err) {
        console.warn('Guardando especie en cola offline tras fallo de red:', err);
        await enqueueOutbox({
          id: `outbox-sp-${localRecord.id}`,
          kind: 'species_upsert',
          entityId: localRecord.id,
          payload: { ...localRecord, synced: false },
          createdAt: nowIso,
          retries: 0,
        });
        await appendCloudChangeLog(
          exists ? 'Editó especie' : 'Creó especie',
          `${localRecord.commonName} (${localRecord.catalogCode})`,
          'En cola de sincronización local',
        );
        setStatusMessage(
          `Sin enlace estable: ${localRecord.commonName} quedó resguardada localmente y se subirá automáticamente al reconectar.`,
        );
        return true;
      }
    },
    [species, userSession, effectiveOffline, enqueueOutbox, appendCloudChangeLog],
  );

  // Delete Species + its sightings (strictly requires explicit personal admin code)
  const deleteSpecies = useCallback(
    async (speciesId: string, overrideAdminCode?: string): Promise<boolean> => {
      if (!isPersonalAdminCode(overrideAdminCode)) {
        setStorageError(
          'Código de seguridad inválido. Solo el código personal exclusivo del administrador puede eliminar fichas.',
        );
        return false;
      }

      const targetSp = species.find((s) => s.id === speciesId);
      const targetLabel = targetSp
        ? `${targetSp.commonName} (${targetSp.catalogCode})`
        : speciesId;
      const relatedSightings = sightings.filter((s) => s.speciesId === speciesId);

      // Delete immediately from IndexedDB + UI state
      await idbDeleteSpecies(speciesId).catch(() => undefined);
      void refreshMediaStats();
      setSpecies((prev) => prev.filter((s) => s.id !== speciesId));
      setSightings((prev) => prev.filter((s) => s.speciesId !== speciesId));
      setStorageError(null);

      const isOfflineNow = effectiveOffline || !navigator.onLine;
      if (isOfflineNow) {
        await enqueueOutbox({
          id: `outbox-del-${speciesId}`,
          kind: 'species_delete',
          entityId: speciesId,
          payload: {
            speciesId,
            sightingIds: relatedSightings.map((s) => s.id),
          },
          createdAt: new Date().toISOString(),
          retries: 0,
        });
        await appendCloudChangeLog('Eliminó especie', targetLabel, 'Pendiente de sincronizar', 'Jorge C');
        setStatusMessage('Especie eliminada localmente. Se actualizará en la nube al reconectar.');
        return true;
      }

      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'species', speciesId));
        relatedSightings.forEach((si) => {
          batch.delete(doc(db, 'sightings', si.id));
        });
        await batch.commit();

        await appendCloudChangeLog('Eliminó especie', targetLabel, undefined, 'Jorge C');
        setLastSavedIso(new Date().toISOString());
        setStatusMessage('Especie eliminada en tiempo real en todos los dispositivos.');
        return true;
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.DELETE, `species/${speciesId}`);
        } catch {
          setStorageError('No se pudo eliminar la especie de la base en la nube.');
        }
        return false;
      }
    },
    [
      species,
      sightings,
      userSession,
      effectiveOffline,
      enqueueOutbox,
      appendCloudChangeLog,
      refreshMediaStats,
    ],
  );

  // Register field sighting + notes + GPS + local captured photo/video (100% offline capable)
  const addSighting = useCallback(
    async (
      entry: Omit<SightingEntry, 'id' | 'occurrenceId' | 'synced' | 'createdAt'>,
      mediaInput?: SightingMediaInput,
    ) => {
      const now = new Date();
      const nowIso = now.toISOString();
      const year = entry.observedDate.slice(0, 4) || String(now.getFullYear());
      const { observerCode: _omitObserverCode, ...cleanEntry } = entry;
      void _omitObserverCode;

      const sightingId = sanitizeFirestoreId(
        `obs-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        'obs',
      );

      let localPhotoId: string | undefined;
      let localVideoId: string | undefined;
      const summaryParts: string[] = [];

      // Persist captured photo/video Blob directly in IndexedDB BEFORE network attempts
      if (mediaInput?.photoFile) {
        localPhotoId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const photoCap: LocalMediaCapture = {
          id: localPhotoId,
          sightingId,
          kind: 'photo',
          fileName: mediaInput.photoFile.name || 'captura_campo.jpg',
          mimeType: mediaInput.photoFile.type || 'image/jpeg',
          sizeBytes: mediaInput.photoFile.size,
          blob: mediaInput.photoFile,
          createdAt: nowIso,
        };
        await idbSaveMediaCapture(photoCap);
        summaryParts.push(`Foto (${formatMb(photoCap.sizeBytes)})`);
      }

      if (mediaInput?.videoFile) {
        localVideoId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const videoCap: LocalMediaCapture = {
          id: localVideoId,
          sightingId,
          kind: 'video',
          fileName: mediaInput.videoFile.name || 'video_campo.mp4',
          mimeType: mediaInput.videoFile.type || 'video/mp4',
          sizeBytes: mediaInput.videoFile.size,
          blob: mediaInput.videoFile,
          createdAt: nowIso,
        };
        await idbSaveMediaCapture(videoCap);
        summaryParts.push(`Video (${formatMb(videoCap.sizeBytes)})`);
      }

      void refreshMediaStats();

      const basePayload = toFirestoreSightingPayload({
        ...cleanEntry,
        id: sightingId,
        occurrenceId: `urn:catalog:CBLS:${year}:OBS-${Date.now().toString().slice(-4)}`,
        localPhotoId,
        localVideoId,
        localMediaSummary:
          summaryParts.length > 0 ? summaryParts.join(' + ') : undefined,
        synced: true,
        createdAt: nowIso,
      });

      const sp = species.find((s) => s.id === basePayload.speciesId);
      const isOfflineNow = effectiveOffline || !navigator.onLine;

      // Save sighting immediately in IndexedDB & React state
      const localEntry: SightingEntry = {
        ...basePayload,
        synced: !isOfflineNow,
      };
      await idbSaveSighting(localEntry).catch(() => undefined);
      setSightings((prev) => [localEntry, ...prev]);
      setLastSavedIso(nowIso);
      setStorageError(null);

      const logDetails = `${localEntry.individualCount} ind. · ${localEntry.observationMethod || 'En persona'} · ${localEntry.locality}${
        localEntry.localMediaSummary ? ` · ${localEntry.localMediaSummary}` : ''
      }`;

      if (isOfflineNow) {
        await enqueueOutbox({
          id: `outbox-si-${localEntry.id}`,
          kind: 'sighting_create',
          entityId: localEntry.id,
          payload: localEntry,
          createdAt: nowIso,
          retries: 0,
        });
        await appendCloudChangeLog(
          'Registró avistamiento',
          sp ? `${sp.commonName} (${sp.catalogCode})` : 'Especie registrada',
          logDetails,
          localEntry.observer,
        );
        setStatusMessage(
          `Guardado 100% offline en IndexedDB (${localEntry.observer}${
            localEntry.localMediaSummary ? ` · ${localEntry.localMediaSummary}` : ''
          }). Se subirá automáticamente a Firebase al volver a tener internet.`,
        );
        return;
      }

      // Online path: try uploading local media blobs to Firebase Storage (optional, short timeout), then write Firestore
      try {
        let finalPhotoUrl = basePayload.photoUrl;
        let finalVideoUrl = basePayload.videoUrl;

        if (localPhotoId && !finalPhotoUrl) {
          const cap = await idbGetMediaCapture(localPhotoId);
          if (cap) {
            const url = await uploadSightingMediaCapture(cap);
            if (url) {
              finalPhotoUrl = url;
              await idbUpdateMediaUploadedUrl(cap.id, url);
            }
          }
        }
        if (localVideoId && !finalVideoUrl) {
          const cap = await idbGetMediaCapture(localVideoId);
          if (cap) {
            const url = await uploadSightingMediaCapture(cap);
            if (url) {
              finalVideoUrl = url;
              await idbUpdateMediaUploadedUrl(cap.id, url);
            }
          }
        }

        const cloudPayload = toFirestoreSightingPayload({
          ...basePayload,
          photoUrl: finalPhotoUrl,
          videoUrl: finalVideoUrl,
        });

        await setDoc(doc(db, 'sightings', cloudPayload.id), cloudPayload);
        await idbSaveSighting({ ...cloudPayload, synced: true }).catch(() => undefined);

        await appendCloudChangeLog(
          'Registró avistamiento',
          sp ? `${sp.commonName} (${sp.catalogCode})` : 'Especie registrada',
          logDetails,
          cloudPayload.observer,
        );

        setStatusMessage(
          `Avistamiento sincronizado en tiempo real por ${cloudPayload.observer}: ${cloudPayload.individualCount} ind.`,
        );
      } catch (err) {
        console.warn('Avistamiento encolado offline tras interrupción de red:', err);
        await enqueueOutbox({
          id: `outbox-si-${localEntry.id}`,
          kind: 'sighting_create',
          entityId: localEntry.id,
          payload: { ...localEntry, synced: false },
          createdAt: nowIso,
          retries: 0,
        });
        await appendCloudChangeLog(
          'Registró avistamiento',
          sp ? `${sp.commonName} (${sp.catalogCode})` : 'Especie registrada',
          logDetails,
          localEntry.observer,
        );
        setStatusMessage(
          `Conexión inestable: avistamiento y archivos guardados en el dispositivo. Se sincronizarán automáticamente al reconectar.`,
        );
      }
    },
    [
      species,
      effectiveOffline,
      enqueueOutbox,
      appendCloudChangeLog,
      refreshMediaStats,
    ],
  );

  // Edit existing field sighting (strictly restricted to authorized personal admin code)
  const updateSighting = useCallback(
    async (
      sightingId: string,
      updates: Omit<SightingEntry, 'id' | 'occurrenceId' | 'synced' | 'createdAt'>,
      mediaInput?: SightingMediaInput,
      overrideAdminCode?: string,
    ): Promise<boolean> => {
      const authCode = overrideAdminCode || userSession?.observerCode || '';
      const authCheck = validateAccessCode(authCode);
      if (!authCheck.isAdmin) {
        setStorageError(
          'Solo el código personal de administrador autorizado puede editar avistamientos.',
        );
        return false;
      }

      const existing = sightings.find((s) => s.id === sightingId);
      if (!existing) {
        setStorageError('No se encontró el avistamiento seleccionado.');
        return false;
      }

      const nowIso = new Date().toISOString();
      const { observerCode: _omitObserverCode, ...cleanUpdates } = updates;
      void _omitObserverCode;

      let nextLocalPhotoId = mediaInput?.removeExistingPhoto
        ? undefined
        : existing.localPhotoId;
      let nextLocalVideoId = mediaInput?.removeExistingVideo
        ? undefined
        : existing.localVideoId;

      if (mediaInput?.removeExistingPhoto && existing.localPhotoId) {
        await idbDeleteMediaCapture(existing.localPhotoId).catch(() => undefined);
      }
      if (mediaInput?.removeExistingVideo && existing.localVideoId) {
        await idbDeleteMediaCapture(existing.localVideoId).catch(() => undefined);
      }

      if (mediaInput?.photoFile) {
        if (existing.localPhotoId) {
          await idbDeleteMediaCapture(existing.localPhotoId).catch(() => undefined);
        }
        nextLocalPhotoId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const photoCap: LocalMediaCapture = {
          id: nextLocalPhotoId,
          sightingId,
          kind: 'photo',
          fileName: mediaInput.photoFile.name || 'captura_campo.jpg',
          mimeType: mediaInput.photoFile.type || 'image/jpeg',
          sizeBytes: mediaInput.photoFile.size,
          blob: mediaInput.photoFile,
          createdAt: nowIso,
        };
        await idbSaveMediaCapture(photoCap);
      }

      if (mediaInput?.videoFile) {
        if (existing.localVideoId) {
          await idbDeleteMediaCapture(existing.localVideoId).catch(() => undefined);
        }
        nextLocalVideoId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const videoCap: LocalMediaCapture = {
          id: nextLocalVideoId,
          sightingId,
          kind: 'video',
          fileName: mediaInput.videoFile.name || 'video_campo.mp4',
          mimeType: mediaInput.videoFile.type || 'video/mp4',
          sizeBytes: mediaInput.videoFile.size,
          blob: mediaInput.videoFile,
          createdAt: nowIso,
        };
        await idbSaveMediaCapture(videoCap);
      }

      const summaryParts: string[] = [];
      if (nextLocalPhotoId) {
        const cap = await idbGetMediaCapture(nextLocalPhotoId).catch(() => undefined);
        summaryParts.push(cap ? `Foto (${formatMb(cap.sizeBytes)})` : 'Foto local');
      }
      if (nextLocalVideoId) {
        const cap = await idbGetMediaCapture(nextLocalVideoId).catch(() => undefined);
        summaryParts.push(cap ? `Video (${formatMb(cap.sizeBytes)})` : 'Video local');
      }
      void refreshMediaStats();

      const basePayload = toFirestoreSightingPayload({
        ...cleanUpdates,
        id: existing.id,
        occurrenceId: existing.occurrenceId,
        createdAt: existing.createdAt,
        localPhotoId: nextLocalPhotoId,
        localVideoId: nextLocalVideoId,
        localMediaSummary:
          summaryParts.length > 0 ? summaryParts.join(' + ') : undefined,
        synced: true,
      });

      const sp = species.find((s) => s.id === basePayload.speciesId);
      const isOfflineNow = effectiveOffline || !navigator.onLine;
      const localEntry: SightingEntry = {
        ...basePayload,
        synced: !isOfflineNow,
      };

      await idbSaveSighting(localEntry).catch(() => undefined);
      setSightings((prev) =>
        prev.map((s) => (s.id === localEntry.id ? localEntry : s)),
      );
      setLastSavedIso(nowIso);
      setStorageError(null);

      const logDetails = `${localEntry.individualCount} ind. · ${localEntry.observationMethod || 'En persona'} · ${localEntry.locality}`;

      if (isOfflineNow) {
        await enqueueOutbox({
          id: `outbox-si-upd-${localEntry.id}`,
          kind: 'sighting_update',
          entityId: localEntry.id,
          payload: localEntry,
          createdAt: nowIso,
          retries: 0,
        });
        await appendCloudChangeLog(
          'Editó avistamiento',
          sp ? `${sp.commonName} (${sp.catalogCode})` : existing.occurrenceId,
          logDetails,
          authCheck.assignedName || userSession?.observerName,
        );
        setStatusMessage(
          `Avistamiento editado offline. Se sincronizará con Firebase al recuperar señal.`,
        );
        return true;
      }

      try {
        let finalPhotoUrl = basePayload.photoUrl;
        let finalVideoUrl = basePayload.videoUrl;

        if (nextLocalPhotoId && !finalPhotoUrl) {
          const cap = await idbGetMediaCapture(nextLocalPhotoId);
          if (cap) {
            const url = await uploadSightingMediaCapture(cap);
            if (url) {
              finalPhotoUrl = url;
              await idbUpdateMediaUploadedUrl(cap.id, url);
            }
          }
        }
        if (nextLocalVideoId && !finalVideoUrl) {
          const cap = await idbGetMediaCapture(nextLocalVideoId);
          if (cap) {
            const url = await uploadSightingMediaCapture(cap);
            if (url) {
              finalVideoUrl = url;
              await idbUpdateMediaUploadedUrl(cap.id, url);
            }
          }
        }

        const cloudPayload = toFirestoreSightingPayload({
          ...basePayload,
          photoUrl: finalPhotoUrl,
          videoUrl: finalVideoUrl,
        });

        await setDoc(doc(db, 'sightings', cloudPayload.id), cloudPayload);
        await idbSaveSighting({ ...cloudPayload, synced: true }).catch(() => undefined);

        await appendCloudChangeLog(
          'Editó avistamiento',
          sp ? `${sp.commonName} (${sp.catalogCode})` : existing.occurrenceId,
          logDetails,
          authCheck.assignedName || userSession?.observerName,
        );

        setStatusMessage(
          `Avistamiento actualizado y sincronizado en tiempo real (${cloudPayload.individualCount} ind. · ${cloudPayload.locality}).`,
        );
        return true;
      } catch (err) {
        console.warn('Edición de avistamiento encolada offline tras fallo de red:', err);
        await enqueueOutbox({
          id: `outbox-si-upd-${localEntry.id}`,
          kind: 'sighting_update',
          entityId: localEntry.id,
          payload: { ...localEntry, synced: false },
          createdAt: nowIso,
          retries: 0,
        });
        await appendCloudChangeLog(
          'Editó avistamiento',
          sp ? `${sp.commonName} (${sp.catalogCode})` : existing.occurrenceId,
          logDetails,
          authCheck.assignedName || userSession?.observerName,
        );
        setStatusMessage(
          `Conexión inestable: cambios del avistamiento guardados localmente para sincronización automática.`,
        );
        return true;
      }
    },
    [
      sightings,
      species,
      userSession,
      effectiveOffline,
      enqueueOutbox,
      appendCloudChangeLog,
      refreshMediaStats,
    ],
  );

  // Delete field sighting (strictly requires explicit personal admin code)
  const deleteSighting = useCallback(
    async (sightingId: string, overrideAdminCode?: string): Promise<boolean> => {
      if (!isPersonalAdminCode(overrideAdminCode)) {
        setStorageError(
          'Código de seguridad inválido. Solo el código personal exclusivo del administrador puede eliminar avistamientos.',
        );
        return false;
      }
      const authCheck = validateAccessCode(overrideAdminCode ?? '');

      const target = sightings.find((s) => s.id === sightingId);
      const sp = target ? species.find((s) => s.id === target.speciesId) : undefined;
      const targetLabel = sp
        ? `${sp.commonName} (${sp.catalogCode})`
        : target?.occurrenceId || sightingId;
      const logDetails = target
        ? `${target.individualCount} ind. · ${target.observedDate} · ${target.locality}`
        : undefined;

      await idbDeleteSighting(sightingId).catch(() => undefined);
      await idbDeleteMediaBySighting(sightingId).catch(() => undefined);
      await idbRemoveOutboxItem(`outbox-si-${sightingId}`).catch(() => undefined);
      await idbRemoveOutboxItem(`outbox-si-upd-${sightingId}`).catch(() => undefined);

      const remainingQueue = await idbGetAllOutboxItems().catch(() => outboxRef.current);
      outboxRef.current = remainingQueue;
      setOutboxItems(remainingQueue);

      void refreshMediaStats();
      setSightings((prev) => prev.filter((s) => s.id !== sightingId));
      setLastSavedIso(new Date().toISOString());
      setStorageError(null);

      const isOfflineNow = effectiveOffline || !navigator.onLine;
      if (isOfflineNow) {
        await enqueueOutbox({
          id: `outbox-si-del-${sightingId}`,
          kind: 'sighting_delete',
          entityId: sightingId,
          payload: { sightingId },
          createdAt: new Date().toISOString(),
          retries: 0,
        });
        await appendCloudChangeLog(
          'Eliminó avistamiento',
          targetLabel,
          logDetails,
          authCheck.assignedName || userSession?.observerName,
        );
        setStatusMessage(
          'Avistamiento eliminado localmente. Se actualizará en Firebase al reconectar.',
        );
        return true;
      }

      try {
        await deleteDoc(doc(db, 'sightings', sightingId));
        await appendCloudChangeLog(
          'Eliminó avistamiento',
          targetLabel,
          logDetails,
          authCheck.assignedName || userSession?.observerName,
        );
        setStatusMessage('Avistamiento eliminado en tiempo real en todos los dispositivos.');
        return true;
      } catch (err) {
        console.warn('Eliminación de avistamiento encolada offline:', err);
        await enqueueOutbox({
          id: `outbox-si-del-${sightingId}`,
          kind: 'sighting_delete',
          entityId: sightingId,
          payload: { sightingId },
          createdAt: new Date().toISOString(),
          retries: 0,
        });
        await appendCloudChangeLog(
          'Eliminó avistamiento',
          targetLabel,
          logDetails,
          authCheck.assignedName || userSession?.observerName,
        );
        setStatusMessage(
          'Eliminado localmente; se sincronizará con Firebase al recuperar conexión estable.',
        );
        return true;
      }
    },
    [
      sightings,
      species,
      userSession,
      effectiveOffline,
      enqueueOutbox,
      appendCloudChangeLog,
      refreshMediaStats,
    ],
  );

  // Manual Sync trigger (runs outbox flush + audit sync batch log)
  const syncPendingRecords = useCallback(async () => {
    if (offlineAutonomousMode) {
      setStatusMessage('Desactiva el Modo Campo Autónomo para sincronizar con Firebase.');
      return;
    }

    if (!navigator.onLine) {
      setStatusMessage(
        'Aún no hay señal de internet. Los registros permanecen seguros en IndexedDB y subirán automáticamente al reconectar.',
      );
      return;
    }

    if (!userSession) {
      setStatusMessage('Identifícate primero con tu nombre y código para sincronizar.');
      return;
    }

    try {
      const flushed = await syncOfflineOutboxToFirebase({ silentIfEmpty: true });
      await enableNetwork(db);
      const hash = computeDatasetChecksum(species, sightings);
      const logEntry = toFirestoreSyncLogPayload({
        batchHash: hash,
        timestamp: new Date().toLocaleString('es-CR'),
        recordsSynced: flushed || pendingSyncCount,
        deviceProfile: userSession.observerName,
      });

      await setDoc(doc(db, 'synclogs', logEntry.batchHash), logEntry);
      await appendCloudChangeLog(
        'Sincronizó lote',
        `Lote #${logEntry.batchHash}`,
        `${species.length} especies · ${sightings.length} avistamientos`,
        userSession.observerName,
      );

      setStatusMessage(
        flushed > 0
          ? `Sincronización completada: ${flushed} registro(s) pendientes subidos a Firebase (#${hash}).`
          : `Todos los dispositivos están sincronizados con Firebase (#${hash}).`,
      );
    } catch (err) {
      console.error('Error al sincronizar lote:', err);
      setStorageError('No se pudo confirmar el lote de sincronización en la nube.');
    }
  }, [
    offlineAutonomousMode,
    userSession,
    species,
    sightings,
    pendingSyncCount,
    syncOfflineOutboxToFirebase,
    appendCloudChangeLog,
  ]);

  // JSON Import across all devices via Cloud Firestore
  const importBackupJson = useCallback(
    async (jsonText: string, overrideAdminCode?: string): Promise<boolean> => {
      try {
        const parsed = JSON.parse(jsonText);
        if (!parsed || !Array.isArray(parsed.species) || !Array.isArray(parsed.sightings)) {
          setStatusMessage('El archivo JSON no contiene el formato esperado (species, sightings).');
          return false;
        }

        const authCode = overrideAdminCode || userSession?.observerCode || '';
        const authCheck = validateAccessCode(authCode);
        if (!authCheck.isAdmin) {
          setStatusMessage('Solo un administrador autorizado puede importar respaldos.');
          return false;
        }

        const nowIso = new Date().toISOString();
        const cleanSpecies = (parsed.species as SpeciesRecord[]).map((sp) =>
          toFirestoreSpeciesPayload(sp, sp.updatedAt || nowIso),
        );
        const validSpeciesIds = new Set(cleanSpecies.map((s) => s.id));
        const cleanSightings = (parsed.sightings as SightingEntry[])
          .filter(
            (si) =>
              si.microhabitat !== 'Registro primario al catalogar la especie' &&
              validSpeciesIds.has(sanitizeFirestoreId(si.speciesId, 'sp')),
          )
          .map((si) => toFirestoreSightingPayload(si));

        const deleteBatch = writeBatch(db);
        species.forEach((sp) => deleteBatch.delete(doc(db, 'species', sp.id)));
        sightings.forEach((si) => deleteBatch.delete(doc(db, 'sightings', si.id)));
        await deleteBatch.commit();

        for (let i = 0; i < cleanSpecies.length; i += 400) {
          const batch = writeBatch(db);
          cleanSpecies.slice(i, i + 400).forEach((sp) => {
            batch.set(doc(db, 'species', sp.id), sp);
          });
          await batch.commit();
        }

        for (let i = 0; i < cleanSightings.length; i += 400) {
          const batch = writeBatch(db);
          cleanSightings.slice(i, i + 400).forEach((si) => {
            batch.set(doc(db, 'sightings', si.id), si);
          });
          await batch.commit();
        }

        localStorage.setItem(CLOUD_MIGRATED_KEY, '1');
        await appendCloudChangeLog(
          'Importó respaldo',
          `${cleanSpecies.length} especies · ${cleanSightings.length} avistamientos`,
        );

        setStatusMessage(
          `Respaldo importado y propagado en tiempo real: ${cleanSpecies.length} especies.`,
        );
        return true;
      } catch (err) {
        console.error('Error al importar JSON:', err);
        setStatusMessage('Error al procesar o subir el archivo JSON.');
        return false;
      }
    },
    [userSession, species, sightings, appendCloudChangeLog],
  );

  // Reset all data to 0 across all devices (strictly requires explicit personal admin code)
  const resetAllDataToZero = useCallback(
    async (overrideAdminCode?: string): Promise<boolean> => {
      if (!isPersonalAdminCode(overrideAdminCode)) {
        setStorageError(
          'Código de seguridad inválido. Solo el código personal exclusivo del administrador puede reiniciar la base a 0.',
        );
        return false;
      }

      try {
        const allDeletes: Array<Promise<void>> = [];
        for (const sp of species) {
          allDeletes.push(deleteDoc(doc(db, 'species', sp.id)));
        }
        for (const si of sightings) {
          allDeletes.push(deleteDoc(doc(db, 'sightings', si.id)));
        }
        for (const sy of syncLogs) {
          allDeletes.push(deleteDoc(doc(db, 'synclogs', sy.batchHash)));
        }
        for (const ch of changeLogs) {
          allDeletes.push(deleteDoc(doc(db, 'changelogs', ch.id)));
        }
        await Promise.all(allDeletes);

        localStorage.setItem(CLOUD_MIGRATED_KEY, '1');
        await appendCloudChangeLog('Reinició base', 'Inventario restablecido a 0', undefined, 'Jorge C');
        setStatusMessage('Sistema reiniciado a 0 en la nube y en todos los dispositivos.');
        return true;
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.DELETE, 'species');
        } catch {
          setStorageError('No se pudo reiniciar la base en la nube.');
        }
        return false;
      }
    },
    [userSession, species, sightings, syncLogs, changeLogs, appendCloudChangeLog],
  );

  const exportBackupObject = useCallback(
    () => ({
      application: 'Bitácora CBLS',
      corridor: 'Corredor Biológico Los Santos, Costa Rica',
      exportedAt: new Date().toISOString(),
      checksum,
      version: 3,
      species,
      sightings,
      syncLogs,
      changeLogs,
    }),
    [checksum, species, sightings, syncLogs, changeLogs],
  );

  return {
    species,
    sightings,
    syncLogs,
    changeLogs,
    outboxCount: outboxItems.length,
    localMediaStats,
    isAutoSyncing,
    userSession,
    saveUserSession,
    offlineAutonomousMode,
    effectiveOffline,
    wsConnected,
    lastSavedIso,
    pendingSyncCount,
    totalIndividuals,
    checksum,
    storageBytes,
    storageError,
    statusMessage,
    clearStatusMessage: () => {
      setStatusMessage(null);
      setStorageError(null);
    },
    toggleAutonomousMode,
    upsertSpecies,
    addSighting,
    updateSighting,
    deleteSighting,
    deleteSpecies,
    syncPendingRecords,
    syncOfflineOutboxToFirebase,
    importBackupJson,
    resetAllDataToZero,
    exportBackupObject,
    reloadFromIdb,
  };
}
