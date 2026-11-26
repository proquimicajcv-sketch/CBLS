import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  ChevronDown,
  ChevronUp,
  Crown,
  Lock,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import type { SightingEntry, SpeciesRecord, UserSession } from '../types/cbls';
import {
  buildBrigadistaLeaderboard,
  calcularRangoBrigadista,
  normalizeObserverName,
  RANGOS_CBLS,
  type BrigadistaLeaderboardEntry,
  type RangoCBLS,
} from '../utils/ranks';
import { Surface } from './ui';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

/**
 * Custom botanical / ecological circular emblem SVG for each of the 13 CBLS ranks.
 * Rendered automatically when no custom `/img/<archivo>.(jpg|jpeg|png|webp)` file is present.
 */
const RankCrestSvg: React.FC<{ rango: RangoCBLS; className?: string }> = ({
  rango,
  className = 'h-full w-full',
}) => {
  const gradId = `cbls-badge-grad-${rango.archivo}`;
  const ringGradId = `cbls-badge-ring-${rango.archivo}`;

  const renderSymbol = () => {
    switch (rango.archivo) {
      case 'brote_roble':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M32 49V29" />
            <path d="M32 35C24 35 19 28 21 20C28 20 32 25 32 32" fill={rango.accentHex} fillOpacity="0.22" />
            <path d="M32 31C39 30 44 24 43 17C36 17 32 22 32 29" fill={rango.accentHex} fillOpacity="0.32" />
            <path d="M22 49H42" strokeOpacity="0.7" />
          </g>
        );
      case 'semilla_roble':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M32 14V19" />
            <path d="M21 26C21 21 26 19 32 19C38 19 43 21 43 26Z" fill={rango.accentHex} fillOpacity="0.35" />
            <path d="M23 26V34C23 41 27 46 32 48C37 46 41 41 41 34V26" fill={rango.accentHex} fillOpacity="0.16" />
            <path d="M25 23L39 23" strokeOpacity="0.65" />
          </g>
        );
      case 'voz_quebrada':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M16 39C20 35 24 35 28 39C32 43 36 43 40 39C43 36 46 36 48 38" />
            <path d="M18 46C22 43 26 43 30 46C34 49 38 49 42 46C44 44 46 44 47 45" strokeOpacity="0.7" />
            <path d="M25 25C28 21 36 21 39 25" />
            <path d="M21 20C27 14 37 14 43 20" strokeOpacity="0.65" />
            <circle cx="32" cy="29" r="3" fill={rango.accentHex} />
          </g>
        );
      case 'guardian_quebrada':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M32 14L46 20V32C46 41 39 47 32 50C25 47 18 41 18 32V20L32 14Z" fill={rango.accentHex} fillOpacity="0.16" />
            <path d="M24 33C27 30 30 30 32 33C34 36 37 36 40 33" />
            <path d="M32 21C29 25 29 28 32 28C35 28 35 25 32 21Z" fill={rango.accentHex} fillOpacity="0.45" />
          </g>
        );
      case 'rastreador_cafetal':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <circle cx="32" cy="37" r="6" fill={rango.accentHex} fillOpacity="0.24" />
            <circle cx="22" cy="28" r="3.2" fill={rango.accentHex} fillOpacity="0.35" />
            <circle cx="28" cy="21" r="3.2" fill={rango.accentHex} fillOpacity="0.35" />
            <circle cx="36" cy="21" r="3.2" fill={rango.accentHex} fillOpacity="0.35" />
            <circle cx="42" cy="28" r="3.2" fill={rango.accentHex} fillOpacity="0.35" />
            <path d="M20 47H44" strokeOpacity="0.55" />
          </g>
        );
      case 'vigia_cafetal':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <circle cx="24" cy="34" r="7.5" fill={rango.accentHex} fillOpacity="0.18" />
            <circle cx="40" cy="34" r="7.5" fill={rango.accentHex} fillOpacity="0.18" />
            <path d="M31.5 34H32.5" />
            <path d="M20 27L25 19H30" />
            <path d="M44 27L39 19H34" />
            <circle cx="24" cy="34" r="2.3" fill={rango.accentHex} />
            <circle cx="40" cy="34" r="2.3" fill={rango.accentHex} />
          </g>
        );
      case 'oido_montana':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M15 44L27 25L35 37L41 29L49 44Z" fill={rango.accentHex} fillOpacity="0.18" />
            <path d="M23 18C28 14 36 14 41 18" />
            <path d="M27 22C30 20 34 20 37 22" />
            <path d="M19 48H45" strokeOpacity="0.55" />
          </g>
        );
      case 'ojo_clinico':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M14 32C19 23 25 20 32 20C39 20 45 23 50 32C45 41 39 44 32 44C25 44 19 41 14 32Z" fill={rango.accentHex} fillOpacity="0.14" />
            <circle cx="32" cy="32" r="7" fill={rango.accentHex} fillOpacity="0.28" />
            <circle cx="32" cy="32" r="2.8" fill={rango.accentHex} />
            <path d="M32 14V17M32 47V50M14 32H11M53 32H50" strokeOpacity="0.7" />
          </g>
        );
      case 'explorador_nuboso':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M21 31H44C47 31 49 29 49 26C49 23 46.5 21 43.5 21C42.5 17 39 14.5 34.5 14.5C30.5 14.5 27 17 26 20.5C22.5 20.5 19.5 23 19.5 26.5C19.5 29 20 31 21 31Z" fill={rango.accentHex} fillOpacity="0.2" />
            <circle cx="32" cy="41" r="8" />
            <path d="M32 35L35 41L32 47L29 41Z" fill={rango.accentHex} fillOpacity="0.55" />
          </g>
        );
      case 'caminante_robledal':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M32 14C24 14 19 20 20 28C18 30 18 35 23 36H41C46 35 46 30 44 28C45 20 40 14 32 14Z" fill={rango.accentHex} fillOpacity="0.2" />
            <path d="M32 36V49" />
            <path d="M27 49H37" />
            <path d="M32 25L27 29M32 28L37 31" strokeOpacity="0.8" />
          </g>
        );
      case 'tejedor_corredor':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <circle cx="20" cy="23" r="4" fill={rango.accentHex} fillOpacity="0.3" />
            <circle cx="44" cy="23" r="4" fill={rango.accentHex} fillOpacity="0.3" />
            <circle cx="32" cy="32" r="5" fill={rango.accentHex} fillOpacity="0.45" />
            <circle cx="20" cy="43" r="4" fill={rango.accentHex} fillOpacity="0.3" />
            <circle cx="44" cy="43" r="4" fill={rango.accentHex} fillOpacity="0.3" />
            <path d="M23.5 25.5L28 29M40.5 25.5L36 29M23.5 40.5L28 35.5M40.5 40.5L36 35.5M24 23H40M24 43H40" />
          </g>
        );
      case 'custodio_talamanca':
        return (
          <g stroke={rango.accentHex} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M13 44L25 22L33 34L40 20L51 44Z" fill={rango.accentHex} fillOpacity="0.22" />
            <path d="M22 27L25 29L28 27" />
            <path d="M37 25L40 27L43 25" />
            <path d="M27 15L32 11L37 15" />
            <path d="M16 48H48" strokeOpacity="0.65" />
          </g>
        );
      case 'espiritu_paramo':
      default:
        return (
          <g stroke={rango.accentHex} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <circle cx="32" cy="29" r="7" fill={rango.accentHex} fillOpacity="0.32" />
            <path d="M32 13V18M32 40V45M16 29H21M43 29H48M20.5 17.5L24 21M40 37L43.5 40.5M43.5 17.5L40 21M24 37L20.5 40.5" />
            <path d="M16 47L26 39L32 44L38 39L48 47" />
          </g>
        );
    }
  };

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={gradId} cx="35%" cy="28%" r="75%">
          <stop offset="0%" stopColor={rango.ringHex} stopOpacity="0.34" />
          <stop offset="65%" stopColor="#091f17" stopOpacity="0.96" />
          <stop offset="100%" stopColor="#040d0a" stopOpacity="1" />
        </radialGradient>
        <linearGradient id={ringGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={rango.accentHex} />
          <stop offset="100%" stopColor={rango.ringHex} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30.5" fill={`url(#${gradId})`} stroke={`url(#${ringGradId})`} strokeWidth="2.5" />
      <circle cx="32" cy="32" r="26" fill="none" stroke={rango.accentHex} strokeOpacity="0.22" strokeWidth="1" strokeDasharray="3 3" />
      {renderSymbol()}
    </svg>
  );
};

