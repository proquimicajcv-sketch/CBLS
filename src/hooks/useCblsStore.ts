import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  idbDeleteSpecies,
  idbGetAllChangeLogs,
  idbGetAllSightings,
  idbGetAllSpecies,
  idbGetAllSyncLogs,
  idbReplaceAll,
  idbSaveChangeLog,
  idbSaveSighting,
  idbSaveSpecies,
} from '../utils/indexedDb';

const BROADCAST_CHANNEL_NAME = 'bitacora_cbls_sync_channel';
const SESSION_STORAGE_KEY = 'cbls_active_observer_session';
const OFFLINE_OUTBOX_KEY = 'cbls_offline_outbox_v2';

interface ServerDatasetState {
  version: number;
  species: SpeciesRecord[];
  sightings: SightingEntry[];
  syncLogs: SyncBatchLog[];
  changeLogs: ChangeLogEntry[];
  updatedAt: string;
}

interface OfflineOutbox {
  speciesUpserts: SpeciesRecord[];
  speciesDeletes: string[];
  sightingAdds: SightingEntry[];
}

function readOfflineOutbox(): OfflineOutbox {
  try {
    const raw = localStorage.getItem(OFFLINE_OUTBOX_KEY);
    if (!raw) return { speciesUpserts: [], speciesDeletes: [], sightingAdds: [] };
    const parsed = JSON.parse(raw) as Partial<OfflineOutbox>;
    return {
      speciesUpserts: Array.isArray(parsed.speciesUpserts) ? parsed.speciesUpserts : [],
      speciesDeletes: Array.isArray(parsed.speciesDeletes) ? parsed.speciesDeletes : [],
      sightingAdds: Array.isArray(parsed.sightingAdds) ? parsed.sightingAdds : [],
    };
  } catch {
    return { speciesUpserts: [], speciesDeletes: [], sightingAdds: [] };
  }
}

