import type { SightingEntry, SpeciesRecord } from '../types/cbls';
import { ASSIGNED_USER_CODES } from './ecology';

export interface RangoCBLS {
  nivel: number;
  titulo: string;
  min: number;
  max: number;
  archivo: string;
  tierLabel: string;
  accentHex: string;
  ringHex: string;
}

export const RANGOS_CBLS: readonly RangoCBLS[] = [
  {
    nivel: 1,
    titulo: 'Brote de Roble',
    min: 1,
    max: 5,
    archivo: 'brote_roble',
    tierLabel: 'Iniciación',
    accentHex: '#86efac',
    ringHex: '#22c55e',
  },
  {
    nivel: 2,
    titulo: 'Semilla de Roble',
    min: 6,
    max: 10,
    archivo: 'semilla_roble',
    tierLabel: 'Iniciación',
    accentHex: '#6ee7b7',
    ringHex: '#10b981',
  },
  {
    nivel: 3,
    titulo: 'Voz de Quebrada',
    min: 11,
    max: 15,
    archivo: 'voz_quebrada',
    tierLabel: 'Río y Cuenca',
    accentHex: '#5eead4',
    ringHex: '#14b8a6',
  },
  {
    nivel: 4,
    titulo: 'Guardián de Quebrada',
    min: 16,
    max: 20,
    archivo: 'guardian_quebrada',
    tierLabel: 'Río y Cuenca',
    accentHex: '#38bdf8',
    ringHex: '#0284c7',
  },
  {
    nivel: 5,
    titulo: 'Rastreador del Cafetal',
    min: 21,
    max: 30,
    archivo: 'rastreador_cafetal',
    tierLabel: 'Paisaje Productivo',
    accentHex: '#a3e635',
    ringHex: '#65a30d',
  },
  {
    nivel: 6,
    titulo: 'Vigía del Cafetal',
    min: 31,
    max: 40,
    archivo: 'vigia_cafetal',
    tierLabel: 'Paisaje Productivo',
    accentHex: '#bef264',
    ringHex: '#84cc16',
  },
  {
    nivel: 7,
    titulo: 'Oído de Montaña',
    min: 41,
    max: 55,
    archivo: 'oido_montana',
    tierLabel: 'Bioacústica',
    accentHex: '#67e8f9',
    ringHex: '#06b6d4',
  },
  {
    nivel: 8,
    titulo: 'Ojo Clínico',
    min: 56,
    max: 70,
    archivo: 'ojo_clinico',
    tierLabel: 'Observación Avanzada',
    accentHex: '#fde047',
    ringHex: '#eab308',
  },
  {
    nivel: 9,
    titulo: 'Explorador Nuboso',
    min: 71,
    max: 90,
    archivo: 'explorador_nuboso',
    tierLabel: 'Bosque Nuboso',
    accentHex: '#93c5fd',
    ringHex: '#3b82f6',
  },
  {
    nivel: 10,
    titulo: 'Caminante del Robledal',
    min: 91,
    max: 115,
    archivo: 'caminante_robledal',
    tierLabel: 'Robledal de Altura',
    accentHex: '#fdba74',
    ringHex: '#ea580c',
  },
  {
    nivel: 11,
    titulo: 'Tejedor del Corredor',
    min: 116,
    max: 145,
    archivo: 'tejedor_corredor',
    tierLabel: 'Conectividad',
    accentHex: '#c4b5fd',
    ringHex: '#8b5cf6',
  },
  {
    nivel: 12,
    titulo: 'Custodio de Talamanca',
    min: 146,
    max: 180,
    archivo: 'custodio_talamanca',
    tierLabel: 'Cordillera',
    accentHex: '#fcd34d',
    ringHex: '#d97706',
  },
  {
    nivel: 13,
    titulo: 'Espíritu del Páramo',
    min: 181,
    max: Infinity,
    archivo: 'espiritu_paramo',
    tierLabel: 'Cumbre Máxima',
    accentHex: '#fef08a',
    ringHex: '#f59e0b',
  },
] as const;

export interface RangoProgreso {
  conteo: number;
  actual: RangoCBLS;
  siguiente: RangoCBLS | null;
  porcentaje: number;
  mensajeProgreso: string;
  desbloqueados: number;
}

export function calcularRangoBrigadista(totalAvistamientos: number): RangoProgreso {
  const conteo = Math.max(0, Math.floor(Number(totalAvistamientos) || 0));

  if (conteo === 0) {
    return {
      conteo: 0,
      actual: RANGOS_CBLS[0],
      siguiente: RANGOS_CBLS[0],
      porcentaje: 0,
      mensajeProgreso: 'Registra tu primer avistamiento para iniciar en Brote de Roble',
      desbloqueados: 0,
    };
  }

  let indice = RANGOS_CBLS.findIndex((r) => conteo >= r.min && conteo <= r.max);
  if (indice === -1) indice = RANGOS_CBLS.length - 1;

  const actual = RANGOS_CBLS[indice];
  const siguiente = RANGOS_CBLS[indice + 1] || null;

  let porcentaje = 100;
  let mensajeProgreso = '¡Rango máximo alcanzado en la Brigada CBLS!';

  if (siguiente) {
    const inicioTramo = actual.min;
    const finTramo = siguiente.min;
    porcentaje = Math.min(
      100,
      Math.max(6, Math.round(((conteo - inicioTramo) / (finTramo - inicioTramo)) * 100)),
    );
    const faltan = siguiente.min - conteo;
    mensajeProgreso = `Falta${faltan === 1 ? '' : 'n'} ${faltan} para ${siguiente.titulo} (N${siguiente.nivel})`;
  }

  return {
    conteo,
    actual,
    siguiente,
    porcentaje,
    mensajeProgreso,
    desbloqueados: indice + 1,
  };
}

