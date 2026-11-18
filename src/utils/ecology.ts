import type {
  HoldridgeZoneId,
  HoldridgeZoneInfo,
  SightingEntry,
  SpeciesRecord,
  TaxonGroup,
} from '../types/cbls';

export const ADMIN_PIN = '5531';

export interface AssignedCodeProfile {
  code: string;
  assignedName: string;
  isAdmin: boolean;
}

export const ASSIGNED_USER_CODES: Record<string, AssignedCodeProfile> = {
  '5531': {
    code: '5531',
    assignedName: 'Jorge C',
    isAdmin: true,
  },
  '1111': {
    code: '1111',
    assignedName: 'Brigadista 1',
    isAdmin: false,
  },
  '2222': {
    code: '2222',
    assignedName: 'Brigadista 2',
    isAdmin: false,
  },
  '3333': {
    code: '3333',
    assignedName: 'Brigadista 3',
    isAdmin: false,
  },
  '4444': {
    code: '4444',
    assignedName: 'Brigadista 4',
    isAdmin: false,
  },
  '5555': {
    code: '5555',
    assignedName: 'Brigadista 5',
    isAdmin: false,
  },
};

export const FIELD_ACCESS_CODES = [
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
] as const;

export function validateAccessCode(rawCode: string): {
  valid: boolean;
  isAdmin: boolean;
  normalized: string;
  assignedName?: string;
} {
  const normalized = rawCode.trim().toUpperCase();
  const assigned = ASSIGNED_USER_CODES[normalized];
  if (assigned) {
    return {
      valid: true,
      isAdmin: assigned.isAdmin,
      normalized,
      assignedName: assigned.assignedName,
    };
  }
  if (normalized === ADMIN_PIN) {
    return { valid: true, isAdmin: true, normalized, assignedName: 'Jorge C' };
  }
  if ((FIELD_ACCESS_CODES as readonly string[]).includes(normalized)) {
    return { valid: true, isAdmin: false, normalized };
  }
  return { valid: false, isAdmin: false, normalized };
}

export const HOLDRIDGE_ZONES: HoldridgeZoneInfo[] = [
  {
    id: 'bmh-P',
    name: 'Bosque Muy Húmedo Premontano',
    shortName: 'Premontano (bmh-P)',
    minElevation: 800,
    maxElevation: 1500,
    meanTempC: '18 – 24 °C',
    annualRainMm: '2 000 – 4 000 mm',
    representativeSector: 'Valle del Río Pirrís · San Lorenzo de Tarrazú',
  },
  {
    id: 'bmh-MB',
    name: 'Bosque Muy Húmedo Montano Bajo',
    shortName: 'Montano Bajo (bmh-MB)',
    minElevation: 1500,
    maxElevation: 2100,
    meanTempC: '14 – 18 °C',
    annualRainMm: '1 800 – 2 800 mm',
    representativeSector: 'Cafetales bajo sombra · Santa María y San Marcos',
  },
  {
    id: 'bp-MB',
    name: 'Bosque Pluvial Montano Bajo',
    shortName: 'Pluvial Montano Bajo (bp-MB)',
    minElevation: 2100,
    maxElevation: 2450,
    meanTempC: '12 – 15 °C',
    annualRainMm: '3 200 – 4 500 mm',
    representativeSector: 'Cuenca media del Río Savegre · Copey de Dota',
  },
  {
    id: 'bp-M',
    name: 'Bosque Pluvial Montano',
    shortName: 'Pluvial Montano (bp-M)',
    minElevation: 2450,
    maxElevation: 3100,
    meanTempC: '8 – 12 °C',
    annualRainMm: '2 800 – 3 800 mm',
    representativeSector: 'Robledales de altura · San Gerardo y El Empalme',
  },
  {
    id: 'pp-SA',
    name: 'Páramo Pluvial Subalpino',
    shortName: 'Páramo Subalpino (pp-SA)',
    minElevation: 3100,
    maxElevation: 3500,
    meanTempC: '5 – 8 °C',
    annualRainMm: '2 200 – 3 200 mm',
    representativeSector: 'Macizo Cerro Buenavista y Cerro Vueltas',
  },
];

export const TAXON_GROUPS: TaxonGroup[] = [
  'Aves',
  'Anfibios',
  'Reptiles',
  'Mamíferos',
  'Plantas',
  'Insectos',
];

export const TAXON_COLOR_MAP: Record<TaxonGroup, string> = {
  Aves: '#63e2b7',
  Anfibios: '#8ce95c',
  Reptiles: '#ff8b54',
  Mamíferos: '#f2c96d',
  Plantas: '#55cb45',
  Insectos: '#7cc6fe',
};

export function getHoldridgeZoneInfo(id: HoldridgeZoneId): HoldridgeZoneInfo {
  return HOLDRIDGE_ZONES.find((z) => z.id === id) ?? HOLDRIDGE_ZONES[1];
}

