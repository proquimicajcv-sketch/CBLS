import React, { useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Camera,
  Compass,
  Edit3,
  FilePlus2,
  History,
  LayoutGrid,
  Plus,
  Square,
  Trash2,
  UserCheck,
  Video,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import pumaBackdrop from '../assets/images/puma_hero_backdrop_1794610659168.jpg';
import type {
  AppModuleId,
  ChangeLogEntry,
  SightingEntry,
  SpeciesRecord,
  UserSession,
} from '../types/cbls';
import {
  getHoldridgeZoneInfo,
  HOLDRIDGE_ZONES,
  playBioacousticPreview,
} from '../utils/ecology';
import { Button, SpecimenImage, Surface } from './ui';

interface DashboardModuleProps {
  species: SpeciesRecord[];
  sightings: SightingEntry[];
  changeLogs: ChangeLogEntry[];
  totalIndividuals: number;
  currentUser: UserSession | null;
  effectiveOffline: boolean;
  wsConnected: boolean;
  pendingSyncCount: number;
  checksum: string;
  pwaInstallSlot?: React.ReactNode;
  onRequestUserSession: () => void;
  onNavigate: (module: AppModuleId) => void;
  onOpenSpeciesDetail: (speciesId: string) => void;
  onOpenNewSpecies: () => void;
  onQuickSighting: (speciesId?: string) => void;
  onEditSighting: (sighting: SightingEntry) => void;
  onDeleteSighting: (sightingId: string) => Promise<boolean> | void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  species,
  sightings,
  changeLogs,
  totalIndividuals,
  currentUser,
  effectiveOffline,
  wsConnected,
  pendingSyncCount,
  checksum,
  pwaInstallSlot,
  onRequestUserSession,
  onNavigate,
  onOpenSpeciesDetail,
  onOpenNewSpecies,
  onQuickSighting,
  onEditSighting,
  onDeleteSighting,
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [stopAudioFn, setStopAudioFn] = useState<(() => void) | null>(null);
  const [activityTab, setActivityTab] = useState<'sightings' | 'history'>(
    'sightings',
  );
  const [selectedBrigadista, setSelectedBrigadista] = useState<string>('Todos');
  const [showAllSightings, setShowAllSightings] = useState<boolean>(false);

  const featuredSpecies = species[0] ?? null;

  const brigadistaSummary = React.useMemo(() => {
    const map = new Map<string, { sightings: number; individuals: number }>();
    for (const s of sightings) {
      const name = (s.observer || 'Observador CBLS').trim();
      const prev = map.get(name) ?? { sightings: 0, individuals: 0 };
      map.set(name, {
        sightings: prev.sightings + 1,
        individuals: prev.individuals + s.individualCount,
      });
    }
    return Array.from(map.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.sightings - a.sightings);
  }, [sightings]);

  const filteredTeamSightings = React.useMemo(() => {
    if (selectedBrigadista === 'Todos') return sightings;
    return sightings.filter(
      (s) => (s.observer || 'Observador CBLS').trim() === selectedBrigadista,
    );
  }, [sightings, selectedBrigadista]);

  const visibleTeamSightings = showAllSightings
    ? filteredTeamSightings
    : filteredTeamSightings.slice(0, 8);

  const faunaCount = species.filter(
    (s) => s.taxon !== 'Plantas' && s.taxon !== 'Hongos',
  ).length;
  const floraCount = species.filter((s) => s.taxon === 'Plantas').length;
  const fungiCount = species.filter((s) => s.taxon === 'Hongos').length;
  const threatenedCount = species.filter((s) =>
    ['CR', 'EN', 'VU'].includes(s.iucn),
  ).length;

  const speciesMap = new Map(species.map((s) => [s.id, s]));

  const handleToggleAudio = (sp: SpeciesRecord) => {
    if (playingId === sp.id && stopAudioFn) {
      stopAudioFn();
      setPlayingId(null);
      setStopAudioFn(null);
      return;
    }
    if (stopAudioFn) stopAudioFn();
    setPlayingId(sp.id);

    if (sp.bioacoustics.audioUrl) {
      const audio = new Audio(sp.bioacoustics.audioUrl);
      audio.play().catch(() => {
        const stop = playBioacousticPreview(
          sp.bioacoustics.pulsePattern ?? 'pulse',
          sp.bioacoustics.dominantFreqKhz ?? 2.35,
          () => {
            setPlayingId(null);
            setStopAudioFn(null);
          },
        );
        setStopAudioFn(() => stop);
      });
      const stop = () => {
        audio.pause();
        audio.currentTime = 0;
      };
      setStopAudioFn(() => stop);
      audio.onended = () => {
        setPlayingId(null);
        setStopAudioFn(null);
      };
      return;
    }

    const stop = playBioacousticPreview(
      sp.bioacoustics.pulsePattern ?? 'pulse',
      sp.bioacoustics.dominantFreqKhz ?? 2.35,
      () => {
        setPlayingId(null);
        setStopAudioFn(null);
      },
    );
    setStopAudioFn(() => stop);
  };

  return (
    <div className="space-y-8 pb-6">
      {/* Hero & Core Dashboard Stage with Prominent Puma Face Backdrop */}
      <section className="relative overflow-hidden border-b border-white/10 bg-[#040706]">
        {/* Background Puma Face Image — higher clarity & less green tint on Portada */}
        <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
          <img
            src={pumaBackdrop}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover object-[center_32%] opacity-90 brightness-110 contrast-110 saturate-[0.72]"
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(4,7,6,0.06)_0%,rgba(4,7,6,0.48)_72%,rgba(3,10,7,0.88)_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#040807]/65 via-transparent to-[#030F0A]" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 pb-8 pt-5 sm:px-6 sm:pt-7">
          {/* Institutional Header Row + Official CBLS Logo on Portada */}
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-1">
                <p className="font-mono text-[11px] font-semibold tracking-widest text-[#A7E8C3]">
                  REPÚBLICA DE COSTA RICA
                </p>
                <p className="text-xs text-foreground/90 sm:text-sm">
                  Sistema de Bitácora de Campo &amp; Taxonomía |{' '}
                  <span className="font-semibold text-[#B8EBD0]">
                    Corredor Biológico Los Santos
                  </span>
                </p>
              </div>

              {/* Compact Status & Session Action Badges (Never displays access codes) */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onRequestUserSession}
                  title="Cambiar persona o código de acceso"
                  className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-white/15 bg-[#070D0B]/75 px-3.5 py-1.5 text-left backdrop-blur-sm transition-colors hover:border-[#A7E8C3]/50"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[#B8EBD0]">
                    <UserCheck className="h-3.5 w-3.5" />
                  </span>
                  <span className="leading-tight">
                    <span className="block font-mono text-[9px] uppercase tracking-wider text-white/65">
                      Observador activo
                    </span>
                    <span className="block text-xs font-semibold text-foreground">
                      {currentUser?.observerName || 'Identificarme'}
                      {currentUser?.isAdmin ? ' · Admin' : ''}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('respaldo')}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-[#070D0B]/75 px-3.5 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm transition-colors hover:border-[#A7E8C3]/50"
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${
                      effectiveOffline
                        ? 'bg-coral'
                        : wsConnected
                          ? 'bg-[#6EE7B7]'
                          : 'bg-amber-300'
                    }`}
                  />
                  <span>
                    {effectiveOffline
                      ? 'Modo Offline Autónomo'
                      : wsConnected
                        ? 'En vivo · Tiempo real activo'
                        : 'Enlazando dispositivos...'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('respaldo')}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-[#070D0B]/75 px-3.5 py-1.5 text-xs font-medium text-[#B8EBD0] backdrop-blur-sm transition-colors hover:border-[#A7E8C3]/50"
                >
                  {effectiveOffline ? (
                    <WifiOff className="h-3.5 w-3.5 text-coral" />
                  ) : (
                    <Wifi className="h-3.5 w-3.5 text-[#A7E8C3]" />
                  )}
                  <span>
                    {pendingSyncCount > 0
                      ? `${pendingSyncCount} en cola · #${checksum.slice(0, 6)}`
                      : `Sincronizado · #${checksum.slice(0, 6)}`}
                  </span>
                </button>

                {pwaInstallSlot}
              </div>

              {/* Hero Title & CBLS Scope Description */}
              <div className="max-w-2xl space-y-2 pt-1">
                <h1 className="font-display text-4xl font-extrabold tracking-tight text-[#C7F2DA] drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-6xl">
                  Bitácora CBLS
                </h1>
                <p className="text-sm leading-relaxed text-foreground/95 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)] sm:text-base">
                  Plataforma de campo para el inventario biológico en el{' '}
                  <strong className="font-semibold text-white">
                    Corredor Biológico Los Santos
                  </strong>
                  .
                  <br />
                  Gradiente altitudinal (800 – 3 500 m s.n.m.) y monitoreo de{' '}
                  <span className="italic text-[#B8EBD0]">Puma concolor</span>,
                  flora y fauna en Talamanca.
                </p>
              </div>
            </div>

            {/* Official Corredor Biológico Los Santos Logo */}
            <div className="shrink-0 self-start lg:self-center">
              <div className="overflow-hidden rounded-2xl border border-white/25 bg-white/95 p-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.6)] sm:p-3">
                <img
                  src="/assets/aistudio/WhatsApp_Image_2026-11-12_at_10.43.47_e0604207.jpeg"
                  alt="Logotipo del Corredor Biológico Los Santos"
                  className="h-24 w-auto object-contain sm:h-28 lg:h-32"
                />
              </div>
            </div>
          </div>

          {/* Unified 3-Column Translucent Stat Strip so Puma Face stays visible */}
          <div className="grid grid-cols-1 divide-y divide-white/12 overflow-hidden rounded-xl border border-white/15 bg-[#050A08]/58 backdrop-blur-[2px] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-white/75">
                Especies
              </span>
              <span className="mt-2 font-display text-4xl font-bold tabular-nums text-white drop-shadow sm:text-[2.75rem]">
                {species.length}
              </span>
              <span className="mt-1.5 text-[11px] text-white/75">
                {faunaCount} fauna · {floraCount} flora · {fungiCount} hongos ·{' '}
                <span className="text-coral">{threatenedCount} UICN</span>
              </span>
            </div>

            <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-[#B8EBD0]">
                Avistamientos
              </span>
              <span className="mt-2 font-display text-4xl font-bold tabular-nums text-white drop-shadow sm:text-[2.75rem]">
                {sightings.length}
              </span>
              <span className="mt-1.5 text-[11px] text-white/75">
                IndexedDB autónomo · {HOLDRIDGE_ZONES.length} zonas Holdridge
              </span>
            </div>

            <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-white/75">
                Individuos
              </span>
              <span className="mt-2 font-display text-4xl font-bold tabular-nums text-white drop-shadow sm:text-[2.75rem]">
                {totalIndividuals}
              </span>
              <span className="mt-1.5 text-[11px] text-white/75">
                especímenes contabilizados en sitio
              </span>
            </div>
          </div>

          {/* Horizontal Featured Species Card (or Empty State from 0) */}
          {featuredSpecies ? (
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-white/15 bg-[#050A08]/68 px-5 py-4 backdrop-blur-sm md:flex-row md:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-white/20 bg-[#0A1410]">
                  <SpecimenImage
                    src={featuredSpecies.photoUrl}
                    alt={`${featuredSpecies.commonName} (${featuredSpecies.scientificName})`}
                    scientificName={featuredSpecies.scientificName}
                    title={featuredSpecies.commonName}
                    subtitle={`${featuredSpecies.catalogCode} · ${featuredSpecies.photoTag}`}
                    showZoomHint={false}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="truncate text-base font-bold text-white sm:text-lg">
                    <span className="italic text-[#B8EBD0]">
                      {featuredSpecies.scientificName}
                    </span>{' '}
                    <span className="text-white/40">|</span>{' '}
                    <span>{featuredSpecies.commonName}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenSpeciesDetail(featuredSpecies.id)}
                      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#A7E8C3]/30 bg-[#123326]/90 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#194735]"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5 text-[#B8EBD0]" />
                      Abrir Ficha Científica
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuickSighting(featuredSpecies.id)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#09120F]/90 px-3 py-1.5 text-xs font-medium text-[#B8EBD0] transition-colors hover:border-[#A7E8C3]/45"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Avistamiento
                    </button>
                    {(featuredSpecies.bioacoustics.hasCall ||
                      featuredSpecies.bioacoustics.audioUrl) && (
                      <button
                        type="button"
                        onClick={() => handleToggleAudio(featuredSpecies)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#09120F]/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-[#A7E8C3]/45"
                      >
                        {playingId === featuredSpecies.id ? (
                          <>
                            <Square className="h-3 w-3 text-coral" />
                            Detener
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5 text-[#B8EBD0]" />
                            Canto
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 md:flex-col md:items-end">
                <span className="rounded-full border border-white/15 bg-[#08120F]/90 px-3.5 py-1.5 font-mono text-xs text-white/80">
                  CAT. {featuredSpecies.catalogCode}
                </span>
                <span className="font-mono text-[11px] text-[#B8EBD0]">
                  Muestra · UICN {featuredSpecies.iucn}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-white/15 bg-[#050A08]/68 px-5 py-4 backdrop-blur-sm md:flex-row md:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-[#0C1D16] text-[#B8EBD0]">
                  <FilePlus2 className="h-6 w-6" />
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-base font-bold text-white sm:text-lg">
                    <span className="italic text-[#B8EBD0]">
                      Inventario desde 0
                    </span>{' '}
                    <span className="text-white/40">|</span>{' '}
                    <span>
                      {currentUser?.isAdmin
                        ? 'Comienza tu catálogo de campo'
                        : 'Esperando fichas del administrador'}
                    </span>
                  </p>
                  {currentUser?.isAdmin ? (
                    <button
                      type="button"
                      onClick={onOpenNewSpecies}
                      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#A7E8C3]/30 bg-[#123326]/90 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#194735]"
                    >
                      <FilePlus2 className="h-3.5 w-3.5 text-[#B8EBD0]" />
                      Agregar Primera Especie (URL y Ficha)
                    </button>
                  ) : (
                    <p className="text-xs text-white/75">
                      Las fichas agregadas por el administrador aparecerán aquí automáticamente en tiempo real.
                    </p>
                  )}
                </div>
              </div>

              <span className="self-start rounded-full border border-white/15 bg-[#08120F]/90 px-3.5 py-1.5 font-mono text-xs text-white/75 md:self-center">
                CAT. CBLS-0000
              </span>
            </div>
          )}

          {/* 4-Card Quick Action Grid — softened green tint so puma shows through */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => onNavigate('mapa')}
              className="flex items-center gap-3.5 rounded-xl border border-white/15 bg-[#060C0A]/72 px-4 py-4 text-left backdrop-blur-sm transition-colors hover:border-white/35"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#0E1814] text-white/80">
                <Compass className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">
                  Mapa SIG
                </span>
                <span className="block truncate text-xs text-white/70">
                  Satélite, calles y GPS exacto
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={
                currentUser?.isAdmin
                  ? onOpenNewSpecies
                  : () => onNavigate('fichas')
              }
              className="flex items-center gap-3.5 rounded-xl border border-[#A7E8C3]/25 bg-[#0A2017]/74 px-4 py-4 text-left backdrop-blur-sm transition-colors hover:border-[#A7E8C3]/50 hover:bg-[#0E2B1F]/85"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#A7E8C3]/25 bg-[#123326] text-[#B8EBD0]">
                <FilePlus2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">
                  {currentUser?.isAdmin ? '+ Agregar Especie' : 'Fichas Técnicas'}
                </span>
                <span className="block truncate text-xs text-white/70">
                  {currentUser?.isAdmin
                    ? 'Nueva ficha en lista'
                    : 'Observar especies fijadas'}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('coleccion')}
              className="flex items-center gap-3.5 rounded-xl border border-white/15 bg-[#060C0A]/72 px-4 py-4 text-left backdrop-blur-sm transition-colors hover:border-white/35"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#0E1814] text-white/80">
                <LayoutGrid className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">
                  Colección
                </span>
                <span className="block truncate text-xs text-white/70">
                  {species.length} especies catalogadas
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('estadistica')}
              className="flex items-center gap-3.5 rounded-xl border border-[#A7E8C3]/25 bg-[#0A2017]/74 px-4 py-4 text-left backdrop-blur-sm transition-colors hover:border-[#A7E8C3]/50 hover:bg-[#0E2B1F]/85"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#A7E8C3]/25 bg-[#123326] text-[#B8EBD0]">
                <BarChart3 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">
                  Estadística
                </span>
                <span className="block truncate text-xs text-white/70">
                  Conteos e índices Darwin Core
                </span>
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Lower Workspace: Recent Sightings / Name-only History + Holdridge Altitudinal Gradient */}
      <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
        <Surface className="divide-y divide-border overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Avistamientos Consolidados del Equipo
              </h2>
              <p className="text-xs text-muted">
                Registros centralizados de todos los brigadistas ·{' '}
                <span className="font-mono text-secondary">
                  {brigadistaSummary.length} brigadista(s) · {sightings.filter((s) => s.synced).length}/{sightings.length} sincronizados
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activityTab === 'sightings' && brigadistaSummary.length > 0 && (
                <select
                  aria-label="Filtrar por brigadista"
                  value={selectedBrigadista}
                  onChange={(e) => setSelectedBrigadista(e.target.value)}
                  className="min-h-9 rounded-control border border-border bg-input px-2.5 text-xs text-foreground"
                >
                  <option value="Todos">
                    Todos los brigadistas ({sightings.length})
                  </option>
                  {brigadistaSummary.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} ({b.sightings} avist. · {b.individuals} ind.)
                    </option>
                  ))}
                </select>
              )}

              <div
                className="flex items-center gap-2"
                role="tablist"
                aria-label="Vista de actividad"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityTab === 'sightings'}
                  onClick={() => setActivityTab('sightings')}
                  className={`min-h-9 rounded-control border px-3 text-xs font-medium transition-colors ${
                    activityTab === 'sightings'
                      ? 'border-primary bg-primary font-semibold text-primary-foreground'
                      : 'border-border bg-input text-muted hover:text-foreground'
                  }`}
                >
                  Equipo ({sightings.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityTab === 'history'}
                  onClick={() => setActivityTab('history')}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-control border px-3 text-xs font-medium transition-colors ${
                    activityTab === 'history'
                      ? 'border-primary bg-primary font-semibold text-primary-foreground'
                      : 'border-border bg-input text-muted hover:text-foreground'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  Historial ({changeLogs.length})
                </button>
              </div>
            </div>
          </div>

          {activityTab === 'sightings' && brigadistaSummary.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 bg-[#04140D] px-5 py-2.5 text-xs">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                Brigadistas:
              </span>
              {brigadistaSummary.map((b) => {
                const active = selectedBrigadista === b.name;
                return (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() =>
                      setSelectedBrigadista((prev) => (prev === b.name ? 'Todos' : b.name))
                    }
                    className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                      active
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-surface text-foreground/85 hover:border-primary/40'
                    }`}
                  >
                    {b.name}: {b.sightings}
                  </button>
                );
              })}
            </div>
          )}

          <div className="divide-y divide-border">
            {activityTab === 'sightings' ? (
              filteredTeamSightings.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted">
                  No hay avistamientos registrados todavía. Usa el botón{' '}
                  <strong className="text-primary">+</strong> en la barra
                  inferior o selecciona un punto exacto en el Mapa SIG.
                </div>
              ) : (
                <>
                  {visibleTeamSightings.map((obs) => {
                    const sp = speciesMap.get(obs.speciesId);
                    return (
                      <div
                        key={obs.id}
                        className="flex w-full items-start justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-foreground/5"
                      >
                        <button
                          type="button"
                          onClick={() => sp && onOpenSpeciesDetail(sp.id)}
                          className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="max-w-[210px] truncate font-semibold text-primary">
                              Brigadista: {obs.observer}
                            </span>
                            <span className="text-muted">·</span>
                            <span className="text-muted">{obs.locality}</span>
                          </div>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">
                            {sp?.commonName ?? 'Especie registrada'}{' '}
                            <span className="font-normal italic text-muted">
                              ({sp?.scientificName ?? 'Indet.'})
                            </span>
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
                              {obs.observationMethod || 'En persona'}
                            </span>
                            {obs.vitalStatus && obs.vitalStatus !== 'Vivo' && (
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                                  obs.vitalStatus === 'Muerto / Atropellado' ||
                                  obs.vitalStatus === 'Herido / Rescate'
                                    ? 'border-rose-400/50 bg-rose-500/15 text-rose-200'
                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                }`}
                              >
                                {obs.vitalStatus}
                              </span>
                            )}
                            {obs.canton && (
                              <span className="rounded border border-border bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground/85">
                                {obs.canton}
                              </span>
                            )}
                            {obs.synced ? (
                              <span className="rounded border border-secondary/30 bg-secondary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-secondary">
                                Sincronizado Firebase
                              </span>
                            ) : (
                              <span className="rounded border border-coral/40 bg-coral/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-coral">
                                Offline · Pendiente
                              </span>
                            )}
                            {obs.sourceDetail && (
                              <span className="truncate max-w-[180px] text-foreground/80">
                                {obs.sourceDetail}
                              </span>
                            )}
                            <span>· {obs.weatherCondition}</span>
                            {(obs.photoUrl || obs.localPhotoId) && (
                              <Camera className="h-3 w-3 text-secondary" />
                            )}
                            {(obs.videoUrl || obs.localVideoId) && (
                              <Video className="h-3 w-3 text-primary" />
                            )}
                            {(obs.audioUrl || obs.localAudioId) && (
                              <Volume2 className="h-3 w-3 text-coral" />
                            )}
                            {obs.localMediaSummary && (
                              <span className="font-mono text-[11px] text-secondary">
                                · {obs.localMediaSummary}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-muted">
                            GPS: {obs.latitude.toFixed(5)}°, {obs.longitude.toFixed(5)}° · {obs.elevationM} m
                            {typeof obs.gpsAccuracyM === 'number' ? ` (±${obs.gpsAccuracyM} m)` : ''}
                          </p>
                          {obs.notes && (
                            <p className="mt-1 line-clamp-2 text-xs text-foreground/80">
                              Notas: {obs.notes}
                            </p>
                          )}
                        </button>

                        <div className="flex shrink-0 flex-col items-end gap-2 text-right font-mono text-xs">
                          <div>
                            <span className="font-semibold text-primary">
                              {obs.individualCount} ind.
                            </span>
                            <p className="mt-0.5 text-muted">{obs.elevationM} m</p>
                            <p className="text-muted/80">
                              {obs.observedDate} · {obs.observedTime}
                            </p>
                          </div>

                          {currentUser?.isAdmin && (
                            <div className="flex flex-wrap items-center justify-end gap-1.5 font-sans">
                              <button
                                type="button"
                                onClick={() => onEditSighting(obs)}
                                title="Editar avistamiento"
                                className="inline-flex items-center gap-1 rounded border border-secondary/35 bg-secondary/10 px-2 py-1 text-[11px] font-medium text-secondary hover:bg-secondary/20"
                              >
                                <Edit3 className="h-3 w-3" />
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void onDeleteSighting(obs.id)}
                                title="Eliminar avistamiento (requiere código personal)"
                                className="inline-flex items-center gap-1 rounded border border-coral/35 bg-coral/10 px-2 py-1 text-[11px] font-medium text-coral hover:bg-coral/20"
                              >
                                <Trash2 className="h-3 w-3" />
                                Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredTeamSightings.length > 8 && (
                    <div className="flex justify-center p-3">
                      <Button
                        tone="quiet"
                        onClick={() => setShowAllSightings((v) => !v)}
                        className="min-h-9 text-xs"
                      >
                        {showAllSightings
                          ? 'Mostrar solo recientes (8)'
                          : `Ver todos los avistamientos del equipo (${filteredTeamSightings.length})`}
                      </Button>
                    </div>
                  )}
                </>
              )
            ) : changeLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                Aún no hay cambios registrados en el historial. Cada alta,
                edición o avistamiento guardará únicamente el nombre de la
                persona.
              </div>
            ) : (
              changeLogs.slice(0, 12).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 px-5 py-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">
                      {log.actorName}{' '}
                      <span className="font-normal text-primary">
                        · {log.action}
                      </span>
                    </p>
                    <p className="mt-0.5 text-foreground/90">{log.target}</p>
                    {log.details && (
                      <p className="mt-0.5 text-muted">{log.details}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted">
                    {new Date(log.timestamp).toLocaleString('es-CR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </Surface>

        {/* Altitudinal Gradient Strip of Corredor Biológico Los Santos */}
        <Surface className="divide-y divide-border overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Zonas de vida Holdridge monitoreadas en Los Santos
              </h2>
              <p className="text-xs text-muted">
                Gradiente altitudinal (800 – 3 500 m s.n.m.) con conteo actual de
                especies y avistamientos
              </p>
            </div>
            <span className="font-mono text-xs text-muted">
              Holdridge 1967 · CBLS
            </span>
          </div>

          <div className="divide-y divide-border sm:grid sm:grid-cols-5 sm:divide-x sm:divide-y-0">
            {HOLDRIDGE_ZONES.map((zone) => {
              const zoneSightings = sightings.filter(
                (o) => o.holdridgeZone === zone.id,
              );
              const zoneSightingCount = zoneSightings.length;
              const zoneSpeciesCount = new Set(
                zoneSightings.map((o) => o.speciesId),
              ).size;
              return (
                <div key={zone.id} className="p-4">
                  <p className="font-mono text-xs text-primary">
                    {zone.minElevation}–{zone.maxElevation} m
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-foreground">
                    {zone.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {zone.meanTempC} · {zone.annualRainMm}
                  </p>
                  <p className="mt-2.5 font-mono text-xs text-foreground">
                    {zoneSpeciesCount} esp. · {zoneSightingCount} avist.
                  </p>
                </div>
              );
            })}
          </div>
        </Surface>
      </div>
    </div>
  );
};
