import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Compass, Eye, Headphones, MapPin, Search, Users, Video, X } from 'lucide-react';
import type {
  HoldridgeZoneId,
  SightingEntry,
  SightingObservationMethod,
  SpeciesRecord,
  UserSession,
} from '../types/cbls';
import {
  detectHoldridgeZoneByElevation,
  estimateCblsElevationFromCoords,
  HOLDRIDGE_ZONES,
} from '../utils/ecology';
import { Button, Field, inputClassName, StepperInput, Surface } from './ui';

interface SightingModalProps {
  open: boolean;
  speciesList: SpeciesRecord[];
  initialSpeciesId?: string;
  presetCoords?: {
    latitude: number;
    longitude: number;
    elevationM: number;
    holdridgeZone: HoldridgeZoneId;
    localityHint?: string;
  } | null;
  currentUser: UserSession | null;
  onRequestUserSession: () => void;
  onClose: () => void;
  onSave: (entry: Omit<SightingEntry, 'id' | 'occurrenceId' | 'synced' | 'createdAt'>) => void;
}

export const SightingModal: React.FC<SightingModalProps> = ({
  open,
  speciesList,
  initialSpeciesId,
  presetCoords,
  currentUser,
  onRequestUserSession,
  onClose,
  onSave,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  const defaultSp =
    speciesList.find((s) => s.id === initialSpeciesId) ?? speciesList[0];

  const [speciesId, setSpeciesId] = useState<string>(defaultSp?.id ?? '');
  const [speciesSearch, setSpeciesSearch] = useState<string>('');
  const [individualCount, setIndividualCount] = useState<number>(1);
  const [observationMethod, setObservationMethod] =
    useState<SightingObservationMethod>('En persona');
  const [sourceDetail, setSourceDetail] = useState<string>('');
  const [observedDate, setObservedDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [observedTime, setObservedTime] = useState<string>(() => {
    const d = new Date();
    return d.toTimeString().slice(0, 5);
  });

  const [latitude, setLatitude] = useState<number>(
    presetCoords?.latitude ?? 9.5525,
  );
  const [longitude, setLongitude] = useState<number>(
    presetCoords?.longitude ?? -83.8065,
  );
  const [elevationM, setElevationM] = useState<number>(
    presetCoords?.elevationM ?? 2240,
  );
  const [holdridgeZone, setHoldridgeZone] = useState<HoldridgeZoneId>(
    presetCoords?.holdridgeZone ?? 'bp-MB',
  );
  const [locality, setLocality] = useState<string>(
    presetCoords?.localityHint ?? '',
  );
  const [microhabitat, setMicrohabitat] = useState<string>(
    'Sotobosque húmedo sobre vegetación epífita',
  );
  const [weatherCondition, setWeatherCondition] =
    useState<SightingEntry['weatherCondition']>('Neblina montana');

  // Media URLs
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string>('');

  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const sortedFilteredSpecies = useMemo(() => {
    const q = speciesSearch.trim().toLowerCase();
    const sorted = [...speciesList].sort((a, b) =>
      a.commonName.localeCompare(b.commonName, 'es'),
    );
    if (!q) return sorted;
    return sorted.filter(
      (sp) =>
        sp.commonName.toLowerCase().includes(q) ||
        sp.scientificName.toLowerCase().includes(q) ||
        sp.catalogCode.toLowerCase().includes(q),
    );
  }, [speciesList, speciesSearch]);

  useEffect(() => {
    if (!open) return;
    setSpeciesSearch('');
    setObservationMethod('En persona');
    setSourceDetail('');
    const sp = speciesList.find((s) => s.id === initialSpeciesId) ?? speciesList[0];
    if (sp) {
      setSpeciesId(sp.id);
    }
    if (presetCoords) {
      setLatitude(presetCoords.latitude);
      setLongitude(presetCoords.longitude);
      setElevationM(presetCoords.elevationM);
      setHoldridgeZone(presetCoords.holdridgeZone);
      setLocality(presetCoords.localityHint ?? '');
    } else {
      setLocality('');
      setGpsStatus(null);
    }
  }, [open, initialSpeciesId, presetCoords, speciesList]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleCaptureGps = () => {
    setGpsStatus('Consultando satélites WGS84...');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lon = Number(pos.coords.longitude.toFixed(6));
          const alt = pos.coords.altitude
            ? Math.round(pos.coords.altitude)
            : estimateCblsElevationFromCoords(lat, lon);
          const zone = detectHoldridgeZoneByElevation(alt);
          setLatitude(lat);
          setLongitude(lon);
          setElevationM(alt);
          setHoldridgeZone(zone);
          setGpsStatus(`Posición exacta: ${lat.toFixed(6)}° N, ${lon.toFixed(6)}° W · ${alt} m s.n.m.`);
        },
        () => {
          const lat = 9.5512;
          const lon = -83.8074;
          const alt = 2240;
          setLatitude(lat);
          setLongitude(lon);
          setElevationM(alt);
          setHoldridgeZone(detectHoldridgeZoneByElevation(alt));
          setLocality('Estación Biológica Río Savegre, Dota');
          setGpsStatus(
            'Referencia estación CBLS (9.5512° N, -83.8074° W · 2 240 m s.n.m.).',
          );
        },
        { timeout: 3500 },
      );
    }
  };

  const handleElevationChange = (nextAlt: number) => {
    setElevationM(nextAlt);
    setHoldridgeZone(detectHoldridgeZoneByElevation(nextAlt));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequestUserSession();
      return;
    }
    if (!speciesId) return;

    onSave({
      speciesId,
      individualCount,
      observationMethod,
      sourceDetail: sourceDetail.trim() || undefined,
      observedDate,
      observedTime,
      observer: currentUser.observerName,
      latitude,
      longitude,
      elevationM,
      locality: locality.trim() || 'Sector Corredor Biológico Los Santos',
      holdridgeZone,
      microhabitat: microhabitat.trim() || 'Observación directa en transecto',
      weatherCondition,
      photoUrl: photoUrl.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      audioUrl: audioUrl.trim() || undefined,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sighting-dialog-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/90 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface
        ref={dialogRef}
        elevated
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl sm:rounded-card"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="sighting-dialog-title" className="text-lg font-semibold text-foreground">
              Registrar avistamiento en campo
            </h2>
            <p className="text-xs text-muted">
              Observador registrado en historial:{' '}
              <span className="font-semibold text-primary">
                {currentUser?.observerName || 'Sin identificar'}
              </span>
            </p>
          </div>
          <Button tone="ghost" onClick={onClose} aria-label="Cerrar ventana">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          {!currentUser && (
            <div className="rounded-control border border-coral bg-coral/15 p-3 text-xs text-foreground flex items-center justify-between">
              <span>Debes ingresar tu nombre y código autorizado antes de registrar.</span>
              <Button tone="coral" onClick={onRequestUserSession} className="min-h-8 text-xs py-1">
                Identificarme
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Especie observada" htmlFor="obs-species" className="sm:col-span-2">
              {speciesList.length > 8 && (
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                  <input
                    type="search"
                    placeholder="Buscar especie entre la lista de muestra..."
                    value={speciesSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSpeciesSearch(val);
                      const q = val.trim().toLowerCase();
                      const firstMatch = speciesList.find(
                        (sp) =>
                          sp.commonName.toLowerCase().includes(q) ||
                          sp.scientificName.toLowerCase().includes(q) ||
                          sp.catalogCode.toLowerCase().includes(q),
                      );
                      if (firstMatch) setSpeciesId(firstMatch.id);
                    }}
                    className={`${inputClassName} min-h-9 pl-9 text-xs`}
                  />
                </div>
              )}
              <select
                id="obs-species"
                autoFocus
                value={speciesId}
                onChange={(e) => setSpeciesId(e.target.value)}
                className={inputClassName}
              >
                {speciesList.length === 0 ? (
                  <option value="">No hay especies catalogadas aún (agrega una primero)</option>
                ) : sortedFilteredSpecies.length === 0 ? (
                  <option value="">Sin coincidencias para &quot;{speciesSearch}&quot;</option>
                ) : (
                  sortedFilteredSpecies.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.commonName} — {sp.scientificName} ({sp.catalogCode})
                    </option>
                  ))
                )}
              </select>
            </Field>

            {/* Observation / Detection Method Selector */}
            <div className="space-y-2.5 sm:col-span-2">
              <span className="block text-xs font-medium text-foreground">
                Forma de avistamiento / detección
              </span>
              <div
                role="radiogroup"
                aria-label="Forma de avistamiento"
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {(
                  [
                    {
                      id: 'En persona' as const,
                      label: 'En persona',
                      desc: 'Avistamiento directo',
                      icon: Eye,
                    },
                    {
                      id: 'Cámara trampa' as const,
                      label: 'Cámara trampa',
                      desc: 'Fototrampeo',
                      icon: Camera,
                    },
                    {
                      id: 'Reporte de tercero' as const,
                      label: 'Reporte externo',
                      desc: 'Alguien dijo haberlo visto',
                      icon: Users,
                    },
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = observationMethod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setObservationMethod(opt.id)}
                      className={`flex items-center gap-2.5 rounded-control border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-primary bg-primary/15 text-foreground'
                          : 'border-border bg-input text-muted hover:border-foreground/30 hover:text-foreground'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-muted'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-foreground">
                          {opt.label}
                        </span>
                        <span className="block truncate text-[11px] text-muted">
                          {opt.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {(observationMethod === 'Cámara trampa' ||
                observationMethod === 'Reporte de tercero') && (
                <Field
                  label={
                    observationMethod === 'Cámara trampa'
                      ? 'Código o estación de cámara trampa (opcional)'
                      : 'Persona o fuente que reportó el avistamiento (opcional)'
                  }
                  htmlFor="obs-source-detail"
                >
                  <input
                    id="obs-source-detail"
                    type="text"
                    placeholder={
                      observationMethod === 'Cámara trampa'
                        ? 'Ej. Cámara Trampa CT-04 · Paso del Río'
                        : 'Ej. Vecino de la finca / Guía local'
                    }
                    value={sourceDetail}
                    onChange={(e) => setSourceDetail(e.target.value)}
                    className={inputClassName}
                  />
                </Field>
              )}
            </div>

            <Field label="Individuos contabilizados" hint="Conteo directo" htmlFor="obs-count">
              <StepperInput
                id="obs-count"
                value={individualCount}
                min={1}
                max={500}
                unit="ind."
                onChange={setIndividualCount}
              />
            </Field>

            <Field label="Condición atmosférica" htmlFor="obs-weather">
              <select
                id="obs-weather"
                value={weatherCondition}
                onChange={(e) =>
                  setWeatherCondition(
                    e.target.value as SightingEntry['weatherCondition'],
                  )
                }
                className={inputClassName}
              >
                <option value="Despejado">Despejado</option>
                <option value="Neblina montana">Neblina montana</option>
                <option value="Lluvia ligera">Lluvia ligera</option>
                <option value="Noche húmeda">Noche húmeda</option>
              </select>
            </Field>

            <Field label="Fecha de observación" htmlFor="obs-date">
              <input
                id="obs-date"
                type="date"
                required
                value={observedDate}
                onChange={(e) => setObservedDate(e.target.value)}
                className={`${inputClassName} font-mono`}
              />
            </Field>

            <Field label="Hora local (24 h)" htmlFor="obs-time">
              <input
                id="obs-time"
                type="time"
                required
                value={observedTime}
                onChange={(e) => setObservedTime(e.target.value)}
                className={`${inputClassName} font-mono`}
              />
            </Field>
          </div>

          {/* Media Links by URL: Photos, Videos, Audios/Calls */}
          <div className="space-y-3 border-t border-border pt-4">
            <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              Evidencia Multimedia por URL
            </span>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Foto (URL)" htmlFor="obs-photo-url">
                <div className="relative">
                  <input
                    id="obs-photo-url"
                    type="url"
                    placeholder="https://.../foto.jpg"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    className={`${inputClassName} pr-9 text-xs`}
                  />
                  <Camera className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                </div>
              </Field>

              <Field label="Video (URL)" htmlFor="obs-video-url">
                <div className="relative">
                  <input
                    id="obs-video-url"
                    type="url"
                    placeholder="https://.../video.mp4"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className={`${inputClassName} pr-9 text-xs`}
                  />
                  <Video className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                </div>
              </Field>

              <Field label="Audio / Canto (URL)" htmlFor="obs-audio-url">
                <div className="relative">
                  <input
                    id="obs-audio-url"
                    type="url"
                    placeholder="https://.../canto.mp3"
                    value={audioUrl}
                    onChange={(e) => setAudioUrl(e.target.value)}
                    className={`${inputClassName} pr-9 text-xs`}
                  />
                  <Headphones className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                </div>
              </Field>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                Coordenadas WGS84 y Zona de Vida Holdridge
              </span>
              <Button tone="secondary" onClick={handleCaptureGps}>
                <Compass className="h-4 w-4" />
                Capturar GPS satelital
              </Button>
            </div>

            {gpsStatus && (
              <p role="status" className="font-mono text-xs text-secondary">
                {gpsStatus}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Latitud (°N)" htmlFor="obs-lat">
                <input
                  id="obs-lat"
                  type="number"
                  step="0.000001"
                  min={8.0}
                  max={11.5}
                  value={latitude}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) setLatitude(v);
                  }}
                  className={`${inputClassName} font-mono tabular-nums`}
                />
              </Field>

              <Field label="Longitud (°W)" htmlFor="obs-lon">
                <input
                  id="obs-lon"
                  type="number"
                  step="0.000001"
                  min={-86.0}
                  max={-82.5}
                  value={longitude}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) setLongitude(v);
                  }}
                  className={`${inputClassName} font-mono tabular-nums`}
                />
              </Field>

              <Field label="Altitud (m s.n.m.)" hint="Auto-Holdridge" htmlFor="obs-alt">
                <StepperInput
                  id="obs-alt"
                  value={elevationM}
                  min={400}
                  max={3600}
                  step={20}
                  unit="m"
                  onChange={handleElevationChange}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Zona de Vida Holdridge" htmlFor="obs-holdridge">
                <select
                  id="obs-holdridge"
                  value={holdridgeZone}
                  onChange={(e) =>
                    setHoldridgeZone(e.target.value as HoldridgeZoneId)
                  }
                  className={inputClassName}
                >
                  {HOLDRIDGE_ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.minElevation}–{z.maxElevation} m)
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Localidad / Sector CBLS" htmlFor="obs-locality">
                <input
                  id="obs-locality"
                  type="text"
                  required
                  placeholder="Ej. Sendero Los Quetzales, San Gerardo de Dota"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className={inputClassName}
                />
              </Field>

              <Field label="Microhábitat y sustrato" htmlFor="obs-microhabitat" className="sm:col-span-2">
                <input
                  id="obs-microhabitat"
                  type="text"
                  value={microhabitat}
                  onChange={(e) => setMicrohabitat(e.target.value)}
                  className={inputClassName}
                />
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <Button tone="quiet" onClick={onClose}>
              Cancelar
            </Button>
            <Button tone="primary" type="submit" disabled={!speciesId || !currentUser}>
              Guardar avistamiento en bitácora
            </Button>
          </div>
        </form>
      </Surface>
    </div>
  );
};
