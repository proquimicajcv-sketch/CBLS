import React, { useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Camera,
  Compass,
  FilePlus2,
  History,
  LayoutGrid,
  Plus,
  Square,
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
  pendingSyncCount: number;
  checksum: string;
  pwaInstallSlot?: React.ReactNode;
  onRequestUserSession: () => void;
  onNavigate: (module: AppModuleId) => void;
  onOpenSpeciesDetail: (speciesId: string) => void;
  onOpenNewSpecies: () => void;
  onQuickSighting: (speciesId?: string) => void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  species,
  sightings,
  changeLogs,
  totalIndividuals,
  currentUser,
  effectiveOffline,
  pendingSyncCount,
  checksum,
  pwaInstallSlot,
  onRequestUserSession,
  onNavigate,
  onOpenSpeciesDetail,
  onOpenNewSpecies,
  onQuickSighting,
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [stopAudioFn, setStopAudioFn] = useState<(() => void) | null>(null);
  const [activityTab, setActivityTab] = useState<'sightings' | 'history'>(
    'sightings',
  );

  const featuredSpecies = species[0] ?? null;

  const faunaCount = species.filter((s) => s.taxon !== 'Plantas').length;
  const floraCount = species.filter((s) => s.taxon === 'Plantas').length;
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
                      effectiveOffline ? 'bg-coral' : 'bg-[#6EE7B7]'
                    }`}
                  />
                  <span>
                    {effectiveOffline
                      ? 'Modo Offline Autónomo'
                      : 'En vivo · Colaboración Activa'}
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
                {faunaCount} fauna · {floraCount} flora ·{' '}
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
                <span className="font-mono text-[11px] text-white/65">
                  UICN {featuredSpecies.iucn} · {featuredSpecies.elevationM} m
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
                    <span>Comienza tu catálogo de campo</span>
                  </p>
                  <button
                    type="button"
                    onClick={onOpenNewSpecies}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#A7E8C3]/30 bg-[#123326]/90 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#194735]"
                  >
                    <FilePlus2 className="h-3.5 w-3.5 text-[#B8EBD0]" />
                    Agregar Primera Especie (URL y Ficha)
                  </button>
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
              onClick={onOpenNewSpecies}
              className="flex items-center gap-3.5 rounded-xl border border-[#A7E8C3]/25 bg-[#0A2017]/74 px-4 py-4 text-left backdrop-blur-sm transition-colors hover:border-[#A7E8C3]/50 hover:bg-[#0E2B1F]/85"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#A7E8C3]/25 bg-[#123326] text-[#B8EBD0]">
                <FilePlus2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">
                  + Agregar Especie
                </span>
                <span className="block truncate text-xs text-white/70">
                  Nueva ficha en lista
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
                Actividad en el corredor
              </h2>
              <p className="text-xs text-muted">
                Registro colaborativo por nombre de observador en tiempo real
              </p>
            </div>

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
                Avistamientos ({sightings.length})
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

          <div className="divide-y divide-border">
            {activityTab === 'sightings' ? (
              sightings.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted">
                  No hay avistamientos registrados todavía. Usa el botón{' '}
                  <strong className="text-primary">+</strong> en la barra
                  inferior o selecciona un punto exacto en el Mapa SIG.
                </div>
              ) : (
                sightings.slice(0, 6).map((obs) => {
                  const sp = speciesMap.get(obs.speciesId);
                  return (
                    <button
                      key={obs.id}
                      type="button"
                      onClick={() => sp && onOpenSpeciesDetail(sp.id)}
                      className="flex w-full items-start justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="max-w-[180px] truncate font-semibold text-primary">
                            {obs.observer}
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
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                          <span>{obs.weatherCondition}</span>
                          {obs.photoUrl && (
                            <Camera className="h-3 w-3 text-secondary" />
                          )}
                          {obs.videoUrl && (
                            <Video className="h-3 w-3 text-primary" />
                          )}
                          {obs.audioUrl && (
                            <Volume2 className="h-3 w-3 text-coral" />
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right font-mono text-xs">
                        <span className="font-semibold text-primary">
                          {obs.individualCount} ind.
                        </span>
                        <p className="mt-0.5 text-muted">{obs.elevationM} m</p>
                        <p className="text-muted/80">{obs.observedDate}</p>
                      </div>
                    </button>
                  );
                })
              )
            ) : changeLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                Aún no hay cambios registrados en el historial. Cada alta,
                edición o avistamiento guardará únicamente el nombre de la
                persona.
              </div>
            ) : (
              changeLogs.slice(0, 8).map((log) => (
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
              const zoneSpeciesCount = species.filter(
                (s) => s.holdridgeZone === zone.id,
              ).length;
              const zoneSightingCount = sightings.filter(
                (o) => o.holdridgeZone === zone.id,
              ).length;
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
