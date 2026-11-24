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
  '3348': {
    code: '3348',
    assignedName: 'Keylor A',
    isAdmin: false,
  },
  '3375': {
    code: '3375',
    assignedName: 'CaroQM',
    isAdmin: false,
  },
  '3394': {
    code: '3394',
    assignedName: 'Diego CM',
    isAdmin: false,
  },
  '3302': {
    code: '3302',
    assignedName: 'Paula P',
    isAdmin: false,
  },
  '3361': {
    code: '3361',
    assignedName: 'Mario M',
    isAdmin: false,
  },
  '3389': {
    code: '3389',
    assignedName: 'Nelson A',
    isAdmin: false,
  },
};

export const FIELD_ACCESS_CODES = [
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '3348',
  '3375',
  '3394',
  '3302',
  '3361',
  '3389',
] as const;

export function isPersonalAdminCode(rawCode?: string | null): boolean {
  return typeof rawCode === 'string' && rawCode.trim() === ADMIN_PIN;
}

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
  'Hongos',
  'Insectos',
  'Arácnidos',
];

export const TAXON_COLOR_MAP: Record<TaxonGroup, string> = {
  Aves: '#63e2b7',
  Anfibios: '#8ce95c',
  Reptiles: '#ff8b54',
  Mamíferos: '#f2c96d',
  Plantas: '#55cb45',
  Hongos: '#d4a3ff',
  Insectos: '#7cc6fe',
  Arácnidos: '#f472b6',
};

export const VALID_ACTIVITY_CYCLES = [
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
] as const;

export const FAUNA_ACTIVITY_CYCLES = [
  'Diurna',
  'Nocturna',
  'Crepuscular',
  'Crepuscular/Nocturna',
  'Diurno/nocturno',
  'Permanente (Flora)',
] as const;

export const FLORA_PHENOLOGY_CYCLES = [
  'Permanente (Flora)',
  'Floración',
  'Fructificación',
  'Vegetativa',
  'Con esporofitos',
  'Floración y brotes',
] as const;

export const FUNGI_PHENOLOGY_CYCLES = [
  'Fructificación',
  'Permanente (Fungi/Liquen)',
  'Vegetativa',
  'Con esporofitos',
] as const;

export const FAUNA_PHOTO_TAGS = [
  'Vista general',
  'Ojo',
  'Flanco',
  'Dorso',
  'Puesta',
  'Hembra',
  'Macho',
  'Floración / Fruto',
] as const;

export const FLORA_PHOTO_TAGS = [
  'Vista general',
  'Floración / Fruto',
  'Hoja / Follaje',
  'Corteza / Tallo',
  'Detalle floral',
  'Cápsula / Esporofito',
] as const;

export const FUNGI_PHOTO_TAGS = [
  'Vista general',
  'Cuerpo fructífero',
  'Láminas / Poros',
  'Sustrato / Madera',
  'Corteza / Tallo',
] as const;

export function isPlantTaxon(taxon?: TaxonGroup | null): boolean {
  return taxon === 'Plantas';
}

export function isFungiTaxon(taxon?: TaxonGroup | null): boolean {
  return taxon === 'Hongos';
}

export function isNonAnimalTaxon(taxon?: TaxonGroup | null): boolean {
  return taxon === 'Plantas' || taxon === 'Hongos';
}

export interface KingdomSchemaConfig {
  isPlant: boolean;
  isFungi: boolean;
  kingdomLabel: string;
  codePrefix: string;
  taxonGroupLabel: string;
  botanicalGroupLabel: string;
  botanicalGroupPlaceholder: string;
  activityLabel: string;
  alertCheckboxLabel: string;
  alertBadgeShort: string;
  alertDetailLabel: string;
  abundanceLabel: string;
  abundancePlaceholder: string;
  photoTagLabel: string;
  macroOrExtraUrlLabel: string;
  macroOrExtraUrlHint: string;
  macroOrExtraUrlPlaceholder: string;
  substrateOrBioHeader: string;
  substrateOrBioNotesLabel: string;
  substrateOrBioPlaceholder: string;
  ecologySectionTitle: string;
  eco1Label: string;
  eco1Hint: string;
  eco2Label: string;
  eco2Hint: string;
  eco3Label: string;
  eco3Hint: string;
  eco4Label: string;
  eco4Hint: string;
  eco5Label: string;
}

