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
      {/* Hero & Core Dashboard Stage with Centered Puma Face Backdrop */}
      <section className="relative overflow-hidden border-b border-primary/15">
        {/* Background Puma Face Image */}
        <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
          <img
            src={pumaBackdrop}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover object-center opacity-55 brightness-95 contrast-105"
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(3,15,10,0.28)_0%,rgba(3,15,10,0.78)_70%,#030F0A_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#030F0A]/75 via-transparent to-[#030F0A]" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 pb-8 pt-5 sm:px-6 sm:pt-7">
          {/* Institutional Header Row */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-[#051810]/90 p-1.5">
                <svg viewBox="0 0 44 44" aria-hidden="true" className="h-full w-full">
                  <path
                    d="M6 34 L16 16 L24 26 L31 11 L38 34 Z"
                    fill="#0D3826"
                    stroke="#86E5B0"
                    strokeWidth="2.2"
                    strokeLinejoin="round"
                  />
                  <circle cx="31" cy="11" r="3" fill="#86E5B0" />
                  <path
                    d="M8 37 Q22 33 36 37"
                    fill="none"
                    stroke="#34D399"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold tracking-widest text-primary">
                  REPÚBLICA DE COSTA RICA
                </p>
                <p className="truncate text-xs text-foreground/90 sm:text-sm">
                  Sistema de Bitácora de Campo &amp; Taxonomía |{' '}
                  <span className="font-semibold text-primary">
                    Corredor Biológico Los Santos
                  </span>
                </p>
              </div>
            </div>

            {/* Compact Status & Session Action Badges (Never displays access codes) */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onRequestUserSession}
                title="Cambiar persona o código de acceso"
                className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-primary/25 bg-[#05150E]/90 px-3.5 py-1.5 text-left transition-colors hover:border-primary/55"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <UserCheck className="h-3.5 w-3.5" />
                </span>
                <span className="leading-tight">
                  <span className="block font-mono text-[9px] uppercase tracking-wider text-muted">
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
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/25 bg-[#05150E]/90 px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/55"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    effectiveOffline ? 'bg-coral' : 'bg-secondary'
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
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/25 bg-[#05150E]/90 px-3.5 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/55"
              >
                {effectiveOffline ? (
                  <WifiOff className="h-3.5 w-3.5 text-coral" />
                ) : (
                  <Wifi className="h-3.5 w-3.5 text-primary" />
                )}
                <span>
                  {pendingSyncCount > 0
                    ? `${pendingSyncCount} en cola · #${checksum.slice(0, 6)}`
                    : `Sincronizado · #${checksum.slice(0, 6)}`}
                </span>
              </button>

              {pwaInstallSlot}
            </div>
          </div>

          {/* Hero Title & CBLS Scope Description */}
          <div className="max-w-2xl space-y-2 pt-1">
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-primary sm:text-6xl">
              Bitácora CBLS
            </h1>
            <p className="text-sm leading-relaxed text-foreground/90 sm:text-base">
              Plataforma de campo para el inventario biológico en el{' '}
              <strong className="font-semibold text-foreground">
                Corredor Biológico Los Santos
              </strong>
              .
              <br />
              Gradiente altitudinal (800 – 3 500 m s.n.m.) y monitoreo de{' '}
              <span className="italic text-primary">Puma concolor</span>, flora
              y fauna en Talamanca.
            </p>
          </div>

          {/* Unified 3-Column Dark Stat Strip matching Reference Screenshot */}
          <div className="grid grid-cols-1 divide-y divide-primary/15 overflow-hidden rounded-xl border border-primary/20 bg-[#030D08]/88 backdrop-blur-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted">
                Especies
              </span>
              <span className="mt-2 font-display text-4xl font-bold tabular-nums text-foreground sm:text-[2.75rem]">
                {species.length}
              </span>
              <span className="mt-1.5 text-[11px] text-muted">
                {faunaCount} fauna · {floraCount} flora ·{' '}
                <span className="text-coral">{threatenedCount} UICN</span>
              </span>
            </div>

            <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-primary">
                Avistamientos
              </span>
              <span className="mt-2 font-display text-4xl font-bold tabular-nums text-foreground sm:text-[2.75rem]">
                {sightings.length}
              </span>
              <span className="mt-1.5 text-[11px] text-muted">
                IndexedDB autónomo · {HOLDRIDGE_ZONES.length} zonas Holdridge
              </span>
            </div>

            <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted">
                Individuos
              </span>
              <span className="mt-2 font-display text-4xl font-bold tabular-nums text-foreground sm:text-[2.75rem]">
                {totalIndividuals}
              </span>
              <span className="mt-1.5 text-[11px] text-muted">
                especímenes contabilizados en sitio
              </span>
            </div>
          </div>

          {/* Horizontal Featured Species Card (or Empty State from 0) */}
          {featuredSpecies ? (
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-primary/20 bg-[#030D08]/90 px-5 py-4 backdrop-blur-sm md:flex-row md:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-primary/30 bg-[#071912]">
                  <SpecimenImage
                    src={featuredSpecies.photoUrl}
                    alt={`${featuredSpecies.commonName} (${featuredSpecies.scientificName})`}
                    scientificName={featuredSpecies.scientificName}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="truncate text-base font-bold text-foreground sm:text-lg">
                    <span className="italic text-primary">
                      {featuredSpecies.scientificName}
                    </span>{' '}
                    <span className="text-muted/60">|</span>{' '}
                    <span>{featuredSpecies.commonName}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenSpeciesDetail(featuredSpecies.id)}
                      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-primary/35 bg-[#103D2A] px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-[#16533A]"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
                      Abrir Ficha Científica
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuickSighting(featuredSpecies.id)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-[#071912] px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/45"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Avistamiento
                    </button>
                    {(featuredSpecies.bioacoustics.hasCall ||
                      featuredSpecies.bioacoustics.audioUrl) && (
                      <button
                        type="button"
                        onClick={() => handleToggleAudio(featuredSpecies)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-[#071912] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/45"
                      >
                        {playingId === featuredSpecies.id ? (
                          <>
                            <Square className="h-3 w-3 text-coral" />
                            Detener
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5 text-primary" />
                            Canto
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 md:flex-col md:items-end">
                <span className="rounded-full border border-border bg-[#071A12] px-3.5 py-1.5 font-mono text-xs text-muted">
                  CAT. {featuredSpecies.catalogCode}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  UICN {featuredSpecies.iucn} · {featuredSpecies.elevationM} m
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-primary/20 bg-[#030D08]/90 px-5 py-4 backdrop-blur-sm md:flex-row md:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-[#082418] text-primary">
                  <FilePlus2 className="h-6 w-6" />
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-base font-bold text-foreground sm:text-lg">
                    <span className="italic text-primary">
                      Inventario desde 0
                    </span>{' '}
                    <span className="text-muted/60">|</span>{' '}
                    <span>Comienza tu catálogo de campo</span>
                  </p>
                  <button
                    type="button"
                    onClick={onOpenNewSpecies}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-primary/35 bg-[#103D2A] px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-[#16533A]"
                  >
                    <FilePlus2 className="h-3.5 w-3.5 text-primary" />
                    Agregar Primera Especie (URL y Ficha)
                  </button>
                </div>
              </div>

              <span className="self-start rounded-full border border-border bg-[#071A12] px-3.5 py-1.5 font-mono text-xs text-muted md:self-center">
                CAT. CBLS-0000
              </span>
            </div>
          )}

          {/* 4-Card Quick Action Grid matching Reference Screenshot */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => onNavigate('mapa')}
              className="flex items-center gap-3.5 rounded-xl border border-primary/18 bg-[#05140D]/90 px-4 py-4 text-left backdrop-blur-sm transition-colors hover:border-primary/45"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-[#0A2016] text-muted">
                <Compass className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">
                  Mapa SIG
                </span>
                <span className="block truncate text-xs text-muted">
                  Satélite, calles y GPS exacto
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenNewSpecies}
              className="flex items-center gap-3.5 rounded-xl border border-primary/30 bg-[#082A1C]/90 px-4 py-4 text-left backdrop-blur-sm transition-colors hover:border-primary/60 hover:bg-[#0B3524]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-[#0E3F2B] text-primary">
                <FilePlus2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">
                  + Agregar Especie
                </span>
                <span className="block truncate text-xs text-muted">
                  Nueva ficha en lista
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('coleccion')}
              className="flex items-center gap-3.5 rounded-xl border border-primary/18 bg-[#05140D]/90 px-4 py-4 text-left backdrop-blur-sm transition-colors hover:border-primary/45"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-[#0A2016] text-muted">
                <LayoutGrid className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">
                  Colección
                </span>
                <span className="block truncate text-xs text-muted">
                  {species.length} especies catalogadas
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('estadistica')}
              className="flex items-center gap-3.5 rounded-xl border border-primary/30 bg-[#082A1C]/90 px-4 py-4 text-left backdrop-blur-sm transition-colors hover:border-primary/60 hover:bg-[#0B3524]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-[#0E3F2B] text-primary">
                <BarChart3 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">
                  Estadística
                </span>
                <span className="block truncate text-xs text-muted">
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
