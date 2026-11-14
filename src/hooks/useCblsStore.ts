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
} from '../firebase';
import type {
  ChangeLogAction,
  ChangeLogEntry,
  SightingEntry,
  SpeciesRecord,
  SyncBatchLog,
  UserSession,
} from '../types/cbls';
import { computeDatasetChecksum, validateAccessCode } from '../utils/ecology';
import {
  idbGetAllChangeLogs,
  idbGetAllSightings,
  idbGetAllSpecies,
  idbGetAllSyncLogs,
  idbReplaceAll,
} from '../utils/indexedDb';

const SESSION_STORAGE_KEY = 'cbls_active_observer_session';
const CLOUD_MIGRATED_KEY = 'cbls_firestore_migrated_v1';

export function useCblsStore() {
  const [species, setSpecies] = useState<SpeciesRecord[]>([]);
  const [sightings, setSightings] = useState<SightingEntry[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncBatchLog[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);
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
              observerName: parsed.observerName.trim(),
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

  // Load local IndexedDB snapshot immediately while Firestore streams live cloud data
  const reloadFromIdb = useCallback(async () => {
    const readPromise = (async () => {
      try {
        const [spList, siList, logs, history] = await Promise.all([
          idbGetAllSpecies(),
          idbGetAllSightings(),
          idbGetAllSyncLogs(),
          idbGetAllChangeLogs(),
        ]);
        const cleanSi = siList.filter(
          (s) => s.microhabitat !== 'Registro primario al catalogar la especie',
        );
        setSpecies(spList);
        setSightings(cleanSi);
        setSyncLogs(logs);
        setChangeLogs(history);
        return { species: spList, sightings: cleanSi };
      } catch (err) {
        console.error('Error al leer IndexedDB:', err);
        return { species: [], sightings: [] };
      }
    })();
    initialIdbPromiseRef.current = readPromise;
    return readPromise;
  }, []);

  // Mirror cloud state into IndexedDB for offline telemetry & backup compatibility
  const syncIdbMirror = useCallback(
    (partial: Partial<typeof latestDataRef.current>) => {
      latestDataRef.current = { ...latestDataRef.current, ...partial };
      if (!idbMirrorReadyRef.current) return;
      void idbReplaceAll(latestDataRef.current).catch(() => undefined);
    },
    [],
  );

  // One-time upload of pre-existing local IndexedDB species (e.g. Puma added prior to Firebase provisioning)
  const migrateLegacyLocalRecordsIfNeeded = useCallback(
    async (cloudSpeciesList: SpeciesRecord[]) => {
      if (migrationRanRef.current) return;
      if (localStorage.getItem(CLOUD_MIGRATED_KEY) === '1') {
        migrationRanRef.current = true;
        idbMirrorReadyRef.current = true;
        return;
      }

      const session = userSessionRef.current;
      if (!session?.isAdmin) return;
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

  // Real-time Firestore subscriptions across all devices (Vercel, mobile, desktop)
  useEffect(() => {
    void reloadFromIdb();

    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => {
      setBrowserOnline(false);
      setCloudConnected(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

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
        const items = snapshot.docs
          .map((d) => {
            const data = d.data() as SpeciesRecord;
            return {
              ...data,
              isSample: true,
              synced: !d.metadata.hasPendingWrites,
            };
          })
          .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

        pendingCounts.sp = snapshot.docs.filter((d) => d.metadata.hasPendingWrites).length;
        updatePending();
        setCloudConnected(!snapshot.metadata.fromCache);
        setSpecies(items);
        setLastSavedIso(new Date().toISOString());
        syncIdbMirror({ species: items });

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
          .filter((s) => s.microhabitat !== 'Registro primario al catalogar la especie')
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

        pendingCounts.si = snapshot.docs.filter((d) => d.metadata.hasPendingWrites).length;
        updatePending();
        setSightings(items);
        syncIdbMirror({ sightings: items });
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
        const items = snapshot.docs
          .map((d) => d.data() as ChangeLogEntry)
          .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        setChangeLogs(items);
        syncIdbMirror({ changeLogs: items });
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
      unsubSpecies();
      unsubSightings();
      unsubChangeLogs();
      unsubSyncLogs();
    };
  }, [reloadFromIdb, syncIdbMirror, migrateLegacyLocalRecordsIfNeeded]);

  // Trigger legacy migration immediately if user logs in as admin after initial load
  useEffect(() => {
    if (userSession?.isAdmin && cloudConnected && !migrationRanRef.current) {
      void migrateLegacyLocalRecordsIfNeeded(species);
    }
  }, [userSession, cloudConnected, species, migrateLegacyLocalRecordsIfNeeded]);

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
      try {
        await setDoc(doc(db, 'changelogs', entry.id), entry);
      } catch (err) {
        console.error('Error guardando historial:', err);
      }
      return entry;
    },
    [userSession],
  );

  const saveUserSession = useCallback(
    (name: string, code: string): { ok: boolean; error?: string; isAdmin?: boolean } => {
      const cleanName = name.trim();
      if (!cleanName) {
        return { ok: false, error: 'Por favor indica tu nombre completo.' };
      }

      const check = validateAccessCode(code);
      if (!check.valid) {
        return {
          ok: false,
          error:
            'Código no autorizado. Ingresa uno de los 5 códigos fijos de campo o el código de administrador.',
        };
      }

      const session: UserSession = {
        observerName: cleanName,
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

  const effectiveOffline = offlineAutonomousMode || !browserOnline;
  const wsConnected = !effectiveOffline && (cloudConnected || browserOnline);

  const pendingSyncCount = useMemo(() => {
    const unsyncedLocal =
      species.filter((s) => !s.synced).length + sightings.filter((o) => !o.synced).length;
    return Math.max(pendingCloudWrites, unsyncedLocal);
  }, [pendingCloudWrites, species, sightings]);

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
      return new Blob([JSON.stringify({ species, sightings })]).size;
    } catch {
      return 0;
    }
  }, [species, sightings]);

  const toggleAutonomousMode = useCallback(async () => {
    const next = !offlineAutonomousMode;
    setOfflineAutonomousMode(next);
    try {
      if (next) {
        await disableNetwork(db);
        setCloudConnected(false);
        setStatusMessage(
          'Modo Campo Autónomo activado: Datos guardados localmente sin consumir red.',
        );
      } else {
        await enableNetwork(db);
        setStatusMessage(
          'Enlace en la nube reactivado: sincronizando cambios en tiempo real con todos los dispositivos.',
        );
      }
    } catch (err) {
      console.error('Error al cambiar estado de red Firestore:', err);
    }
  }, [offlineAutonomousMode]);

  // Upsert sample species directly into Cloud Firestore (live across all devices)
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

      try {
        await setDoc(doc(db, 'species', cleanPayload.id), cleanPayload);
        localStorage.setItem(CLOUD_MIGRATED_KEY, '1');
        setStorageError(null);
        setLastSavedIso(nowIso);

        await appendCloudChangeLog(
          exists ? 'Editó especie' : 'Creó especie',
          `${cleanPayload.commonName} (${cleanPayload.catalogCode})`,
          'Especie de muestra en colección',
        );

        setStatusMessage(
          effectiveOffline
            ? `Especie de muestra guardada offline: ${cleanPayload.commonName}. Se subirá a la nube al volver a tener internet.`
            : `Especie de muestra guardada y sincronizada en tiempo real con todos los dispositivos: ${cleanPayload.commonName}`,
        );
        return true;
      } catch (err) {
        try {
          handleFirestoreError(
            err,
            exists ? OperationType.UPDATE : OperationType.CREATE,
            `species/${cleanPayload.id}`,
          );
        } catch (wrapped) {
          setStorageError(
            wrapped instanceof Error && wrapped.message.includes('Quota exceeded')
              ? 'Cuota de Firestore excedida. Intenta más tarde.'
              : 'No se pudo guardar la especie en la nube.',
          );
        }
        return false;
      }
    },
    [species, userSession, effectiveOffline, appendCloudChangeLog],
  );

  // Delete Species + its sightings in Cloud Firestore
  const deleteSpecies = useCallback(
    async (speciesId: string, overrideAdminCode?: string) => {
      const authCode = overrideAdminCode || userSession?.observerCode || '';
      const authCheck = validateAccessCode(authCode);
      if (!authCheck.isAdmin) {
        setStorageError('Se requiere clave de administrador para eliminar especies.');
        return;
      }

      const targetSp = species.find((s) => s.id === speciesId);
      const targetLabel = targetSp
        ? `${targetSp.commonName} (${targetSp.catalogCode})`
        : speciesId;

      try {
        const relatedSightings = sightings.filter((s) => s.speciesId === speciesId);
        const batch = writeBatch(db);
        batch.delete(doc(db, 'species', speciesId));
        relatedSightings.forEach((si) => {
          batch.delete(doc(db, 'sightings', si.id));
        });
        await batch.commit();

        await appendCloudChangeLog('Eliminó especie', targetLabel);
        setLastSavedIso(new Date().toISOString());
        setStatusMessage('Especie eliminada en tiempo real en todos los dispositivos.');
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.DELETE, `species/${speciesId}`);
        } catch {
          setStorageError('No se pudo eliminar la especie de la base en la nube.');
        }
      }
    },
    [species, sightings, userSession, appendCloudChangeLog],
  );

  // Register real field sighting in Cloud Firestore
  const addSighting = useCallback(
    async (entry: Omit<SightingEntry, 'id' | 'occurrenceId' | 'synced' | 'createdAt'>) => {
      const now = new Date();
      const year = entry.observedDate.slice(0, 4) || String(now.getFullYear());
      const { observerCode: _omitObserverCode, ...cleanEntry } = entry;
      void _omitObserverCode;

      const cleanPayload = toFirestoreSightingPayload({
        ...cleanEntry,
        id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        occurrenceId: `urn:catalog:CBLS:${year}:OBS-${Date.now().toString().slice(-4)}`,
        synced: true,
        createdAt: now.toISOString(),
      });

      const sp = species.find((s) => s.id === cleanPayload.speciesId);

      try {
        await setDoc(doc(db, 'sightings', cleanPayload.id), cleanPayload);
        setStorageError(null);
        setLastSavedIso(now.toISOString());

        await appendCloudChangeLog(
          'Registró avistamiento',
          sp ? `${sp.commonName} (${sp.catalogCode})` : 'Especie registrada',
          `${cleanPayload.individualCount} ind. · ${cleanPayload.observationMethod || 'En persona'} · ${cleanPayload.locality}`,
          cleanPayload.observer,
        );

        setStatusMessage(
          effectiveOffline
            ? `Avistamiento guardado offline por ${cleanPayload.observer}. Se sincronizará al tener internet.`
            : `Avistamiento sincronizado en tiempo real por ${cleanPayload.observer}: ${cleanPayload.individualCount} ind.`,
        );
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.CREATE, `sightings/${cleanPayload.id}`);
        } catch {
          setStorageError('Error al guardar el avistamiento en la nube.');
        }
      }
    },
    [species, effectiveOffline, appendCloudChangeLog],
  );

  // Manual Sync trigger (re-enables network if needed and writes sync batch audit log)
  const syncPendingRecords = useCallback(async () => {
    if (offlineAutonomousMode) {
      setStatusMessage('Desactiva el Modo Campo Autónomo para sincronizar en línea.');
      return;
    }

    if (!userSession) {
      setStatusMessage('Identifícate primero con tu nombre y código para sincronizar.');
      return;
    }

    try {
      await enableNetwork(db);
      const hash = computeDatasetChecksum(species, sightings);
      const logEntry = toFirestoreSyncLogPayload({
        batchHash: hash,
        timestamp: new Date().toLocaleString('es-CR'),
        recordsSynced: pendingSyncCount,
        deviceProfile: userSession.observerName,
      });

      await setDoc(doc(db, 'synclogs', logEntry.batchHash), logEntry);
      await appendCloudChangeLog(
        'Sincronizó lote',
        `Lote #${logEntry.batchHash}`,
        `${species.length} especies · ${sightings.length} avistamientos`,
        userSession.observerName,
      );

      setStatusMessage(`Todos los dispositivos están sincronizados con la nube (#${hash}).`);
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

        // Clear existing cloud docs first in chunks
        const deleteBatch = writeBatch(db);
        species.forEach((sp) => deleteBatch.delete(doc(db, 'species', sp.id)));
        sightings.forEach((si) => deleteBatch.delete(doc(db, 'sightings', si.id)));
        await deleteBatch.commit();

        // Write species first so Firestore rule exists(/species/{speciesId}) holds for sightings
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

  // Reset all data to 0 across all devices
  const resetAllDataToZero = useCallback(
    async (overrideAdminCode?: string) => {
      const authCode = overrideAdminCode || userSession?.observerCode || '';
      const authCheck = validateAccessCode(authCode);
      if (!authCheck.isAdmin) {
        setStorageError('Se requiere clave de administrador para reiniciar la base a 0.');
        return;
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
        await appendCloudChangeLog('Reinició base', 'Inventario restablecido a 0');
        setStatusMessage('Sistema reiniciado a 0 en la nube y en todos los dispositivos.');
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.DELETE, 'species');
        } catch {
          setStorageError('No se pudo reiniciar la base en la nube.');
        }
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
      version: 2,
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
    deleteSpecies,
    syncPendingRecords,
    importBackupJson,
    resetAllDataToZero,
    exportBackupObject,
    reloadFromIdb,
  };
}
