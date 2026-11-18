import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type { Request, Response } from 'express';
import type {
  ChangeLogAction,
  ChangeLogEntry,
  SightingEntry,
  SpeciesRecord,
  SyncBatchLog,
} from './src/types/cbls.ts';

interface PersistedCblsDatabase {
  version: number;
  species: SpeciesRecord[];
  sightings: SightingEntry[];
  syncLogs: SyncBatchLog[];
  changeLogs: ChangeLogEntry[];
  updatedAt: string;
}

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'cbls-db.json');

const ADMIN_PIN = '5531';
const FIELD_ACCESS_CODES = ['1111', '2222', '3333', '4444', '5555'];

function checkAccessCode(raw: unknown): {
  valid: boolean;
  isAdmin: boolean;
  actorCodeValid: boolean;
} {
  const normalized = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (normalized === ADMIN_PIN) {
    return { valid: true, isAdmin: true, actorCodeValid: true };
  }
  if (FIELD_ACCESS_CODES.includes(normalized)) {
    return { valid: true, isAdmin: false, actorCodeValid: true };
  }
  return { valid: false, isAdmin: false, actorCodeValid: false };
}

function sanitizeSpeciesRecord(raw: SpeciesRecord, nowIso: string): SpeciesRecord {
  const clean: SpeciesRecord = {
    id: String(raw.id || `sp-${Date.now()}`),
    catalogCode: String(raw.catalogCode || 'CBLS-SP-001').trim(),
    scientificName: String(raw.scientificName || '').trim(),
    commonName: String(raw.commonName || '').trim(),
    taxon: raw.taxon,
    iucn: raw.iucn,
    medicalAlert: Boolean(raw.medicalAlert),
    curationStatus: raw.curationStatus || 'Borrador local',
    isSample: true,
    photoUrl: typeof raw.photoUrl === 'string' ? raw.photoUrl.trim() : '',
    videoUrl: typeof raw.videoUrl === 'string' ? raw.videoUrl.trim() : '',
    photoTag: raw.photoTag || 'Vista general',
    bioacoustics: {
      hasCall: Boolean(raw.bioacoustics?.hasCall),
      audioUrl:
        typeof raw.bioacoustics?.audioUrl === 'string'
          ? raw.bioacoustics.audioUrl.trim()
          : '',
      dominantFreqKhz: raw.bioacoustics?.dominantFreqKhz,
      pulsePattern: raw.bioacoustics?.pulsePattern,
      notes:
        typeof raw.bioacoustics?.notes === 'string'
          ? raw.bioacoustics.notes
          : 'No aplica (Sin canto).',
    },
    activityCycle: raw.activityCycle || 'Diurna',
    ecology: {
      chromaticsAnatomy: String(raw.ecology?.chromaticsAnatomy || ''),
      ethologyBehavior: String(raw.ecology?.ethologyBehavior || ''),
      courtshipReproduction: String(raw.ecology?.courtshipReproduction || ''),
      interIntraRelations: String(raw.ecology?.interIntraRelations || ''),
      confirmedReferences: String(raw.ecology?.confirmedReferences || ''),
    },
    featuredNote: raw.featuredNote,
    updatedAt: nowIso,
    synced: true,
    creatorName:
      typeof raw.creatorName === 'string' && raw.creatorName.trim()
        ? raw.creatorName.trim()
        : undefined,
  };
  return clean;
}

