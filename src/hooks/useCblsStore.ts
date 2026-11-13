import { useCallback, useEffect, useMemo, useState } from 'react';
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
  idbClearAll,
  idbDeleteSpecies,
  idbGetAllChangeLogs,
  idbGetAllSightings,
  idbGetAllSpecies,
  idbGetAllSyncLogs,
  idbSaveChangeLog,
  idbSaveSighting,
  idbSaveSpecies,
  idbSaveSyncLog,
} from '../utils/indexedDb';

const BROADCAST_CHANNEL_NAME = 'bitacora_cbls_sync_channel';
const SESSION_STORAGE_KEY = 'cbls_active_observer_session';

export function useCblsStore() {
  const [species, setSpecies] = useState<SpeciesRecord[]>([]);
  const [sightings, setSightings] = useState<SightingEntry[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncBatchLog[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);
  const [offlineAutonomousMode, setOfflineAutonomousMode] = useState<boolean>(false);
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [lastSavedIso, setLastSavedIso] = useState<string>(() => new Date().toISOString());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  // User session state: Observer Name + validated access code (fixed 5 codes or admin 5531)
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

  // Reload data from IndexedDB
  const reloadFromIdb = useCallback(async () => {
    try {
      const [spList, siList, logs, history] = await Promise.all([
        idbGetAllSpecies(),
        idbGetAllSightings(),
        idbGetAllSyncLogs(),
        idbGetAllChangeLogs(),
      ]);
      setSpecies(spList);
      setSightings(siList);
      setSyncLogs(logs);
      setChangeLogs(history);
    } catch (err) {
      console.error('Error al cargar datos desde IndexedDB:', err);
      setStorageError('Error al leer de la base de datos local IndexedDB.');
    }
  }, []);

  // BroadcastChannel for instant cross-tab / cross-device synchronization
  useEffect(() => {
    reloadFromIdb();

    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === 'CBLS_DATA_MUTATED') {
          reloadFromIdb();
          setStatusMessage(
            `Actualización en tiempo real recibida (${event.data.origin || 'otro dispositivo'}).`,
          );
        }
      };
    }

    // Also listen to storage events as fallback
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cbls_sync_ping') {
        reloadFromIdb();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('storage', handleStorageChange);
      if (channel) channel.close();
    };
  }, [reloadFromIdb]);

  // Broadcast change helper
  const notifyMutation = useCallback((actionDesc: string) => {
    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        channel.postMessage({
          type: 'CBLS_DATA_MUTATED',
          origin: 'Local',
          desc: actionDesc,
          time: Date.now(),
        });
        channel.close();
      }
      localStorage.setItem('cbls_sync_ping', String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  // Append name-only change log entry (never stores access codes)
  const appendChangeLog = useCallback(
    async (
      action: ChangeLogAction,
      target: string,
      details?: string,
      overrideActorName?: string,
    ) => {
      const entry: ChangeLogEntry = {
        id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        actorName: (overrideActorName || userSession?.observerName || 'Persona sin identificar').trim(),
        action,
        target,
        details,
        timestamp: new Date().toISOString(),
      };
      await idbSaveChangeLog(entry);
      setChangeLogs((prev) => [entry, ...prev]);
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

  const pendingSyncCount = useMemo(() => {
    const unsyncedSpecies = species.filter((s) => !s.synced).length;
    const unsyncedSightings = sightings.filter((o) => !o.synced).length;
    return unsyncedSpecies + unsyncedSightings;
  }, [species, sightings]);

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

  const toggleAutonomousMode = useCallback(() => {
    setOfflineAutonomousMode((prev) => {
      const next = !prev;
      setStatusMessage(
        next
          ? 'Modo Campo Autónomo activado: Datos guardados en IndexedDB de forma local sin requerir conexión.'
          : 'Enlace de red habilitado para el dispositivo.',
      );
      return next;
    });
  }, []);

  // Upsert Species (IndexedDB + State + Name-only Change Log)
  const upsertSpecies = useCallback(
    async (record: SpeciesRecord) => {
      const exists = species.some((s) => s.id === record.id);
      const { creatorCode: _omitCreatorCode, ...restRecord } = record;
      void _omitCreatorCode;

      const updatedRecord: SpeciesRecord = {
        ...restRecord,
        isSample: restRecord.isSample ?? true,
        creatorName: restRecord.creatorName || userSession?.observerName,
        updatedAt: new Date().toISOString(),
        synced: false,
      };

      try {
        await idbSaveSpecies(updatedRecord);
        setSpecies((prev) =>
          exists
            ? prev.map((s) => (s.id === record.id ? updatedRecord : s))
            : [updatedRecord, ...prev],
        );

        await appendChangeLog(
          exists ? 'Editó especie' : 'Creó especie',
          `${updatedRecord.commonName} (${updatedRecord.catalogCode})`,
          'Especie de muestra en colección',
        );

        setLastSavedIso(new Date().toISOString());
        notifyMutation(`Especie de muestra guardada: ${updatedRecord.commonName}`);
        setStatusMessage(
          `Especie de muestra guardada en colección: ${updatedRecord.commonName} (${updatedRecord.catalogCode})`,
        );
      } catch (err) {
        console.error('Error al guardar especie:', err);
        setStorageError('No se pudo escribir en IndexedDB.');
      }
    },
    [species, userSession, appendChangeLog, notifyMutation],
  );

  // Delete Species
  const deleteSpecies = useCallback(
    async (speciesId: string) => {
      try {
        const targetSp = species.find((s) => s.id === speciesId);
        const targetLabel = targetSp
          ? `${targetSp.commonName} (${targetSp.catalogCode})`
          : speciesId;

        await idbDeleteSpecies(speciesId);
        setSpecies((prev) => prev.filter((s) => s.id !== speciesId));
        setSightings((prev) => prev.filter((o) => o.speciesId !== speciesId));

        await appendChangeLog('Eliminó especie', targetLabel);

        setLastSavedIso(new Date().toISOString());
        notifyMutation(`Especie eliminada: ${targetLabel}`);
        setStatusMessage('Especie eliminada del registro local.');
      } catch (err) {
        console.error('Error al eliminar especie:', err);
        setStorageError('No se pudo eliminar de IndexedDB.');
      }
    },
    [species, appendChangeLog, notifyMutation],
  );

  // Add Sighting
  const addSighting = useCallback(
    async (entry: Omit<SightingEntry, 'id' | 'occurrenceId' | 'synced' | 'createdAt'>) => {
      const now = new Date();
      const year = entry.observedDate.slice(0, 4) || String(now.getFullYear());
      const { observerCode: _omitObserverCode, ...cleanEntry } = entry;
      void _omitObserverCode;

      const newSighting: SightingEntry = {
        ...cleanEntry,
        id: `obs-${Date.now()}`,
        occurrenceId: `urn:catalog:CBLS:${year}:OBS-${Date.now().toString().slice(-4)}`,
        synced: false,
        createdAt: now.toISOString(),
      };

      try {
        const sp = species.find((s) => s.id === cleanEntry.speciesId);
        await idbSaveSighting(newSighting);
        setSightings((prev) => [newSighting, ...prev]);

        await appendChangeLog(
          'Registró avistamiento',
          sp ? `${sp.commonName} (${sp.catalogCode})` : 'Especie registrada',
          `${cleanEntry.individualCount} ind. · ${cleanEntry.locality}`,
          cleanEntry.observer,
        );

        setLastSavedIso(now.toISOString());
        notifyMutation(`Nuevo avistamiento por ${cleanEntry.observer}`);
        setStatusMessage(
          `Avistamiento registrado por ${cleanEntry.observer}: ${cleanEntry.individualCount} ind.`,
        );
      } catch (err) {
        console.error('Error al guardar avistamiento:', err);
        setStorageError('Error al guardar en IndexedDB.');
      }
    },
    [species, appendChangeLog, notifyMutation],
  );

  // Manual Sync trigger
  const syncPendingRecords = useCallback(async () => {
    if (offlineAutonomousMode) {
      setStatusMessage('Desactiva el Modo Campo Autónomo para sincronizar en línea.');
      return;
    }

    try {
      const updatedSpecies = species.map((s) => ({ ...s, synced: true }));
      const updatedSightings = sightings.map((o) => ({ ...o, synced: true }));

      await Promise.all([
        ...updatedSpecies.map((s) => idbSaveSpecies(s)),
        ...updatedSightings.map((o) => idbSaveSighting(o)),
      ]);

      setSpecies(updatedSpecies);
      setSightings(updatedSightings);

      const hash = computeDatasetChecksum(updatedSpecies, updatedSightings);
      const actorName = userSession?.observerName || 'Dispositivo local';
      const logEntry: SyncBatchLog = {
        batchHash: hash,
        timestamp: new Date().toLocaleString(),
        recordsSynced: pendingSyncCount,
        deviceProfile: actorName,
      };

      await idbSaveSyncLog(logEntry);
      setSyncLogs((prev) => [logEntry, ...prev]);

      await appendChangeLog(
        'Sincronizó lote',
        `Lote #${hash}`,
        `${pendingSyncCount} registros sincronizados`,
        actorName,
      );

      notifyMutation('Sincronización completada');
      setStatusMessage(`Sincronización completada (#${hash}).`);
    } catch (err) {
      console.error('Error al sincronizar:', err);
      setStorageError('Error durante la sincronización.');
    }
  }, [
    offlineAutonomousMode,
    species,
    sightings,
    pendingSyncCount,
    userSession,
    appendChangeLog,
    notifyMutation,
  ]);

  // JSON Import
  const importBackupJson = useCallback(
    async (jsonText: string): Promise<boolean> => {
      try {
        const parsed = JSON.parse(jsonText);
        if (!parsed || !Array.isArray(parsed.species) || !Array.isArray(parsed.sightings)) {
          setStatusMessage('El archivo JSON no contiene el formato esperado (species, sightings).');
          return false;
        }

        await idbClearAll();

        for (const sp of parsed.species) {
          await idbSaveSpecies(sp);
        }
        for (const si of parsed.sightings) {
          await idbSaveSighting(si);
        }
        if (Array.isArray(parsed.syncLogs)) {
          for (const l of parsed.syncLogs) {
            await idbSaveSyncLog(l);
          }
        }
        if (Array.isArray(parsed.changeLogs)) {
          for (const chg of parsed.changeLogs) {
            await idbSaveChangeLog(chg);
          }
        }

        await appendChangeLog(
          'Importó respaldo',
          `${parsed.species.length} especies · ${parsed.sightings.length} avistamientos`,
        );

        await reloadFromIdb();
        notifyMutation('Respaldo JSON importado');
        setStatusMessage(
          `Respaldo importado: ${parsed.species.length} especies, ${parsed.sightings.length} avistamientos.`,
        );
        return true;
      } catch (err) {
        console.error('Error al importar JSON:', err);
        setStatusMessage('Error al procesar el archivo JSON.');
        return false;
      }
    },
    [reloadFromIdb, appendChangeLog, notifyMutation],
  );

  const resetAllDataToZero = useCallback(async () => {
    try {
      await idbClearAll();
      setSpecies([]);
      setSightings([]);
      setSyncLogs([]);
      setChangeLogs([]);
      await appendChangeLog('Reinició base', 'Inventario restablecido a 0');
      notifyMutation('Base de datos restablecida a 0');
      setStatusMessage('Sistema reiniciado con 0 especies y 0 avistamientos.');
    } catch (err) {
      console.error('Error al vaciar datos:', err);
    }
  }, [appendChangeLog, notifyMutation]);

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
    lastSavedIso,
    pendingSyncCount,
    totalIndividuals,
    checksum,
    storageBytes,
    storageError,
    statusMessage,
    clearStatusMessage: () => setStatusMessage(null),
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