export function getKingdomSchema(taxon?: TaxonGroup | null): KingdomSchemaConfig {
  if (taxon === 'Plantas') {
    return {
      isPlant: true,
      isFungi: false,
      kingdomLabel: 'Flora (Plantae)',
      codePrefix: 'CBLS-FL-',
      taxonGroupLabel: 'Reino / División taxonómica',
      botanicalGroupLabel: 'Grupo botánico / Forma de vida',
      botanicalGroupPlaceholder:
        'Ej. Fagaceae (Árbol) / Orchidaceae (Orquídea epífita) / Sphagnaceae (Musgo)',
      activityLabel: 'Fenología observada',
      alertCheckboxLabel: 'Alerta endémica / veda / toxicidad',
      alertBadgeShort: 'Veda / Endémica',
      alertDetailLabel: '▲ Endémica / veda / toxicidad',
      abundanceLabel: 'Individuos / Cobertura observada',
      abundancePlaceholder: 'Ej. 1 ind. adulto / Colonia de 4 ind. / Parche de 1.5 m²',
      photoTagLabel: 'Etiqueta diagnóstica botánica de la foto',
      macroOrExtraUrlLabel: 'URL de Fotografía Macro / Herbario (opcional)',
      macroOrExtraUrlHint: 'Detalle de hoja, flor, corteza o pliego de herbario',
      macroOrExtraUrlPlaceholder: 'https://ejemplo.com/macro_hoja_o_flor.jpg',
      substrateOrBioHeader: 'Microhábitat y sustrato (Forófito / Exposición)',
      substrateOrBioNotesLabel: 'Microhábitat y sustrato (Forófito / Exposición)',
      substrateOrBioPlaceholder:
        'Tipo de sustrato (terrestre, epífito en roble, litófito), humedad, suelo y exposición lumínica...',
      ecologySectionTitle: 'Campos de investigación botánica y ecología',
      eco1Label: 'Morfología y cromática diagnóstica',
      eco1Hint: 'Porte, tronco/corteza, hojas, nervadura, flor, fruto, cápsula o esporofito',
      eco2Label: 'Fisiología y adaptaciones al sitio',
      eco2Hint: 'Cutícula, tolerancia a neblina, radiación UV, heladas o epifitismo',
      eco3Label: 'Fenología, polinización y dispersión',
      eco3Hint: 'Polinizadores, época de floración/fructificación y dispersión de semillas o esporas',
      eco4Label: 'Relaciones ecológicas y simbiosis (micorrizas / forófitos)',
      eco4Hint: 'Micorrizas, forófitos hospederos, epífitas asociadas o fauna dispersora',
      eco5Label: 'Datos científicos confirmados y literatura regional',
    };
  }

  if (taxon === 'Hongos') {
    return {
      isPlant: true,
      isFungi: true,
      kingdomLabel: 'Fungi (Hongos y Líquenes)',
      codePrefix: 'CBLS-FN-',
      taxonGroupLabel: 'Reino / División taxonómica',
      botanicalGroupLabel: 'Grupo micológico / Gremio trófico',
      botanicalGroupPlaceholder:
        'Ej. Basidiomycota (Ectomicorrícico en Quercus) / Ascomycota (Saprófito lignícola)',
      activityLabel: 'Estado fenológico / Fructificación',
      alertCheckboxLabel: 'Alerta toxicológica (tóxico / mortal)',
      alertBadgeShort: 'Tóxico',
      alertDetailLabel: '▲ Toxicidad micológica (no comestible / mortal)',
      abundanceLabel: 'Carpóforos / Colonia observada',
      abundancePlaceholder: 'Ej. Solitario / Gregario (8–15 carpóforos) / Cespitosa',
      photoTagLabel: 'Etiqueta diagnóstica micológica de la foto',
      macroOrExtraUrlLabel: 'URL de Fotografía Macro / Himenio (opcional)',
      macroOrExtraUrlHint: 'Detalle de láminas, poros, estípite, esporada o sustrato',
      macroOrExtraUrlPlaceholder: 'https://ejemplo.com/macro_himenio.jpg',
      substrateOrBioHeader: 'Sustrato, microhábitat y piso altitudinal',
      substrateOrBioNotesLabel: 'Sustrato, microhábitat y piso altitudinal',
      substrateOrBioPlaceholder:
        'Sustrato (madera muerta de roble, hojarasca húmeda, suelo humífero, turbera, artrópodo)...',
      ecologySectionTitle: 'Campos de investigación micológica y ecología',
      eco1Label: 'Morfología del carpóforo y cromática diagnóstica',
      eco1Hint: 'Píleo, himenio (láminas/poros/espinas), estípite, volva, anillo, látex o talo liquénico',
      eco2Label: 'Ecología trófica y adaptaciones al sustrato',
      eco2Hint: 'Saprófito lignícola/humícola, ectomicorrícico, entomopatógeno o simbiosis liquénica',
      eco3Label: 'Esporulación, dispersión y fenología',
      eco3Hint: 'Época de fructificación (lluvias/neblina), esporada y vectores (viento, insectos, agua)',
      eco4Label: 'Simbiosis (micorrizas / hospederos) y rol ecosistémico',
      eco4Hint: 'Asociación con Quercus/coníferas, descomposición de lignina o bioindicación',
      eco5Label: 'Datos científicos confirmados y literatura micológica regional',
    };
  }

  if (taxon === 'Arácnidos') {
    return {
      isPlant: false,
      isFungi: false,
      kingdomLabel: 'Fauna (Animalia · Arácnidos)',
      codePrefix: 'CBLS-AR-',
      taxonGroupLabel: 'Grupo taxonómico',
      botanicalGroupLabel: 'Familia / Gremio (opcional)',
      botanicalGroupPlaceholder: 'Ej. Theraphosidae / Araneidae / Ctenidae',
      activityLabel: 'Horario de actividad',
      alertCheckboxLabel: 'Alerta médica / aracnoidismo clínico',
      alertBadgeShort: 'Médico',
      alertDetailLabel: '▲ Veneno de importancia médica (aracnoidismo)',
      abundanceLabel: 'Individuos observados en muestra (opcional)',
      abundancePlaceholder: 'Ej. 1 ind. en madriguera / En tela orbital',
      photoTagLabel: 'Etiqueta anatómica de la foto',
      macroOrExtraUrlLabel: 'URL de Audio / Vibración (opcional)',
      macroOrExtraUrlHint: 'MP3, WAV o registro de estridulación',
      macroOrExtraUrlPlaceholder: 'https://ejemplo.com/estridulacion.mp3',
      substrateOrBioHeader: 'Registro bioacústico / vibratorio de referencia',
      substrateOrBioNotesLabel: 'Notas de comunicación vibratoria, seda o estridulación',
      substrateOrBioPlaceholder:
        'Describe estridulación defensiva, tamborileo de cortejo o tipo de tela...',
      ecologySectionTitle: 'Campos de investigación aracnológica y ecología',
      eco1Label: 'Cromática y anatomía del espécimen',
      eco1Hint: 'Cefalotórax, disposición ocular, quelíceros, pilosidad, setas urticantes y abdomen',
      eco2Label: 'Etología, arquitectura de tela y comportamiento',
      eco2Hint: 'Tipo de tela o caza errante, refugio/madriguera, postura defensiva y estrato',
      eco3Label: 'Cortejo, reproducción y cuidado maternal',
      eco3Hint: 'Cortejo vibratorio, ooteca (saco de huevos), dispersión de arañitas y longevidad',
      eco4Label: 'Relaciones intra e interespecíficas',
      eco4Hint: 'Control biológico de insectos, depredadores (avispas Pompilidae, aves) e importancia médica',
      eco5Label: 'Datos científicos confirmados y literatura aracnológica regional',
    };
  }

  return {
    isPlant: false,
    isFungi: false,
    kingdomLabel: 'Fauna (Animalia)',
    codePrefix: 'CBLS-SP-',
    taxonGroupLabel: 'Grupo taxonómico',
    botanicalGroupLabel: 'Subgrupo / Familia (opcional)',
    botanicalGroupPlaceholder: 'Ej. Accipitridae / Trogonidae / Viperidae',
    activityLabel: 'Horario de actividad',
    alertCheckboxLabel: 'Alerta ofídica / veneno / prioritario',
    alertBadgeShort: 'Ofídico',
    alertDetailLabel: '▲ Venenosa / interés médico',
    abundanceLabel: 'Individuos observados en muestra (opcional)',
    abundancePlaceholder: 'Ej. 1 ind. (Solitario o en pareja)',
    photoTagLabel: 'Etiqueta anatómica de la foto',
    macroOrExtraUrlLabel: 'URL de Canto / Audio (opcional)',
    macroOrExtraUrlHint: 'MP3, WAV o enlace sonoro',
    macroOrExtraUrlPlaceholder: 'https://ejemplo.com/canto_macho.mp3',
    substrateOrBioHeader: 'Registro bioacústico de referencia',
    substrateOrBioNotesLabel: 'Notas de bioacústica y contexto de emisión',
    substrateOrBioPlaceholder:
      'Describe vocalizaciones, llamadas de alarma o contexto de emisión...',
    ecologySectionTitle: 'Campos de investigación biológica y ecología',
    eco1Label: 'Cromática y anatomía del espécimen',
    eco1Hint: 'Morfología diagnóstica, patrones de color, escamación o plumaje',
    eco2Label: 'Etología y comportamiento en sitio',
    eco2Hint: 'Termorregulación, estrato vertical, forrajeo y desplazamiento',
    eco3Label: 'Cortejo, reproducción y cuidado parental',
    eco3Hint: 'Época reproductiva, nidación, puesta o cuidado de crías',
    eco4Label: 'Relaciones intra e interespecíficas',
    eco4Hint: 'Competencia, depredación, bandadas mixtas o dispersión',
    eco5Label: 'Datos científicos confirmados y literatura regional',
  };
}