function sanitizeSightingEntry(raw: SightingEntry): SightingEntry {
  const validMethods = ['En persona', 'Cámara trampa', 'Reporte de tercero'];
  const method =
    raw.observationMethod && validMethods.includes(raw.observationMethod)
      ? raw.observationMethod
      : 'En persona';

  return {
    id: String(raw.id || `obs-${Date.now()}`),
    occurrenceId: String(
      raw.occurrenceId || `urn:catalog:CBLS:${new Date().getFullYear()}:OBS-${Date.now().toString().slice(-4)}`,
    ),
    speciesId: String(raw.speciesId),
    individualCount: Math.max(1, Number(raw.individualCount) || 1),
    observationMethod: method,
    sourceDetail:
      typeof raw.sourceDetail === 'string' && raw.sourceDetail.trim()
        ? raw.sourceDetail.trim()
        : undefined,
    observedDate: String(raw.observedDate || new Date().toISOString().slice(0, 10)),
    observedTime: String(raw.observedTime || '08:00'),
    observer: String(raw.observer || 'Observador CBLS').trim(),
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    elevationM: Math.round(Number(raw.elevationM) || 1800),
    locality: String(raw.locality || 'Corredor Biológico Los Santos').trim(),
    holdridgeZone: raw.holdridgeZone || 'bmh-MB',
    microhabitat: String(raw.microhabitat || '').trim(),
    weatherCondition: raw.weatherCondition || 'Despejado',
    photoUrl: typeof raw.photoUrl === 'string' ? raw.photoUrl.trim() : undefined,
    videoUrl: typeof raw.videoUrl === 'string' ? raw.videoUrl.trim() : undefined,
    audioUrl: typeof raw.audioUrl === 'string' ? raw.audioUrl.trim() : undefined,
    synced: true,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function createEmptyDb(): PersistedCblsDatabase {
  return {
    version: 2,
    species: [],
    sightings: [],
    syncLogs: [],
    changeLogs: [],
    updatedAt: new Date().toISOString(),
  };
}

function computeChecksum(species: SpeciesRecord[], sightings: SightingEntry[]): string {
  const payload = `${species.length}:${sightings.length}:${sightings.reduce(
    (acc, s) => acc + s.individualCount,
    0,
  )}:${species.map((sp) => sp.catalogCode).join(',')}`;
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

let dbState: PersistedCblsDatabase = createEmptyDb();
let persistChain: Promise<void> = Promise.resolve();

async function loadDatabaseFromDisk(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedCblsDatabase>;
    const nowIso = new Date().toISOString();
    const cleanSpecies = Array.isArray(parsed.species)
      ? parsed.species.map((sp) => sanitizeSpeciesRecord(sp, sp.updatedAt || nowIso))
      : [];
    const cleanSightings = Array.isArray(parsed.sightings)
      ? parsed.sightings
          .filter((si) => si.microhabitat !== 'Registro primario al catalogar la especie')
          .map((si) => sanitizeSightingEntry(si))
      : [];
    dbState = {
      version: 2,
      species: cleanSpecies,
      sightings: cleanSightings,
      syncLogs: Array.isArray(parsed.syncLogs) ? parsed.syncLogs : [],
      changeLogs: Array.isArray(parsed.changeLogs) ? parsed.changeLogs : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : nowIso,
    };
  } catch {
    dbState = createEmptyDb();
    await persistDatabaseToDisk();
  }
}

function persistDatabaseToDisk(): Promise<void> {
  const snapshot = JSON.stringify(dbState, null, 2);
  persistChain = persistChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpFile = `${DB_FILE}.tmp`;
    await fs.writeFile(tmpFile, snapshot, 'utf8');
    await fs.rename(tmpFile, DB_FILE);
  });
  return persistChain;
}

function buildChangeLogEntry(
  actorName: string,
  action: ChangeLogAction,
  target: string,
  details?: string,
): ChangeLogEntry {
  return {
    id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actorName: actorName.trim() || 'Observador CBLS',
    action,
    target,
    details,
    timestamp: new Date().toISOString(),
  };
}

function getHeaderString(req: Request, key: string): string {
  const val = req.headers[key.toLowerCase()];
  if (Array.isArray(val)) return val[0] || '';
  return typeof val === 'string' ? val : '';
}