export function detectHoldridgeZoneByElevation(elevationM: number): HoldridgeZoneId {
  if (!Number.isFinite(elevationM) || elevationM < 1500) return 'bmh-P';
  if (elevationM < 2100) return 'bmh-MB';
  if (elevationM < 2450) return 'bp-MB';
  if (elevationM < 3100) return 'bp-M';
  return 'pp-SA';
}

export function estimateCblsElevationFromCoords(lat: number, lon: number): number {
  const eastFactor = Math.max(0, Math.min(1, (lon - -84.1) / 0.4));
  const ridgeProximity = 1 - Math.min(1, Math.abs(lat - 9.57) / 0.18);
  const rawMeters = 920 + eastFactor * 2120 + ridgeProximity * 410;
  return Math.round(Math.max(850, Math.min(3491, rawMeters)));
}

export function computeDatasetChecksum(
  species: SpeciesRecord[],
  sightings: SightingEntry[],
): string {
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

export function generateDarwinCoreCsv(
  speciesList: SpeciesRecord[],
  sightings: SightingEntry[],
): string {
  const headers = [
    'occurrenceID',
    'basisOfRecord',
    'samplingProtocol',
    'catalogNumber',
    'scientificName',
    'vernacularName',
    'taxonGroup',
    'iucnRedListCategory',
    'individualCount',
    'eventDate',
    'eventTime',
    'decimalLatitude',
    'decimalLongitude',
    'geodeticDatum',
    'minimumElevationInMeters',
    'locality',
    'habitat',
    'recordedBy',
    'associatedMedia',
  ];

  const speciesMap = new Map(speciesList.map((s) => [s.id, s]));

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = sightings.map((sighting) => {
    const sp = speciesMap.get(sighting.speciesId);
    const zone = getHoldridgeZoneInfo(sighting.holdridgeZone);
    const media = [sighting.photoUrl, sighting.videoUrl, sighting.audioUrl].filter(Boolean).join(' | ');
    const method = sighting.observationMethod || 'En persona';
    const protocol = sighting.sourceDetail
      ? `${method} (${sighting.sourceDetail})`
      : method;
    const basis = method === 'Cámara trampa' ? 'MachineObservation' : 'HumanObservation';

    return [
      sighting.occurrenceId,
      basis,
      protocol,
      sp?.catalogCode ?? 'CBLS-UNASSIGNED',
      sp?.scientificName ?? 'Indeterminado',
      sp?.commonName ?? 'Sin nombre común',
      sp?.taxon ?? 'Aves',
      sp?.iucn ?? 'LC',
      sighting.individualCount,
      sighting.observedDate,
      sighting.observedTime,
      sighting.latitude.toFixed(5),
      sighting.longitude.toFixed(5),
      'WGS84',
      sighting.elevationM,
      sighting.locality,
      `${zone.name} (${zone.id}) — ${sighting.microhabitat}`,
      sighting.observer,
      media,
    ]
      .map(escapeCsv)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function playBioacousticPreview(
  pattern: 'flute' | 'pulse' | 'whistle' | 'chirp' = 'flute',
  dominantFreqKhz = 2.4,
  onEnded?: () => void,
): () => void {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    if (onEnded) onEnded();
    return () => undefined;
  }

  const ctx = new AudioCtx();
  const baseHz = Math.max(420, Math.min(4800, dominantFreqKhz * 1000));
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.18, now);
  master.connect(ctx.destination);

  const durationSec = 2.2;

  if (pattern === 'flute') {
    [0, 0.65, 1.35].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const startFreq = idx % 2 === 0 ? baseHz * 0.55 : baseHz * 0.68;
      osc.frequency.setValueAtTime(startFreq, now + offset);
      osc.frequency.exponentialRampToValueAtTime(startFreq * 1.18, now + offset + 0.28);
      osc.frequency.exponentialRampToValueAtTime(startFreq * 0.92, now + offset + 0.52);

      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.85, now + offset + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.55);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now + offset);
      osc.stop(now + offset + 0.56);
    });
  } else if (pattern === 'pulse') {
    for (let i = 0; i < 7; i += 1) {
      const t = now + i * 0.27;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseHz * 0.75, t);
      osc.frequency.exponentialRampToValueAtTime(baseHz * 1.05, t + 0.09);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.9, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  } else if (pattern === 'whistle') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseHz * 0.95, now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(baseHz * 0.52, now + 1.85);

    gain.gain.setValueAtTime(0.001, now + 0.05);
    gain.gain.linearRampToValueAtTime(0.75, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.95);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now + 0.05);
    osc.stop(now + 2.0);
  } else {
    [0.05, 0.45, 0.85, 1.35, 1.75].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseHz, now + offset);
      osc.frequency.linearRampToValueAtTime(baseHz * 1.12, now + offset + 0.11);

      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.7, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    });
  }

  const timer = window.setTimeout(() => {
    ctx.close().catch(() => undefined);
    if (onEnded) onEnded();
  }, durationSec * 1000);

  return () => {
    window.clearTimeout(timer);
    ctx.close().catch(() => undefined);
    if (onEnded) onEnded();
  };
}