function writeOfflineOutbox(outbox: OfflineOutbox) {
  try {
    localStorage.setItem(OFFLINE_OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    // ignore storage quota errors
  }
}

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/cbls`;
}

export function useCblsStore() {
  const [species, setSpecies] = useState<SpeciesRecord[]>([]);
  const [sightings, setSightings] = useState<SightingEntry[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncBatchLog[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);
  const [offlineAutonomousMode, setOfflineAutonomousMode] = useState<boolean>(false);
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [wsConnected, setWsConnected] = useState<boolean>(false);
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

  const offlineAutonomousRef = useRef(offlineAutonomousMode);
  offlineAutonomousRef.current = offlineAutonomousMode;

  const browserOnlineRef = useRef(browserOnline);
  browserOnlineRef.current = browserOnline;

  // Apply authoritative server snapshot to React state + IndexedDB
  const applyFullServerState = useCallback(async (serverState: ServerDatasetState) => {
    const cleanSightings = (serverState.sightings || []).filter(
      (s) => s.microhabitat !== 'Registro primario al catalogar la especie',
    );
    const cleanSpecies = (serverState.species || []).map((sp) => ({
      ...sp,
      isSample: true,
      latitude: undefined,
      longitude: undefined,
      elevationM: undefined,
      locality: undefined,
      holdridgeZone: undefined,
      synced: true,
    }));

    setSpecies(cleanSpecies);
    setSightings(cleanSightings);
    setSyncLogs(serverState.syncLogs || []);
    setChangeLogs(serverState.changeLogs || []);
    setLastSavedIso(serverState.updatedAt || new Date().toISOString());

    try {
      await idbReplaceAll({
        species: cleanSpecies,
        sightings: cleanSightings,
        syncLogs: serverState.syncLogs || [],
        changeLogs: serverState.changeLogs || [],
      });
    } catch (err) {
      console.error('Error al actualizar IndexedDB:', err);
    }
  }, []);

  // Load initial local IndexedDB cache immediately while server state loads
  const reloadFromIdb = useCallback(async () => {
    try {
      const [spList, siList, logs, history] = await Promise.all([
        idbGetAllSpecies(),
        idbGetAllSightings(),
        idbGetAllSyncLogs(),
        idbGetAllChangeLogs(),
      ]);
      // Strip legacy auto-sightings from older browser caches
      const cleanSi = siList.filter(
        (s) => s.microhabitat !== 'Registro primario al catalogar la especie',
      );
      setSpecies(spList);
      setSightings(cleanSi);
      setSyncLogs(logs);
      setChangeLogs(history);
    } catch (err) {
      console.error('Error al cargar datos desde IndexedDB:', err);
      setStorageError('Error al leer de la base de datos local IndexedDB.');
    }
  }, []);

  // Flush any genuine offline outbox changes to the server when back online
  const flushOfflineOutbox = useCallback(async () => {
    if (offlineAutonomousRef.current || !browserOnlineRef.current) return false;
    const session = userSessionRef.current;
    if (!session) return false;

    const outbox = readOfflineOutbox();
    if (
      outbox.speciesUpserts.length === 0 &&
      outbox.speciesDeletes.length === 0 &&
      outbox.sightingAdds.length === 0
    ) {
      return false;
    }

    try {
      // Process deletions first if admin
      if (session.isAdmin) {
        for (const delId of outbox.speciesDeletes) {
          await fetch(`/api/cbls/species/${encodeURIComponent(delId)}`, {
            method: 'DELETE',
            headers: {
              'x-cbls-code': session.observerCode,
              'x-cbls-actor': session.observerName,
            },
          });
        }
      }

      const res = await fetch('/api/cbls/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cbls-code': session.observerCode,
          'x-cbls-actor': session.observerName,
        },
        body: JSON.stringify({
          species: outbox.speciesUpserts,
          sightings: outbox.sightingAdds,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; state?: ServerDatasetState };
        writeOfflineOutbox({ speciesUpserts: [], speciesDeletes: [], sightingAdds: [] });
        if (data.state) {
          await applyFullServerState(data.state);
        }
        return true;
      }
    } catch {
      // keep outbox for next reconnect
    }
    return false;
  }, [applyFullServerState]);

  // Fetch authoritative state over HTTP
  const fetchServerState = useCallback(async () => {
    if (offlineAutonomousRef.current) return;
    try {
      await flushOfflineOutbox();
      const res = await fetch('/api/cbls/state', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as ServerDatasetState;
      await applyFullServerState(data);
    } catch {
      // Offline fallback remains active in IndexedDB
    }
  }, [applyFullServerState, flushOfflineOutbox]);

  // BroadcastChannel for instant same-browser-profile tab sync (fallback when offline)
  const notifySameBrowserTabs = useCallback((actionDesc: string) => {
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
    } catch {
      // ignore
    }
  }, []);

  // Real-time WebSocket + HTTP state recovery + online/offline listeners
  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;

    reloadFromIdb().then(() => {
      if (active) fetchServerState();
    });

    const connectWebSocket = () => {
      if (!active || offlineAutonomousRef.current || !browserOnlineRef.current) {
        setWsConnected(false);
        return;
      }

      try {
        ws = new WebSocket(getWsUrl());

        ws.onopen = () => {
          if (!active) return;
          reconnectAttempt = 0;
          setWsConnected(true);
          flushOfflineOutbox();
        };

        ws.onmessage = async (event) => {
          if (!active) return;
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'state:init' && msg.state) {
              await applyFullServerState(msg.state as ServerDatasetState);
              return;
            }

            if (msg.type === 'state:replaced' && msg.state) {
              await applyFullServerState(msg.state as ServerDatasetState);
              setStatusMessage(
                msg.reason === 'reset'
                  ? 'Base de datos reiniciada a 0 en todos los dispositivos.'
                  : 'Inventario sincronizado en tiempo real en todos los dispositivos.',
              );
              return;
            }

            if (msg.type === 'species:upserted' && msg.species) {
              const incomingSp = {
                ...(msg.species as SpeciesRecord),
                isSample: true,
                synced: true,
              };
              setSpecies((prev) => {
                const exists = prev.some((s) => s.id === incomingSp.id);
                return exists
                  ? prev.map((s) => (s.id === incomingSp.id ? incomingSp : s))
                  : [incomingSp, ...prev];
              });
              await idbSaveSpecies(incomingSp);

              if (msg.changeLog) {
                const log = msg.changeLog as ChangeLogEntry;
                setChangeLogs((prev) =>
                  prev.some((c) => c.id === log.id) ? prev : [log, ...prev],
                );
                await idbSaveChangeLog(log);
              }
              setLastSavedIso(msg.updatedAt || new Date().toISOString());
              setStatusMessage(
                `Actualización en vivo: especie "${incomingSp.commonName}" disponible en todos los dispositivos.`,
              );
              return;
            }

            if (msg.type === 'species:deleted' && msg.speciesId) {
              const deletedId = String(msg.speciesId);
              setSpecies((prev) => prev.filter((s) => s.id !== deletedId));
              setSightings((prev) => prev.filter((o) => o.speciesId !== deletedId));
              await idbDeleteSpecies(deletedId);

              if (msg.changeLog) {
                const log = msg.changeLog as ChangeLogEntry;
                setChangeLogs((prev) =>
                  prev.some((c) => c.id === log.id) ? prev : [log, ...prev],
                );
                await idbSaveChangeLog(log);
              }
              setLastSavedIso(msg.updatedAt || new Date().toISOString());
              setStatusMessage('Actualización en vivo: ficha eliminada del inventario.');
              return;
            }

            if (msg.type === 'sighting:added' && msg.sighting) {
              const incomingSi = {
                ...(msg.sighting as SightingEntry),
                synced: true,
              };
              setSightings((prev) =>
                prev.some((o) => o.id === incomingSi.id)
                  ? prev.map((o) => (o.id === incomingSi.id ? incomingSi : o))
                  : [incomingSi, ...prev],
              );
              await idbSaveSighting(incomingSi);

              if (msg.changeLog) {
                const log = msg.changeLog as ChangeLogEntry;
                setChangeLogs((prev) =>
                  prev.some((c) => c.id === log.id) ? prev : [log, ...prev],
                );
                await idbSaveChangeLog(log);
              }
              setLastSavedIso(msg.updatedAt || new Date().toISOString());
              setStatusMessage(
                `Avistamiento en vivo registrado por ${incomingSi.observer}.`,
              );
            }
          } catch {
            // ignore malformed frame
          }
        };

        ws.onclose = () => {
          if (!active) return;
          setWsConnected(false);
          if (!offlineAutonomousRef.current && browserOnlineRef.current) {
            const delayMs = Math.min(10000, 1000 * 2 ** Math.min(reconnectAttempt, 3));
            reconnectAttempt += 1;
            reconnectTimer = window.setTimeout(connectWebSocket, delayMs);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWebSocket();

    const onOnline = () => {
      setBrowserOnline(true);
      browserOnlineRef.current = true;
      fetchServerState();
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connectWebSocket();
      }
    };

    const onOffline = () => {
      setBrowserOnline(false);
      browserOnlineRef.current = false;
      setWsConnected(false);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && browserOnlineRef.current) {
        fetchServerState();
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);

    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === 'CBLS_DATA_MUTATED') {
          reloadFromIdb();
        }
      };
    }

    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
      if (channel) channel.close();
    };
  }, [
    offlineAutonomousMode,
    reloadFromIdb,
    fetchServerState,
    flushOfflineOutbox,
    applyFullServerState,
  ]);

  const appendLocalChangeLog = useCallback(
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
    const outbox = readOfflineOutbox();
    const outboxCount =
      outbox.speciesUpserts.length + outbox.speciesDeletes.length + outbox.sightingAdds.length;
    const unsyncedLocal =
      species.filter((s) => !s.synced).length + sightings.filter((o) => !o.synced).length;
    return Math.max(outboxCount, unsyncedLocal);
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
          : 'Enlace en tiempo real reactivado para sincronizar con todos los dispositivos.',
      );
      return next;
    });
  }, []);

  // Upsert sample species (Requires Admin code; publishes immediately to all devices via server + WS)
  const upsertSpecies = useCallback(
    async (record: SpeciesRecord, overrideAdminCode?: string): Promise<boolean> => {
      const authCode = overrideAdminCode || userSession?.observerCode || '';
      const authCheck = validateAccessCode(authCode);
      if (!authCheck.isAdmin) {
        setStorageError('Se requiere clave de administrador para agregar o editar especies.');
        return false;
      }

      const exists = species.some((s) => s.id === record.id);
      const { creatorCode: _omitCreatorCode, ...restRecord } = record;
      void _omitCreatorCode;

      const updatedRecord: SpeciesRecord = {
        ...restRecord,
        isSample: true,
        latitude: undefined,
        longitude: undefined,
        elevationM: undefined,
        locality: undefined,
        holdridgeZone: undefined,
        creatorName: restRecord.creatorName || userSession?.observerName || 'Administrador',
        updatedAt: new Date().toISOString(),
        synced: !effectiveOffline,
      };

      // Persist optimistically to IndexedDB & React state
      try {
        await idbSaveSpecies(updatedRecord);
        setSpecies((prev) =>
          exists
            ? prev.map((s) => (s.id === updatedRecord.id ? updatedRecord : s))
            : [updatedRecord, ...prev],
        );
        setLastSavedIso(updatedRecord.updatedAt);
        setStorageError(null);
      } catch (err) {
        console.error('Error al guardar en IndexedDB:', err);
        setStorageError('No se pudo escribir en IndexedDB.');
        return false;
      }

      if (!effectiveOffline) {
        try {
          const res = await fetch('/api/cbls/species', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cbls-code': authCheck.normalized,
              'x-cbls-actor': userSession?.observerName || updatedRecord.creatorName || 'Administrador',
            },
            body: JSON.stringify({ species: updatedRecord }),
          });

          if (res.ok) {
            const data = (await res.json()) as {
              ok: boolean;
              species: SpeciesRecord;
              changeLog?: ChangeLogEntry;
            };
            const syncedRecord = { ...data.species, isSample: true, synced: true };
            await idbSaveSpecies(syncedRecord);
            setSpecies((prev) =>
              prev.map((s) => (s.id === syncedRecord.id ? syncedRecord : s)),
            );
            if (data.changeLog) {
              await idbSaveChangeLog(data.changeLog);
              setChangeLogs((prev) =>
                prev.some((c) => c.id === data.changeLog!.id)
                  ? prev
                  : [data.changeLog!, ...prev],
              );
            }
            notifySameBrowserTabs(`Especie guardada: ${syncedRecord.commonName}`);
            setStatusMessage(
              `Especie de muestra publicada en tiempo real en todos los dispositivos: ${syncedRecord.commonName}`,
            );
            return true;
          }

          if (res.status === 403) {
            await reloadFromIdb();
            setStorageError('Código de administrador rechazado por el servidor.');
            return false;
          }
        } catch {
          // Network unreachable -> fall through to offline outbox queue
        }
      }

      // Queue in offline outbox
      const outbox = readOfflineOutbox();
      outbox.speciesUpserts = [
        updatedRecord,
        ...outbox.speciesUpserts.filter((s) => s.id !== updatedRecord.id),
      ];
      writeOfflineOutbox(outbox);
      await appendLocalChangeLog(
        exists ? 'Editó especie' : 'Creó especie',
        `${updatedRecord.commonName} (${updatedRecord.catalogCode})`,
        'Especie de muestra (pendiente de enlace)',
      );
      notifySameBrowserTabs(`Especie guardada offline: ${updatedRecord.commonName}`);
      setStatusMessage(
        `Especie de muestra guardada offline: ${updatedRecord.commonName}. Se sincronizará automáticamente al recuperar conexión.`,
      );
      return true;
    },
    [species, userSession, effectiveOffline, appendLocalChangeLog, notifySameBrowserTabs, reloadFromIdb],
  );

  // Delete Species (Requires Admin code; removes across all connected devices)
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
        await idbDeleteSpecies(speciesId);
        setSpecies((prev) => prev.filter((s) => s.id !== speciesId));
        setSightings((prev) => prev.filter((o) => o.speciesId !== speciesId));
        setLastSavedIso(new Date().toISOString());
      } catch (err) {
        console.error('Error al eliminar de IndexedDB:', err);
        setStorageError('No se pudo eliminar de IndexedDB.');
        return;
      }

      if (!effectiveOffline) {
        try {
          const res = await fetch(`/api/cbls/species/${encodeURIComponent(speciesId)}`, {
            method: 'DELETE',
            headers: {
              'x-cbls-code': authCheck.normalized,
              'x-cbls-actor': userSession?.observerName || 'Administrador',
            },
          });
          if (res.ok) {
            const data = (await res.json()) as { changeLog?: ChangeLogEntry };
            if (data.changeLog) {
              await idbSaveChangeLog(data.changeLog);
              setChangeLogs((prev) =>
                prev.some((c) => c.id === data.changeLog!.id)
                  ? prev
                  : [data.changeLog!, ...prev],
              );
            }
            notifySameBrowserTabs(`Especie eliminada: ${targetLabel}`);
            setStatusMessage('Especie eliminada en tiempo real en todos los dispositivos.');
            return;
          }
        } catch {
          // fall through to offline outbox
        }
      }

      const outbox = readOfflineOutbox();
      outbox.speciesUpserts = outbox.speciesUpserts.filter((s) => s.id !== speciesId);
      if (!outbox.speciesDeletes.includes(speciesId)) {
        outbox.speciesDeletes.push(speciesId);
      }
      writeOfflineOutbox(outbox);
      await appendLocalChangeLog('Eliminó especie', targetLabel);
      notifySameBrowserTabs(`Especie eliminada offline: ${targetLabel}`);
      setStatusMessage('Especie eliminada localmente (pendiente de sincronización).');
    },
    [species, userSession, effectiveOffline, appendLocalChangeLog, notifySameBrowserTabs],
  );

  // Add Sighting (Requires valid field or admin code; broadcasts immediately to all devices)
  const addSighting = useCallback(
    async (entry: Omit<SightingEntry, 'id' | 'occurrenceId' | 'synced' | 'createdAt'>) => {
      const now = new Date();
      const year = entry.observedDate.slice(0, 4) || String(now.getFullYear());
      const { observerCode: _omitObserverCode, ...cleanEntry } = entry;
      void _omitObserverCode;

      const newSighting: SightingEntry = {
        ...cleanEntry,
        id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        occurrenceId: `urn:catalog:CBLS:${year}:OBS-${Date.now().toString().slice(-4)}`,
        synced: !effectiveOffline,
        createdAt: now.toISOString(),
      };

      const sp = species.find((s) => s.id === cleanEntry.speciesId);

      try {
        await idbSaveSighting(newSighting);
        setSightings((prev) => [newSighting, ...prev]);
        setLastSavedIso(now.toISOString());
      } catch (err) {
        console.error('Error al guardar avistamiento en IndexedDB:', err);
        setStorageError('Error al guardar en IndexedDB.');
        return;
      }

      if (!effectiveOffline && userSession?.observerCode) {
        try {
          const res = await fetch('/api/cbls/sightings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cbls-code': userSession.observerCode,
              'x-cbls-actor': cleanEntry.observer || userSession.observerName,
            },
            body: JSON.stringify({ sighting: newSighting }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              sighting: SightingEntry;
              changeLog?: ChangeLogEntry;
            };
            const syncedSi = { ...data.sighting, synced: true };
            await idbSaveSighting(syncedSi);
            setSightings((prev) =>
              prev.map((o) => (o.id === syncedSi.id ? syncedSi : o)),
            );
            if (data.changeLog) {
              await idbSaveChangeLog(data.changeLog);
              setChangeLogs((prev) =>
                prev.some((c) => c.id === data.changeLog!.id)
                  ? prev
                  : [data.changeLog!, ...prev],
              );
            }
            notifySameBrowserTabs(`Nuevo avistamiento por ${cleanEntry.observer}`);
            setStatusMessage(
              `Avistamiento publicado en tiempo real por ${cleanEntry.observer}: ${cleanEntry.individualCount} ind.`,
            );
            return;
          }
        } catch {
          // fall through to offline outbox
        }
      }

      const outbox = readOfflineOutbox();
      outbox.sightingAdds.unshift(newSighting);
      writeOfflineOutbox(outbox);
      await appendLocalChangeLog(
        'Registró avistamiento',
        sp ? `${sp.commonName} (${sp.catalogCode})` : 'Especie registrada',
        `${cleanEntry.individualCount} ind. · ${cleanEntry.locality}`,
        cleanEntry.observer,
      );
      notifySameBrowserTabs(`Avistamiento offline por ${cleanEntry.observer}`);
      setStatusMessage(
        `Avistamiento guardado en dispositivo por ${cleanEntry.observer}: ${cleanEntry.individualCount} ind.`,
      );
    },
    [species, userSession, effectiveOffline, appendLocalChangeLog, notifySameBrowserTabs],
  );

  // Manual Sync trigger
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
      const outbox = readOfflineOutbox();
      const pendingSpecies = [
        ...outbox.speciesUpserts,
        ...species.filter((s) => !s.synced),
      ];
      const pendingSightings = [
        ...outbox.sightingAdds,
        ...sightings.filter((o) => !o.synced),
      ];

      const res = await fetch('/api/cbls/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cbls-code': userSession.observerCode,
          'x-cbls-actor': userSession.observerName,
        },
        body: JSON.stringify({
          species: pendingSpecies,
          sightings: pendingSightings,
        }),
      });

      if (!res.ok) {
        setStatusMessage('No se pudo completar la sincronización con el servidor.');
        return;
      }

      const data = (await res.json()) as { state?: ServerDatasetState };
      writeOfflineOutbox({ speciesUpserts: [], speciesDeletes: [], sightingAdds: [] });
      if (data.state) {
        await applyFullServerState(data.state);
      }
      notifySameBrowserTabs('Sincronización completada');
      setStatusMessage('Todos los dispositivos quedaron sincronizados con el servidor.');
    } catch (err) {
      console.error('Error al sincronizar:', err);
      setStorageError('No se pudo conectar con el servidor para sincronizar.');
    }
  }, [
    offlineAutonomousMode,
    userSession,
    species,
    sightings,
    applyFullServerState,
    notifySameBrowserTabs,
  ]);

  // JSON Import (syncs across all connected devices via server)
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

        if (!effectiveOffline && authCheck.isAdmin) {
          const res = await fetch('/api/cbls/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cbls-code': authCheck.normalized,
              'x-cbls-actor': userSession?.observerName || 'Administrador',
            },
            body: JSON.stringify(parsed),
          });
          if (res.ok) {
            const data = (await res.json()) as { state?: ServerDatasetState };
            writeOfflineOutbox({ speciesUpserts: [], speciesDeletes: [], sightingAdds: [] });
            if (data.state) {
              await applyFullServerState(data.state);
            }
            setStatusMessage(
              `Respaldo importado y propagado en tiempo real: ${parsed.species.length} especies.`,
            );
            return true;
          }
        }

        if (!authCheck.isAdmin) {
          setStatusMessage('Solo un administrador autorizado puede importar respaldos.');
          return false;
        }

        await idbReplaceAll({
          species: parsed.species,
          sightings: parsed.sightings,
          syncLogs: Array.isArray(parsed.syncLogs) ? parsed.syncLogs : [],
          changeLogs: Array.isArray(parsed.changeLogs) ? parsed.changeLogs : [],
        });
        await appendLocalChangeLog(
          'Importó respaldo',
          `${parsed.species.length} especies · ${parsed.sightings.length} avistamientos`,
        );
        await reloadFromIdb();
        notifySameBrowserTabs('Respaldo JSON importado');
        setStatusMessage(
          `Respaldo importado localmente: ${parsed.species.length} especies.`,
        );
        return true;
      } catch (err) {
        console.error('Error al importar JSON:', err);
        setStatusMessage('Error al procesar el archivo JSON.');
        return false;
      }
    },
    [
      userSession,
      effectiveOffline,
      applyFullServerState,
      appendLocalChangeLog,
      reloadFromIdb,
      notifySameBrowserTabs,
    ],
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
        writeOfflineOutbox({ speciesUpserts: [], speciesDeletes: [], sightingAdds: [] });
        if (!effectiveOffline) {
          const res = await fetch('/api/cbls/reset', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cbls-code': authCheck.normalized,
              'x-cbls-actor': userSession?.observerName || 'Administrador',
            },
          });
          if (res.ok) {
            const data = (await res.json()) as { state?: ServerDatasetState };
            if (data.state) {
              await applyFullServerState(data.state);
            }
            setStatusMessage('Sistema reiniciado a 0 en todos los dispositivos conectados.');
            return;
          }
        }

        await idbReplaceAll({ species: [], sightings: [], syncLogs: [], changeLogs: [] });
        setSpecies([]);
        setSightings([]);
        setSyncLogs([]);
        setChangeLogs([]);
        await appendLocalChangeLog('Reinició base', 'Inventario restablecido a 0');
        notifySameBrowserTabs('Base de datos restablecida a 0');
        setStatusMessage('Sistema reiniciado con 0 especies y 0 avistamientos.');
      } catch (err) {
        console.error('Error al vaciar datos:', err);
      }
    },
    [
      userSession,
      effectiveOffline,
      applyFullServerState,
      appendLocalChangeLog,
      notifySameBrowserTabs,
    ],
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