export function isBlankOrDefaultBioNote(text?: string | null): boolean {
  if (!text) return true;
  const cleaned = text.trim();
  if (!cleaned) return true;
  return /^(no aplica(\s*\(sin canto\))?\.?|sin notas registradas\.?|sin notas de sustrato registradas\.?)$/i.test(
    cleaned,
  );
}

export function formatSpeciesMarkdown(sp: SpeciesRecord): string {
  const cfg = getKingdomSchema(sp.taxon);
  const checkAlert = sp.medicalAlert ? '[X]' : '[ ]';
  const groupText = sp.botanicalGroup
    ? `${sp.taxon} — ${sp.botanicalGroup}`
    : sp.taxon;

  return `### **Taxonomía y datos básicos de curaduría**
* **Reino biológico:** ${cfg.kingdomLabel}
* **Nombre científico (binomio):** *${sp.scientificName}*
* **Nombre común / vernáculo:** ${sp.commonName}
* **${cfg.isPlant ? cfg.botanicalGroupLabel : cfg.taxonGroupLabel}:** ${groupText}
* **Código de catálogo CBLS:** ${sp.catalogCode}
* **Categoría Lista Roja UICN:** ${sp.iucn}
* **Estado de curaduría:** ${sp.curationStatus}
* **${cfg.activityLabel}:** ${sp.activityCycle}
* **${cfg.alertCheckboxLabel}:** \`${checkAlert}\`

---

### **Multimedia y registros**
${sp.initialAbundanceNote ? `* **${cfg.abundanceLabel}:** ${sp.initialAbundanceNote}\n` : ''}* **URL de Fotografía Principal:** \`${sp.photoUrl || 'No registrada'}\`
* **${cfg.photoTagLabel}:** ${sp.photoTag}
${cfg.isPlant ? `* **${cfg.macroOrExtraUrlLabel}:** \`${sp.macroPhotoUrl || 'No aplica'}\`\n* **URL de Video (opcional):** \`${sp.videoUrl || 'No aplica'}\`` : `* **URL de Video (opcional):** \`${sp.videoUrl || 'No aplica'}\`\n* **URL de Canto / Audio (opcional):** \`${sp.bioacoustics.audioUrl || 'No aplica'}\``}