async function startServer() {
  await loadDatabaseFromDisk();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/cbls' });

  interface AliveSocket extends WebSocket {
    isAlive?: boolean;
  }

  const broadcast = (payload: Record<string, unknown>) => {
    const serialized = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    });
  };

  wss.on('connection', (socket: AliveSocket) => {
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.send(
      JSON.stringify({
        type: 'state:init',
        state: dbState,
      }),
    );
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const sock = client as AliveSocket;
      if (sock.isAlive === false) {
        sock.terminate();
        return;
      }
      sock.isAlive = false;
      sock.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Health check
  app.get('/api/cbls/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      updatedAt: dbState.updatedAt,
      speciesCount: dbState.species.length,
      sightingsCount: dbState.sightings.length,
      connectedClients: wss.clients.size,
    });
  });

  // Authoritative state fetch
  app.get('/api/cbls/state', (_req: Request, res: Response) => {
    res.json(dbState);
  });

  // Create or update a sample species (Requires Admin PIN 5531)
  app.post('/api/cbls/species', async (req: Request, res: Response) => {
    try {
      const headerCode = getHeaderString(req, 'x-cbls-code');
      const auth = checkAccessCode(headerCode);
      if (!auth.isAdmin) {
        res.status(403).json({
          error: 'Se requiere código de administrador autorizado para agregar o editar especies.',
        });
        return;
      }

      const incoming = req.body?.species as SpeciesRecord | undefined;
      if (!incoming || !incoming.scientificName?.trim() || !incoming.commonName?.trim()) {
        res.status(400).json({ error: 'Nombre científico y nombre común son requeridos.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const actorName =
        getHeaderString(req, 'x-cbls-actor') ||
        incoming.creatorName ||
        'Administrador CBLS';

      const cleanRecord = sanitizeSpeciesRecord(
        {
          ...incoming,
          creatorName: incoming.creatorName || actorName,
        },
        nowIso,
      );

      const exists = dbState.species.some((s) => s.id === cleanRecord.id);
      dbState.species = exists
        ? dbState.species.map((s) => (s.id === cleanRecord.id ? cleanRecord : s))
        : [cleanRecord, ...dbState.species];
      dbState.updatedAt = nowIso;

      const changeLog = buildChangeLogEntry(
        actorName,
        exists ? 'Editó especie' : 'Creó especie',
        `${cleanRecord.commonName} (${cleanRecord.catalogCode})`,
        'Especie de muestra en colección',
      );
      dbState.changeLogs = [changeLog, ...dbState.changeLogs].slice(0, 500);

      await persistDatabaseToDisk();

      broadcast({
        type: 'species:upserted',
        species: cleanRecord,
        changeLog,
        updatedAt: nowIso,
      });

      res.json({ ok: true, species: cleanRecord, changeLog });
    } catch (err) {
      console.error('Error en POST /api/cbls/species:', err);
      res.status(500).json({ error: 'Error interno al guardar la especie.' });
    }
  });

  // Delete a sample species and its sightings (Requires Admin PIN 5531)
  app.delete('/api/cbls/species/:id', async (req: Request, res: Response) => {
    try {
      const headerCode = getHeaderString(req, 'x-cbls-code');
      const auth = checkAccessCode(headerCode);
      if (!auth.isAdmin) {
        res.status(403).json({
          error: 'Se requiere código de administrador autorizado para eliminar especies.',
        });
        return;
      }

      const speciesId = req.params.id;
      const targetSp = dbState.species.find((s) => s.id === speciesId);
      const targetLabel = targetSp
        ? `${targetSp.commonName} (${targetSp.catalogCode})`
        : speciesId;

      dbState.species = dbState.species.filter((s) => s.id !== speciesId);
      dbState.sightings = dbState.sightings.filter((o) => o.speciesId !== speciesId);
      const nowIso = new Date().toISOString();
      dbState.updatedAt = nowIso;

      const actorName = getHeaderString(req, 'x-cbls-actor') || 'Administrador CBLS';
      const changeLog = buildChangeLogEntry(actorName, 'Eliminó especie', targetLabel);
      dbState.changeLogs = [changeLog, ...dbState.changeLogs].slice(0, 200);

      await persistDatabaseToDisk();

      broadcast({
        type: 'species:deleted',
        speciesId,
        changeLog,
        updatedAt: nowIso,
      });

      res.json({ ok: true, speciesId, changeLog });
    } catch (err) {
      console.error('Error en DELETE /api/cbls/species/:id:', err);
      res.status(500).json({ error: 'Error interno al eliminar la especie.' });
    }
  });

  // Register a real field sighting (Requires any valid CBLS code)
  app.post('/api/cbls/sightings', async (req: Request, res: Response) => {
    try {
      const headerCode = getHeaderString(req, 'x-cbls-code');
      const auth = checkAccessCode(headerCode);
      if (!auth.valid) {
        res.status(403).json({
          error: 'Se requiere un código de acceso autorizado para registrar avistamientos.',
        });
        return;
      }

      const incoming = req.body?.sighting as SightingEntry | undefined;
      if (!incoming || !incoming.speciesId) {
        res.status(400).json({ error: 'Falta identificar la especie del avistamiento.' });
        return;
      }

      const cleanSighting = sanitizeSightingEntry(incoming);
      const nowIso = new Date().toISOString();

      const exists = dbState.sightings.some((o) => o.id === cleanSighting.id);
      dbState.sightings = exists
        ? dbState.sightings.map((o) => (o.id === cleanSighting.id ? cleanSighting : o))
        : [cleanSighting, ...dbState.sightings];
      dbState.updatedAt = nowIso;

      const sp = dbState.species.find((s) => s.id === cleanSighting.speciesId);
      const actorName = getHeaderString(req, 'x-cbls-actor') || cleanSighting.observer;
      const methodLabel = cleanSighting.observationMethod || 'En persona';
      const changeLog = buildChangeLogEntry(
        actorName,
        'Registró avistamiento',
        sp ? `${sp.commonName} (${sp.catalogCode})` : 'Especie registrada',
        `${cleanSighting.individualCount} ind. · ${methodLabel} · ${cleanSighting.locality}`,
      );
      dbState.changeLogs = [changeLog, ...dbState.changeLogs].slice(0, 500);

      await persistDatabaseToDisk();

      broadcast({
        type: 'sighting:added',
        sighting: cleanSighting,
        changeLog,
        updatedAt: nowIso,
      });

      res.json({ ok: true, sighting: cleanSighting, changeLog });
    } catch (err) {
      console.error('Error en POST /api/cbls/sightings:', err);
      res.status(500).json({ error: 'Error interno al guardar el avistamiento.' });
    }
  });

  // Flush offline queued mutations & record a sync batch
  app.post('/api/cbls/sync', async (req: Request, res: Response) => {
    try {
      const headerCode = getHeaderString(req, 'x-cbls-code');
      const auth = checkAccessCode(headerCode);
      if (!auth.valid) {
        res.status(403).json({ error: 'Código de acceso no autorizado para sincronizar.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const pendingSpecies = Array.isArray(req.body?.species)
        ? (req.body.species as SpeciesRecord[])
        : [];
      const pendingSightings = Array.isArray(req.body?.sightings)
        ? (req.body.sightings as SightingEntry[])
        : [];

      let mergedCount = 0;

      // Only admin code can upsert species during sync
      if (auth.isAdmin && pendingSpecies.length > 0) {
        for (const sp of pendingSpecies) {
          if (!sp?.id || !sp.scientificName?.trim() || !sp.commonName?.trim()) continue;
          const clean = sanitizeSpeciesRecord(sp, sp.updatedAt || nowIso);
          const idx = dbState.species.findIndex((existing) => existing.id === clean.id);
          if (idx >= 0) {
            dbState.species[idx] = clean;
          } else {
            dbState.species.unshift(clean);
          }
          mergedCount += 1;
        }
      }

      if (pendingSightings.length > 0) {
        for (const si of pendingSightings) {
          if (!si?.id || !si.speciesId) continue;
          if (si.microhabitat === 'Registro primario al catalogar la especie') continue;
          const clean = sanitizeSightingEntry(si);
          if (!dbState.sightings.some((existing) => existing.id === clean.id)) {
            dbState.sightings.unshift(clean);
            mergedCount += 1;
          }
        }
      }

      const hash = computeChecksum(dbState.species, dbState.sightings);
      const actorName = getHeaderString(req, 'x-cbls-actor') || 'Dispositivo de campo';

      const logEntry: SyncBatchLog = {
        batchHash: hash,
        timestamp: new Date().toLocaleString('es-CR'),
        recordsSynced: mergedCount,
        deviceProfile: actorName,
      };
      dbState.syncLogs = [logEntry, ...dbState.syncLogs].slice(0, 100);
      dbState.updatedAt = nowIso;

      const changeLog = buildChangeLogEntry(
        actorName,
        'Sincronizó lote',
        `Lote #${hash}`,
        `${mergedCount} registros sincronizados`,
      );
      dbState.changeLogs = [changeLog, ...dbState.changeLogs].slice(0, 200);

      await persistDatabaseToDisk();

      broadcast({
        type: 'state:replaced',
        state: dbState,
        reason: 'sync',
      });

      res.json({ ok: true, state: dbState });
    } catch (err) {
      console.error('Error en POST /api/cbls/sync:', err);
      res.status(500).json({ error: 'Error interno durante la sincronización.' });
    }
  });

  // Import JSON backup across all devices (Requires Admin PIN 5531)
  app.post('/api/cbls/import', async (req: Request, res: Response) => {
    try {
      const headerCode = getHeaderString(req, 'x-cbls-code');
      const auth = checkAccessCode(headerCode);
      if (!auth.isAdmin) {
        res.status(403).json({
          error: 'Se requiere código de administrador autorizado para importar respaldos globales.',
        });
        return;
      }

      const { species: impSp, sightings: impSi, syncLogs: impSync, changeLogs: impChg } =
        req.body || {};
      if (!Array.isArray(impSp) || !Array.isArray(impSi)) {
        res.status(400).json({ error: 'Formato JSON inválido (species, sightings requeridos).' });
        return;
      }

      const nowIso = new Date().toISOString();
      const actorName = getHeaderString(req, 'x-cbls-actor') || 'Administrador CBLS';

      const cleanSpecies = (impSp as SpeciesRecord[]).map((sp) =>
        sanitizeSpeciesRecord(sp, sp.updatedAt || nowIso),
      );
      const cleanSightings = (impSi as SightingEntry[])
        .filter((si) => si.microhabitat !== 'Registro primario al catalogar la especie')
        .map((si) => sanitizeSightingEntry(si));

      const changeLog = buildChangeLogEntry(
        actorName,
        'Importó respaldo',
        `${cleanSpecies.length} especies · ${cleanSightings.length} avistamientos`,
      );

      dbState = {
        version: 2,
        species: cleanSpecies,
        sightings: cleanSightings,
        syncLogs: Array.isArray(impSync) ? impSync : [],
        changeLogs: [changeLog, ...(Array.isArray(impChg) ? impChg : [])].slice(0, 200),
        updatedAt: nowIso,
      };

      await persistDatabaseToDisk();

      broadcast({
        type: 'state:replaced',
        state: dbState,
        reason: 'import',
      });

      res.json({ ok: true, state: dbState });
    } catch (err) {
      console.error('Error en POST /api/cbls/import:', err);
      res.status(500).json({ error: 'Error interno al importar respaldo.' });
    }
  });

  // Reset database to 0 across all devices (Requires Admin PIN 5531)
  app.post('/api/cbls/reset', async (req: Request, res: Response) => {
    try {
      const headerCode = getHeaderString(req, 'x-cbls-code');
      const auth = checkAccessCode(headerCode);
      if (!auth.isAdmin) {
        res.status(403).json({
          error: 'Se requiere código de administrador autorizado para reiniciar la base de datos.',
        });
        return;
      }

      const actorName = getHeaderString(req, 'x-cbls-actor') || 'Administrador CBLS';
      const nowIso = new Date().toISOString();
      const changeLog = buildChangeLogEntry(
        actorName,
        'Reinició base',
        'Inventario restablecido a 0',
      );

      dbState = {
        version: 2,
        species: [],
        sightings: [],
        syncLogs: [],
        changeLogs: [changeLog],
        updatedAt: nowIso,
      };

      await persistDatabaseToDisk();

      broadcast({
        type: 'state:replaced',
        state: dbState,
        reason: 'reset',
      });

      res.json({ ok: true, state: dbState });
    } catch (err) {
      console.error('Error en POST /api/cbls/reset:', err);
      res.status(500).json({ error: 'Error interno al reiniciar la base.' });
    }
  });

  // Vite middleware in dev vs static dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Bitácora CBLS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Bitácora CBLS server:', err);
  process.exit(1);
});
