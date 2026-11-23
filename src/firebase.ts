import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  ChangeLogEntry,
  LocalMediaCapture,
  SightingEntry,
  SpeciesRecord,
  SyncBatchLog,
} from './types/cbls';

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId,
);

export const auth = getAuth(app);
export const storage = getStorage(app);
storage.maxUploadRetryTime = 5000;
storage.maxOperationRetryTime = 5000;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function sanitizeFirestoreId(raw: string, fallbackPrefix: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!cleaned) {
    return `${fallbackPrefix}-${Date.now()}`;
  }
  return cleaned.slice(0, 128);
}

export function toFirestoreSpeciesPayload(
  raw: SpeciesRecord,
  nowIso: string,
): SpeciesRecord {
  const id = sanitizeFirestoreId(raw.id, 'sp');
  const rawBioNotes =
    typeof raw.bioacoustics?.notes === 'string' ? raw.bioacoustics.notes.trim() : '';
  const bio: SpeciesRecord['bioacoustics'] = {
    hasCall: Boolean(raw.bioacoustics?.hasCall),
    notes: rawBioNotes.slice(0, 2000),
  };

  if (typeof raw.bioacoustics?.audioUrl === 'string' && raw.bioacoustics.audioUrl.trim()) {
    bio.audioUrl = raw.bioacoustics.audioUrl.trim().slice(0, 2000);
  }
  if (
    typeof raw.bioacoustics?.dominantFreqKhz === 'number' &&
    Number.isFinite(raw.bioacoustics.dominantFreqKhz)
  ) {
    bio.dominantFreqKhz = Math.max(0, Math.min(50, raw.bioacoustics.dominantFreqKhz));
  }
  if (
    raw.bioacoustics?.pulsePattern &&
    ['flute', 'pulse', 'whistle', 'chirp'].includes(raw.bioacoustics.pulsePattern)
  ) {
    bio.pulsePattern = raw.bioacoustics.pulsePattern;
  }

  const payload: SpeciesRecord = {
    id,
    catalogCode: String(raw.catalogCode || 'CBLS-SP-001').trim().slice(0, 64) || 'CBLS-SP-001',
    scientificName: String(raw.scientificName || '').trim().slice(0, 200),
    commonName: String(raw.commonName || '').trim().slice(0, 200),
    taxon: raw.taxon,
    iucn: raw.iucn,
    medicalAlert: Boolean(raw.medicalAlert),
    curationStatus: raw.curationStatus || 'Borrador local',
    isSample: true,
    photoUrl: typeof raw.photoUrl === 'string' ? raw.photoUrl.trim().slice(0, 2000) : '',
    photoTag: raw.photoTag || 'Vista general',
    bioacoustics: bio,
    activityCycle:
      raw.activityCycle &&
      [
        'Diurna',
        'Nocturna',
        'Crepuscular',
        'Crepuscular/Nocturna',
        'Diurno/nocturno',
        'Permanente (Flora)',
        'Permanente (Fungi/Liquen)',
        'Floración',
        'Fructificación',
        'Vegetativa',
        'Con esporofitos',
        'Floración y brotes',
      ].includes(raw.activityCycle)
        ? raw.activityCycle
        : raw.taxon === 'Plantas'
          ? 'Permanente (Flora)'
          : raw.taxon === 'Hongos'
            ? 'Fructificación'
            : 'Diurna',
    ecology: {
      chromaticsAnatomy: String(raw.ecology?.chromaticsAnatomy || '').slice(0, 8000),
      ethologyBehavior: String(raw.ecology?.ethologyBehavior || '').slice(0, 8000),
      courtshipReproduction: String(raw.ecology?.courtshipReproduction || '').slice(0, 8000),
      interIntraRelations: String(raw.ecology?.interIntraRelations || '').slice(0, 8000),
      confirmedReferences: String(raw.ecology?.confirmedReferences || '').slice(0, 8000),
    },
    updatedAt: (raw.updatedAt || nowIso).slice(0, 64),
    synced: true,
  };

  if (typeof raw.botanicalGroup === 'string' && raw.botanicalGroup.trim()) {
    payload.botanicalGroup = raw.botanicalGroup.trim().slice(0, 160);
  }
  if (typeof raw.macroPhotoUrl === 'string' && raw.macroPhotoUrl.trim()) {
    payload.macroPhotoUrl = raw.macroPhotoUrl.trim().slice(0, 2000);
  }
  if (typeof raw.initialAbundanceNote === 'string' && raw.initialAbundanceNote.trim()) {
    payload.initialAbundanceNote = raw.initialAbundanceNote.trim().slice(0, 200);
  }
  if (typeof raw.videoUrl === 'string' && raw.videoUrl.trim()) {
    payload.videoUrl = raw.videoUrl.trim().slice(0, 2000);
  }
  if (typeof raw.featuredNote === 'string' && raw.featuredNote.trim()) {
    payload.featuredNote = raw.featuredNote.trim().slice(0, 500);
  }
  if (typeof raw.creatorName === 'string' && raw.creatorName.trim()) {
    payload.creatorName = raw.creatorName.trim().slice(0, 120);
  }

  return payload;
}