export function normalizeObserverName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function countSightingsForObserver(
  sightings: SightingEntry[],
  observerName?: string | null,
): number {
  if (!observerName) return 0;
  const target = normalizeObserverName(observerName);
  if (!target) return 0;
  return sightings.reduce((acc, s) => {
    return normalizeObserverName(s.observer || '') === target ? acc + 1 : acc;
  }, 0);
}

export interface BrigadistaLeaderboardEntry {
  key: string;
  name: string;
  isAdmin: boolean;
  sightingsCount: number;
  individualsCount: number;
  distinctSpeciesCount: number;
  lastSightingIso: string | null;
  progress: RangoProgreso;
}

const GENERIC_PLACEHOLDER_NAMES = new Set([
  'brigadista 1',
  'brigadista 2',
  'brigadista 3',
  'brigadista 4',
  'brigadista 5',
]);

export function buildBrigadistaLeaderboard(
  sightings: SightingEntry[],
  species: SpeciesRecord[],
  options?: { includeRegisteredTeam?: boolean },
): BrigadistaLeaderboardEntry[] {
  const validSpeciesIds = new Set(species.map((s) => s.id));
  const includeRegisteredTeam = options?.includeRegisteredTeam ?? true;

  const map = new Map<
    string,
    {
      name: string;
      isAdmin: boolean;
      sightingsCount: number;
      individualsCount: number;
      speciesIds: Set<string>;
      lastSightingIso: string | null;
    }
  >();

  // Pre-seed named registered brigadistas from ASSIGNED_USER_CODES
  if (includeRegisteredTeam) {
    Object.values(ASSIGNED_USER_CODES).forEach((profile) => {
      const key = normalizeObserverName(profile.assignedName);
      if (!GENERIC_PLACEHOLDER_NAMES.has(key) && !map.has(key)) {
        map.set(key, {
          name: profile.assignedName,
          isAdmin: profile.isAdmin,
          sightingsCount: 0,
          individualsCount: 0,
          speciesIds: new Set<string>(),
          lastSightingIso: null,
        });
      }
    });
  }

  // Aggregate real-time sightings per observer
  sightings.forEach((s) => {
    const rawName = (s.observer || 'Brigadista CBLS').trim();
    const key = normalizeObserverName(rawName);
    if (!key) return;

    const existing = map.get(key);
    const iso = s.createdAt || s.observedDate || null;

    if (existing) {
      existing.sightingsCount += 1;
      existing.individualsCount += Math.max(0, Number(s.individualCount) || 0);
      if (s.speciesId && (validSpeciesIds.size === 0 || validSpeciesIds.has(s.speciesId))) {
        existing.speciesIds.add(s.speciesId);
      }
      if (iso && (!existing.lastSightingIso || iso > existing.lastSightingIso)) {
        existing.lastSightingIso = iso;
      }
    } else {
      const matchingProfile = Object.values(ASSIGNED_USER_CODES).find(
        (p) => normalizeObserverName(p.assignedName) === key,
      );
      const spSet = new Set<string>();
      if (s.speciesId && (validSpeciesIds.size === 0 || validSpeciesIds.has(s.speciesId))) {
        spSet.add(s.speciesId);
      }
      map.set(key, {
        name: matchingProfile?.assignedName ?? rawName,
        isAdmin: matchingProfile?.isAdmin ?? false,
        sightingsCount: 1,
        individualsCount: Math.max(0, Number(s.individualCount) || 0),
        speciesIds: spSet,
        lastSightingIso: iso,
      });
    }
  });

  return Array.from(map.entries())
    .map(([key, item]) => ({
      key,
      name: item.name,
      isAdmin: item.isAdmin,
      sightingsCount: item.sightingsCount,
      individualsCount: item.individualsCount,
      distinctSpeciesCount: item.speciesIds.size,
      lastSightingIso: item.lastSightingIso,
      progress: calcularRangoBrigadista(item.sightingsCount),
    }))
    .sort((a, b) => {
      if (b.sightingsCount !== a.sightingsCount) {
        return b.sightingsCount - a.sightingsCount;
      }
      if (b.individualsCount !== a.individualsCount) {
        return b.individualsCount - a.individualsCount;
      }
      if (b.distinctSpeciesCount !== a.distinctSpeciesCount) {
        return b.distinctSpeciesCount - a.distinctSpeciesCount;
      }
      return a.name.localeCompare(b.name, 'es');
    });
}