---

### **${cfg.substrateOrBioNotesLabel}**
${isBlankOrDefaultBioNote(sp.bioacoustics.notes) ? 'No aplica' : sp.bioacoustics.notes.trim()}

---

### **${cfg.ecologySectionTitle}**

* **${cfg.eco1Label}:**
  ${sp.ecology.chromaticsAnatomy || 'Pendiente de curaduría.'}

* **${cfg.eco2Label}:**
  ${sp.ecology.ethologyBehavior || 'Pendiente de curaduría.'}

* **${cfg.eco3Label}:**
  ${sp.ecology.courtshipReproduction || 'Pendiente de curaduría.'}

* **${cfg.eco4Label}:**
  ${sp.ecology.interIntraRelations || 'Pendiente de curaduría.'}

* **${cfg.eco5Label}:**
  ${sp.ecology.confirmedReferences || 'Pendiente de curaduría.'}`;
}

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
    'vitality',
    'mortalityCause',
    'roadType',
    'siteAction',
    'municipality',
    'coordinateUncertaintyInMeters',
    'identificationVerificationStatus',
    'lifeStageAndSex',
    'behavior',
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
      sighting.vitalStatus ?? 'Vivo',
      sighting.mortality?.cause ?? '',
      sighting.mortality?.roadType ?? '',
      sighting.mortality?.siteAction ?? '',
      sighting.canton ?? '',
      sighting.gpsAccuracyM ?? '',
      sighting.idCertainty ?? 'Confirmada en campo',
      sighting.demography ?? '',
      sighting.behavior ?? '',
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