/**
 * Circular badge image that tries `/img/<archivo>.(jpg|jpeg|png|webp)` in order
 * (matching user-uploaded custom artwork) and seamlessly falls back to the bespoke SVG crest.
 */
export const RankBadgeAvatar: React.FC<{
  rango: RangoCBLS;
  sizeClass?: string;
  locked?: boolean;
  showLevelPill?: boolean;
}> = ({
  rango,
  sizeClass = 'w-16 h-16',
  locked = false,
  showLevelPill = true,
}) => {
  const [extIdx, setExtIdx] = useState<number>(0);

  useEffect(() => {
    setExtIdx(0);
  }, [rango.archivo]);

  const useSvgFallback = extIdx >= IMAGE_EXTENSIONS.length;
  const imgSrc = useSvgFallback
    ? ''
    : `/img/${rango.archivo}.${IMAGE_EXTENSIONS[extIdx]}`;

  return (
    <div className="relative shrink-0">
      <div
        className={`${sizeClass} overflow-hidden rounded-full border-2 shadow-md transition ${
          locked
            ? 'border-emerald-900/70 grayscale opacity-60'
            : 'border-emerald-400/75 shadow-emerald-950/60'
        }`}
      >
        {useSvgFallback ? (
          <RankCrestSvg rango={rango} />
        ) : (
          <img
            src={imgSrc}
            alt={`Insignia ${rango.titulo}`}
            onError={() => setExtIdx((prev) => prev + 1)}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {showLevelPill && (
        <span
          className={`absolute -bottom-1 -right-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none shadow ${
            locked
              ? 'border-emerald-900 bg-[#071711] text-emerald-300/60'
              : 'border-emerald-300/80 bg-emerald-600 text-white'
          }`}
        >
          N{rango.nivel}
        </span>
      )}
    </div>
  );
};

interface BrigadistaRankCardProps {
  memberName: string;
  totalSightings: number;
  isCurrentUser?: boolean;
  defaultOpen?: boolean;
  onRequestSignIn?: () => void;
  showSignInPrompt?: boolean;
  onResetToSelf?: () => void;
}

export const BrigadistaRankCard: React.FC<BrigadistaRankCardProps> = ({
  memberName,
  totalSightings,
  isCurrentUser = true,
  defaultOpen = false,
  onRequestSignIn,
  showSignInPrompt = false,
  onResetToSelf,
}) => {
  const [vitrinaOpen, setVitrinaOpen] = useState<boolean>(defaultOpen);
  const progress = useMemo(
    () => calcularRangoBrigadista(totalSightings),
    [totalSightings],
  );

  return (
    <div className="space-y-3 text-emerald-50">
      {/* 1. Tarjeta principal del rango actual del brigadista */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setVitrinaOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setVitrinaOpen((prev) => !prev);
          }
        }}
        title="Haz clic para ver las 13 insignias de la Brigada CBLS"
        className="flex cursor-pointer flex-col gap-3.5 rounded-2xl border border-emerald-800/70 bg-[#091a14] p-3.5 transition hover:border-emerald-500/60 hover:bg-[#0d241c] sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Insignia circular */}
          <RankBadgeAvatar
            rango={progress.actual}
            sizeClass="w-16 h-16"
            locked={progress.conteo === 0}
            showLevelPill
          />

          {/* Datos del rango + contador en tiempo real + barra de progreso */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  {isCurrentUser ? 'Tu Rango Brigadista' : `Rango de ${memberName}`}
                </span>
                {isCurrentUser && memberName && (
                  <span className="truncate rounded-full border border-emerald-700/60 bg-emerald-950/70 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                    {memberName}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-900/60 px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {progress.conteo} {progress.conteo === 1 ? 'avistamiento' : 'avistamientos'}
                </span>
              </div>
            </div>

            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <h4 className="truncate text-base font-bold text-white sm:text-lg">
                {progress.actual.titulo}
              </h4>
              <span className="text-[11px] text-emerald-300/75">
                · {progress.desbloqueados}/13 medallas
              </span>
            </div>

            {/* Barra de progreso al siguiente nivel */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-emerald-900 bg-[#05100c]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-300 transition-all duration-500"
                style={{ width: `${progress.porcentaje}%` }}
              />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-300/80">
              <span>{progress.mensajeProgreso}</span>
              <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-400">
                {vitrinaOpen ? 'Ocultar medallas' : 'Ver medallas'}
                {vitrinaOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </span>
            </div>
          </div>
        </div>

        {(showSignInPrompt && onRequestSignIn) || onResetToSelf ? (
          <div
            className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end"
            onClick={(e) => e.stopPropagation()}
          >
            {showSignInPrompt && onRequestSignIn && (
              <button
                type="button"
                onClick={onRequestSignIn}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Identificarme
              </button>
            )}
            {onResetToSelf && (
              <button
                type="button"
                onClick={onResetToSelf}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-700/70 bg-emerald-950/70 px-2.5 py-1 text-[11px] font-medium text-emerald-200 transition hover:border-emerald-400/60"
              >
                Volver a mi rango
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* 2. Vitrina desplegable con las 13 insignias */}
      {vitrinaOpen && (
        <div className="rounded-2xl border border-emerald-800/60 bg-[#071711] p-4 shadow-xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-emerald-900/60 pb-2.5">
            <div>
              <h5 className="flex items-center gap-2 text-sm font-bold text-emerald-200">
                <Award className="h-4 w-4 text-emerald-400" />
                Escalafón de la Brigada CBLS (13 Rangos)
              </h5>
              <p className="text-[11px] text-emerald-300/70">
                Progreso en tiempo real de{' '}
                <strong className="text-emerald-100">{memberName || 'Brigadista'}</strong> ·{' '}
                {progress.desbloqueados} de 13 insignias desbloqueadas
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVitrinaOpen(false)}
              className="rounded-lg border border-emerald-800/70 bg-[#0b1f18] px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:border-emerald-500/60 hover:text-white"
            >
              Cerrar ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {RANGOS_CBLS.map((r) => {
              const desbloqueado = progress.conteo >= r.min;
              const esActual = progress.conteo > 0 && progress.actual.nivel === r.nivel;
              const rangoTexto =
                r.max === Infinity ? `${r.min}+` : `${r.min}–${r.max}`;

              return (
                <div
                  key={r.nivel}
                  className={`relative flex flex-col items-center rounded-xl border p-3 text-center transition ${
                    esActual
                      ? 'border-emerald-400 bg-emerald-900/45 shadow-lg shadow-emerald-950/60 ring-1 ring-emerald-400/50'
                      : desbloqueado
                        ? 'border-emerald-700/60 bg-[#0b1f18]'
                        : 'border-emerald-900/40 bg-[#06120e] opacity-60'
                  }`}
                >
                  {esActual && (
                    <span className="absolute right-2 top-2 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">
                      Actual
                    </span>
                  )}

                  <RankBadgeAvatar
                    rango={r}
                    sizeClass="w-16 h-16"
                    locked={!desbloqueado}
                    showLevelPill
                  />

                  <span className="mt-2 text-xs font-bold leading-tight text-white">
                    {r.titulo}
                  </span>

                  <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-300/80">
                    {desbloqueado ? (
                      <>
                        <Sparkles className="h-3 w-3 text-emerald-400" />
                        Desbloqueado ({rangoTexto})
                      </>
                    ) : (
                      <>
                        <Lock className="h-2.5 w-2.5 text-emerald-500/70" />
                        Meta: {rangoTexto} avist.
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

interface BrigadistaLeaderboardProps {
  species: SpeciesRecord[];
  sightings: SightingEntry[];
  currentUser?: UserSession | null;
}

export const BrigadistaLeaderboard: React.FC<BrigadistaLeaderboardProps> = ({
  species,
  sightings,
  currentUser,
}) => {
  const [showFullTeam, setShowFullTeam] = useState<boolean>(true);
  const [inspectedKey, setInspectedKey] = useState<string | null>(null);

  const currentUserKey = currentUser?.observerName
    ? normalizeObserverName(currentUser.observerName)
    : null;

  const leaderboard = useMemo(
    () =>
      buildBrigadistaLeaderboard(sightings, species, {
        includeRegisteredTeam: showFullTeam,
      }),
    [sightings, species, showFullTeam],
  );

  const activeContributorsCount = useMemo(
    () => leaderboard.filter((entry) => entry.sightingsCount > 0).length,
    [leaderboard],
  );

  const maxSightings = Math.max(
    1,
    ...leaderboard.map((entry) => entry.sightingsCount),
  );

  const inspectedEntry: BrigadistaLeaderboardEntry | null = useMemo(() => {
    if (inspectedKey) {
      return leaderboard.find((e) => e.key === inspectedKey) ?? null;
    }
    if (currentUserKey) {
      return leaderboard.find((e) => e.key === currentUserKey) ?? null;
    }
    return leaderboard[0] ?? null;
  }, [inspectedKey, currentUserKey, leaderboard]);

  const isViewingSelf =
    !!inspectedEntry && !!currentUserKey && inspectedEntry.key === currentUserKey;

  return (
    <div className="space-y-4">
      {/* Selected / Current Brigadista Rank Card + 13 Badges Showcase */}
      {inspectedEntry && (
        <BrigadistaRankCard
          memberName={inspectedEntry.name}
          totalSightings={inspectedEntry.sightingsCount}
          isCurrentUser={isViewingSelf}
          onResetToSelf={
            inspectedKey && currentUserKey && inspectedKey !== currentUserKey
              ? () => setInspectedKey(null)
              : undefined
          }
        />
      )}

      {/* Real-Time Leaderboard Surface */}
      <Surface className="overflow-hidden divide-y divide-border">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-300" />
              <h2 className="text-base font-semibold text-foreground">
                Ranking de Brigadistas — Conteos en Tiempo Real
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-950/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                EN VIVO
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {activeContributorsCount} brigadista(s) con registros activos ·{' '}
              {sightings.length} avistamiento(s) totales · Haz clic en cualquier persona para ver sus 13 insignias
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-emerald-900/70 bg-[#071711] p-1">
            <button
              type="button"
              onClick={() => setShowFullTeam(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                showFullTeam
                  ? 'bg-emerald-600/30 text-emerald-100 border border-emerald-500/40'
                  : 'text-emerald-300/70 hover:text-emerald-100'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Equipo CBLS ({leaderboard.length})
            </button>
            <button
              type="button"
              onClick={() => setShowFullTeam(false)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                !showFullTeam
                  ? 'bg-emerald-600/30 text-emerald-100 border border-emerald-500/40'
                  : 'text-emerald-300/70 hover:text-emerald-100'
              }`}
            >
              Con registros ({activeContributorsCount})
            </button>
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
            Aún no hay brigadistas con avistamientos registrados. Registra el primero para inaugurar el escalafón.
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {leaderboard.map((entry, idx) => {
              const rankPos = idx + 1;
              const isSelf = currentUserKey === entry.key;
              const isSelected = inspectedEntry?.key === entry.key;
              const relativeWidth =
                entry.sightingsCount > 0
                  ? Math.max(8, Math.round((entry.sightingsCount / maxSightings) * 100))
                  : 0;

              const positionBadgeStyle =
                rankPos === 1 && entry.sightingsCount > 0
                  ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                  : rankPos === 2 && entry.sightingsCount > 0
                    ? 'border-slate-300/60 bg-slate-400/20 text-slate-100'
                    : rankPos === 3 && entry.sightingsCount > 0
                      ? 'border-orange-400/60 bg-orange-500/20 text-orange-200'
                      : 'border-emerald-800/70 bg-[#071711] text-emerald-300/80';

              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setInspectedKey(entry.key)}
                  className={`flex w-full flex-col gap-3 px-4 py-3.5 text-left transition sm:flex-row sm:items-center sm:px-5 ${
                    isSelected
                      ? 'bg-emerald-950/55 ring-1 ring-inset ring-emerald-500/40'
                      : 'hover:bg-foreground/5'
                  }`}
                >
                  {/* Position + Badge + Identity */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold ${positionBadgeStyle}`}
                    >
                      {rankPos === 1 && entry.sightingsCount > 0 ? (
                        <Crown className="h-4 w-4 text-amber-300" />
                      ) : (
                        `#${rankPos}`
                      )}
                    </div>

                    <RankBadgeAvatar
                      rango={entry.progress.actual}
                      sizeClass="w-11 h-11"
                      locked={entry.sightingsCount === 0}
                      showLevelPill
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-foreground">
                          {entry.name}
                        </span>
                        {isSelf && (
                          <span className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                            Tú
                          </span>
                        )}
                        {entry.isAdmin && (
                          <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                            Coord.
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-emerald-300/85">
                        <span className="font-medium">
                          {entry.sightingsCount > 0
                            ? entry.progress.actual.titulo
                            : 'Sin iniciar (Meta: Brote de Roble)'}
                        </span>
                        <span className="text-muted">·</span>
                        <span className="text-[11px] text-muted">
                          {entry.progress.desbloqueados}/13 insignias
                        </span>
                      </div>

                      {/* Relative contribution bar */}
                      <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[#06120e]">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            rankPos === 1 && entry.sightingsCount > 0
                              ? 'bg-gradient-to-r from-amber-400 to-emerald-300'
                              : 'bg-gradient-to-r from-emerald-500 to-green-300'
                          }`}
                          style={{ width: `${relativeWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Real-time Counters */}
                  <div className="flex shrink-0 items-center justify-between gap-4 border-t border-emerald-900/40 pt-2.5 sm:justify-end sm:border-t-0 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <p className="font-display text-xl font-bold tabular-nums text-emerald-200 leading-none">
                        {entry.sightingsCount}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                        avist.
                      </p>
                    </div>

                    <div className="h-7 w-px bg-border/60" />

                    <div className="text-left sm:text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums text-foreground leading-none">
                        {entry.individualsCount}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                        ind.
                      </p>
                    </div>

                    <div className="h-7 w-px bg-border/60" />

                    <div className="text-left sm:text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums text-secondary leading-none">
                        {entry.distinctSpeciesCount}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                        esp.
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Surface>
    </div>
  );
};