export function toFirestoreSightingPayload(raw: SightingEntry): SightingEntry {
  const id = sanitizeFirestoreId(raw.id, 'obs');
  const payload: SightingEntry = {
    id,
    occurrenceId: String(
      raw.occurrenceId || `urn:catalog:CBLS:${new Date().getFullYear()}:OBS-${Date.now().toString().slice(-4)}`,
    ).slice(0, 160),
    speciesId: sanitizeFirestoreId(raw.speciesId, 'sp'),
    individualCount: Math.max(1, Math.min(5000, Math.round(Number(raw.individualCount) || 1))),
    observedDate: String(raw.observedDate || new Date().toISOString().slice(0, 10)).slice(0, 32),
    observedTime: String(raw.observedTime || '08:00').slice(0, 16),
    observer: String(raw.observer || 'Observador CBLS').trim().slice(0, 120) || 'Observador CBLS',
    latitude: Math.max(-90, Math.min(90, Number(raw.latitude) || 9.5525)),
    longitude: Math.max(-180, Math.min(180, Number(raw.longitude) || -83.8065)),
    elevationM: Math.max(0, Math.min(6000, Math.round(Number(raw.elevationM) || 1800))),
    locality:
      String(raw.locality || 'Sector Corredor Biológico Los Santos').trim().slice(0, 240) ||
      'Sector Corredor Biológico Los Santos',
    holdridgeZone: raw.holdridgeZone || 'bmh-MB',
    microhabitat: String(raw.microhabitat || '').trim().slice(0, 400),
    weatherCondition: raw.weatherCondition || 'Despejado',
    synced: true,
    createdAt: String(raw.createdAt || new Date().toISOString()).slice(0, 64),
  };

  if (
    raw.observationMethod &&
    ['En persona', 'Cámara trampa', 'Reporte de tercero'].includes(raw.observationMethod)
  ) {
    payload.observationMethod = raw.observationMethod;
  }
  if (typeof raw.sourceDetail === 'string' && raw.sourceDetail.trim()) {
    payload.sourceDetail = raw.sourceDetail.trim().slice(0, 300);
  }
  if (typeof raw.notes === 'string' && raw.notes.trim()) {
    payload.notes = raw.notes.trim().slice(0, 2000);
  }
  if (typeof raw.photoUrl === 'string' && raw.photoUrl.trim()) {
    payload.photoUrl = raw.photoUrl.trim().slice(0, 2000);
  }
  if (typeof raw.videoUrl === 'string' && raw.videoUrl.trim()) {
    payload.videoUrl = raw.videoUrl.trim().slice(0, 2000);
  }
  if (typeof raw.audioUrl === 'string' && raw.audioUrl.trim()) {
    payload.audioUrl = raw.audioUrl.trim().slice(0, 2000);
  }
  if (typeof raw.localPhotoId === 'string' && raw.localPhotoId.trim()) {
    payload.localPhotoId = sanitizeFirestoreId(raw.localPhotoId, 'img');
  }
  if (typeof raw.localVideoId === 'string' && raw.localVideoId.trim()) {
    payload.localVideoId = sanitizeFirestoreId(raw.localVideoId, 'vid');
  }
  if (typeof raw.localMediaSummary === 'string' && raw.localMediaSummary.trim()) {
    payload.localMediaSummary = raw.localMediaSummary.trim().slice(0, 300);
  }

  return payload;
}

export async function uploadSightingMediaCapture(
  capture: LocalMediaCapture,
): Promise<string | null> {
  if (capture.uploadedUrl) return capture.uploadedUrl;
  try {
    const safeName = capture.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageRef = ref(
      storage,
      `cbls-sightings/${capture.sightingId}/${capture.id}_${safeName}`,
    );
    const snapshot = await uploadBytes(storageRef, capture.blob, {
      contentType: capture.mimeType || 'application/octet-stream',
    });
    const url = await getDownloadURL(snapshot.ref);
    return url;
  } catch {
    // Firebase Storage bucket may not allow unauthenticated uploads;
    // keep binary media safely stored in IndexedDB without blocking Firestore text/GPS sync.
    return null;
  }
}

export function toFirestoreChangeLogPayload(raw: ChangeLogEntry): ChangeLogEntry {
  const payload: ChangeLogEntry = {
    id: sanitizeFirestoreId(raw.id, 'chg'),
    actorName: String(raw.actorName || 'Observador CBLS').trim().slice(0, 120) || 'Observador CBLS',
    action: raw.action,
    target: String(raw.target || 'Registro').trim().slice(0, 240) || 'Registro',
    timestamp: String(raw.timestamp || new Date().toISOString()).slice(0, 64),
  };
  if (typeof raw.details === 'string' && raw.details.trim()) {
    payload.details = raw.details.trim().slice(0, 400);
  }
  return payload;
}

export function toFirestoreSyncLogPayload(raw: SyncBatchLog): SyncBatchLog {
  return {
    batchHash: sanitizeFirestoreId(raw.batchHash, 'batch').slice(0, 64),
    timestamp: String(raw.timestamp || new Date().toISOString()).slice(0, 64),
    recordsSynced: Math.max(0, Math.min(50000, Math.round(Number(raw.recordsSynced) || 0))),
    deviceProfile:
      String(raw.deviceProfile || 'Dispositivo CBLS').trim().slice(0, 120) || 'Dispositivo CBLS',
  };
}
