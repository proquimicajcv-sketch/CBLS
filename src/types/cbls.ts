export type TaxonGroup =
  | 'Aves'
  | 'Anfibios'
  | 'Reptiles'
  | 'Mamíferos'
  | 'Plantas'
  | 'Hongos'
  | 'Insectos'
  | 'Arácnidos';

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
  | 'Floración / Fruto'
  | 'Hoja / Follaje'
  | 'Corteza / Tallo'
  | 'Detalle floral'
  | 'Cápsula / Esporofito'
  | 'Cuerpo fructífero'
  | 'Láminas / Poros'
  | 'Sustrato / Madera';

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

export type ActivityCycleOption =
  | 'Diurna'
  | 'Nocturna'
  | 'Crepuscular'
  | 'Crepuscular/Nocturna'
  | 'Diurno/nocturno'
  | 'Permanente (Flora)'
  | 'Permanente (Fungi/Liquen)'
  | 'Floración'
  | 'Fructificación'
  | 'Vegetativa'
  | 'Con esporofitos'
  | 'Floración y brotes';

export interface SpeciesRecord {
  id: string;
  catalogCode: string;
  scientificName: string;
  commonName: string;
  taxon: TaxonGroup;
  botanicalGroup?: string;
  iucn: IucnCategory;
  medicalAlert: boolean;
  curationStatus: CurationStatus;
  isSample?: boolean;
  photoUrl: string; // URL based
  videoUrl?: string; // URL for video
  macroPhotoUrl?: string; // URL for macro / herbarium specimen photo
  photoTag: PhotoTag;
  initialAbundanceNote?: string;
  bioacoustics: BioacousticData;
  latitude?: number;
  longitude?: number;
  elevationM?: number;
  locality?: string;
  holdridgeZone?: HoldridgeZoneId;
  activityCycle: ActivityCycleOption;
  ecology: EcologyFields;
  featuredNote?: string;
  updatedAt: string;
  synced: boolean;
  creatorName?: string;
  creatorCode?: string;
}

export type SightingObservationMethod =
  | 'En persona'
  | 'Bioacústica / Canto'
  | 'Rastro indirecto'
  | 'Cámara trampa'
  | 'Reporte de tercero';

export type SightingVitalStatus =
  | 'Vivo'
  | 'Muerto / Atropellado'
  | 'Herido / Rescate'
  | 'Rastro sin individuo';

export type SightingCanton =
  | 'Tarrazú'
  | 'Dota'
  | 'León Cortés Castro'
  | 'Zona de amortiguamiento';

export type SightingIdCertainty =
  | 'Confirmada en campo'
  | 'Requiere revisión curatorial'
  | 'Solo género / familia';

export interface SightingMortalityDetails {
  cause: string;
  roadType: string;
  siteAction: string;
}

export interface SightingEntry {
  id: string;
  occurrenceId: string;
  speciesId: string;
  individualCount: number;
  observationMethod?: SightingObservationMethod;
  sourceDetail?: string;
  vitalStatus?: SightingVitalStatus;
  mortality?: SightingMortalityDetails;
  canton?: SightingCanton;
  gpsAccuracyM?: number;
  idCertainty?: SightingIdCertainty;
  demography?: string;
  behavior?: string;
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
  localAudioId?: string;
  localMediaSummary?: string;
  synced: boolean;
  createdAt: string;
}

export interface LocalMediaCapture {
  id: string;
  sightingId: string;
  kind: 'photo' | 'video' | 'audio';
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
