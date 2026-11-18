export type TaxonGroup =
  | 'Aves'
  | 'Anfibios'
  | 'Reptiles'
  | 'Mamíferos'
  | 'Plantas'
  | 'Insectos';

export type HoldridgeZoneId =
  | 'bmh-P'
  | 'bmh-MB'
  | 'bp-MB'
  | 'bp-M'
  | 'pp-SA';

export type IucnCategory = 'LC' | 'NT' | 'VU' | 'EN' | 'CR';

export type CurationStatus = 'Validado' | 'En revisión' | 'Borrador local';

export type PhotoTag =
  | 'Vista general'
  | 'Ojo'
  | 'Flanco'
  | 'Dorso'
  | 'Puesta'
  | 'Hembra'
  | 'Macho'
  | 'Floración / Fruto';

export interface HoldridgeZoneInfo {
  id: HoldridgeZoneId;
  name: string;
  shortName: string;
  minElevation: number;
  maxElevation: number;
  meanTempC: string;
  annualRainMm: string;
  representativeSector: string;
}

export interface BioacousticData {
  hasCall: boolean;
  audioUrl?: string; // Media URL for audio recording/call
  dominantFreqKhz?: number;
  pulsePattern?: 'flute' | 'pulse' | 'whistle' | 'chirp';
  notes: string;
}

export interface EcologyFields {
  chromaticsAnatomy: string;
  ethologyBehavior: string;
  courtshipReproduction: string;
  interIntraRelations: string;
  confirmedReferences: string;
}

export interface SpeciesRecord {
  id: string;
  catalogCode: string;
  scientificName: string;
  commonName: string;
  taxon: TaxonGroup;
  iucn: IucnCategory;
  medicalAlert: boolean;
  curationStatus: CurationStatus;
  isSample?: boolean;
  photoUrl: string; // URL based
  videoUrl?: string; // URL for video
  photoTag: PhotoTag;
  bioacoustics: BioacousticData;
  latitude?: number;
  longitude?: number;
  elevationM?: number;
  locality?: string;
  holdridgeZone?: HoldridgeZoneId;
  activityCycle:
    | 'Diurna'
    | 'Nocturna'
    | 'Crepuscular'
    | 'Diurno/nocturno'
    | 'Permanente (Flora)';
  ecology: EcologyFields;
  featuredNote?: string;
  updatedAt: string;
  synced: boolean;
  creatorName?: string;
  creatorCode?: string;
}

export type SightingObservationMethod =
  | 'En persona'
  | 'Cámara trampa'
  | 'Reporte de tercero';

export interface SightingEntry {
  id: string;
  occurrenceId: string;
  speciesId: string;
  individualCount: number;
  observationMethod?: SightingObservationMethod;
  sourceDetail?: string;
  observedDate: string;
  observedTime: string;
  observer: string;
  observerCode?: string;
  latitude: number;
  longitude: number;
  elevationM: number;
  locality: string;
  holdridgeZone: HoldridgeZoneId;
  microhabitat: string;
  notes?: string;
  weatherCondition: 'Despejado' | 'Neblina montana' | 'Lluvia ligera' | 'Noche húmeda';
  photoUrl?: string; // URL of sighting photo
  videoUrl?: string; // URL of sighting video
  audioUrl?: string; // URL of sighting audio / call
  localPhotoId?: string;
  localVideoId?: string;
  localMediaSummary?: string;
  synced: boolean;
  createdAt: string;
}

export interface LocalMediaCapture {
  id: string;
  sightingId: string;
  kind: 'photo' | 'video';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  createdAt: string;
  uploadedUrl?: string;
}

export type OfflineOutboxKind =
  | 'species_upsert'
  | 'species_delete'
  | 'sighting_create'
  | 'sighting_update'
  | 'sighting_delete'
  | 'changelog_create';

export interface OfflineOutboxItem {
  id: string;
  kind: OfflineOutboxKind;
  entityId: string;
  payload: unknown;
  createdAt: string;
  retries: number;
  lastError?: string;
}

export interface UserSession {
  observerName: string;
  observerCode: string;
  isAdmin?: boolean;
}

export type ChangeLogAction =
  | 'Creó especie'
  | 'Editó especie'
  | 'Eliminó especie'
  | 'Registró avistamiento'
  | 'Editó avistamiento'
  | 'Eliminó avistamiento'
  | 'Sincronizó lote'
  | 'Importó respaldo'
  | 'Reinició base';

export interface ChangeLogEntry {
  id: string;
  actorName: string;
  action: ChangeLogAction;
  target: string;
  details?: string;
  timestamp: string;
}

export interface SyncBatchLog {
  batchHash: string;
  timestamp: string;
  recordsSynced: number;
  deviceProfile: string;
}

export type AppModuleId =
  | 'portada'
  | 'fichas'
  | 'mapa'
  | 'coleccion'
  | 'estadistica'
  | 'respaldo';
