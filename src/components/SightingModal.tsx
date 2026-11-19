import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Compass,
  Eye,
  Headphones,
  ImagePlus,
  MapPin,
  Search,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { SightingMediaInput } from '../hooks/useCblsStore';
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
import { idbGetMediaCapture } from '../utils/indexedDb';
import {
  Button,
  Field,
  inputClassName,
  StepperInput,
  Surface,
  textareaClassName,
} from './ui';

interface SightingModalProps {
  open: boolean;
  speciesList: SpeciesRecord[];
  initialSpeciesId?: string;
  editingSighting?: SightingEntry | null;
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
  onSave: (
    entry: Omit<SightingEntry, 'id' | 'occurrenceId' | 'synced' | 'createdAt'>,
    mediaInput?: SightingMediaInput,
  ) => Promise<void> | void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const SightingModal: React.FC<SightingModalProps> = ({
  open,
  speciesList,
  initialSpeciesId,
  editingSighting,
  presetCoords,
  currentUser,
  onRequestUserSession,
  onClose,
  onSave,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isEditing = Boolean(editingSighting);

  const defaultSp =
    speciesList.find((s) => s.id === (editingSighting?.speciesId ?? initialSpeciesId)) ??
    speciesList[0];

  const [speciesId, setSpeciesId] = useState<string>(defaultSp?.id ?? '');
  const [speciesSearch, setSpeciesSearch] = useState<string>('');
  const [individualCount, setIndividualCount] = useState<number>(1);
  const [observationMethod, setObservationMethod] =
    useState<SightingObservationMethod>('En persona');
  const [sourceDetail, setSourceDetail] = useState<string>('');
  const [observerName, setObserverName] = useState<string>(
    editingSighting?.observer || currentUser?.observerName || '',
  );
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
  const [notes, setNotes] = useState<string>('');
  const [weatherCondition, setWeatherCondition] =
    useState<SightingEntry['weatherCondition']>('Neblina montana');

  // Local offline-captured Photo & Video files (saved as Blobs in IndexedDB)
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [existingLocalPhotoPreview, setExistingLocalPhotoPreview] = useState<string | null>(null);
  const [existingLocalVideoPreview, setExistingLocalVideoPreview] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState<boolean>(false);
  const [removeExistingVideo, setRemoveExistingVideo] = useState<boolean>(false);

  // Optional Media URLs
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string>('');

  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const selectedSpecies = useMemo(
    () => speciesList.find((sp) => sp.id === speciesId) ?? null,
    [speciesList, speciesId],
  );
  const isPlantSelected = selectedSpecies?.taxon === 'Plantas';

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

    setPhotoFile(null);
    setVideoFile(null);
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVideoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setExistingLocalPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setExistingLocalVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemoveExistingPhoto(false);
    setRemoveExistingVideo(false);
    setSpeciesSearch('');
    setGpsStatus(null);

    if (editingSighting) {
      setSpeciesId(editingSighting.speciesId);
      setIndividualCount(editingSighting.individualCount);
      setObservationMethod(editingSighting.observationMethod || 'En persona');
      setSourceDetail(editingSighting.sourceDetail || '');
      setObserverName(editingSighting.observer || currentUser?.observerName || '');
      setObservedDate(editingSighting.observedDate);
      setObservedTime(editingSighting.observedTime);
      setLatitude(editingSighting.latitude);
      setLongitude(editingSighting.longitude);
      setElevationM(editingSighting.elevationM);
      setHoldridgeZone(editingSighting.holdridgeZone);
      setLocality(editingSighting.locality);
      setMicrohabitat(editingSighting.microhabitat);
      setNotes(editingSighting.notes || '');
      setWeatherCondition(editingSighting.weatherCondition);
      setPhotoUrl(editingSighting.photoUrl || '');
      setVideoUrl(editingSighting.videoUrl || '');
      setAudioUrl(editingSighting.audioUrl || '');

      let active = true;
      const toRevoke: string[] = [];
      if (editingSighting.localPhotoId) {
        void idbGetMediaCapture(editingSighting.localPhotoId).then((cap) => {
          if (!active || !cap) return;
          const u = URL.createObjectURL(cap.blob);
          toRevoke.push(u);
          setExistingLocalPhotoPreview(u);
        });
      }
      if (editingSighting.localVideoId) {
        void idbGetMediaCapture(editingSighting.localVideoId).then((cap) => {
          if (!active || !cap) return;
          const u = URL.createObjectURL(cap.blob);
          toRevoke.push(u);
          setExistingLocalVideoPreview(u);
        });
      }
      return () => {
        active = false;
        toRevoke.forEach((u) => URL.revokeObjectURL(u));
      };
    }

    const now = new Date();
    setIndividualCount(1);
    setObservedDate(now.toISOString().slice(0, 10));
    setObservedTime(now.toTimeString().slice(0, 5));
    setObservationMethod('En persona');
    setSourceDetail('');
    setObserverName(currentUser?.observerName || '');
    setMicrohabitat('Sotobosque húmedo sobre vegetación epífita');
    setWeatherCondition('Neblina montana');
    setNotes('');
    setPhotoUrl('');
    setVideoUrl('');
    setAudioUrl('');

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
    }
  }, [open, editingSighting, initialSpeciesId, presetCoords, speciesList, currentUser]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [photoPreviewUrl, videoPreviewUrl]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleCaptureGps = () => {
    setGpsStatus('Consultando satélites WGS84 (funciona sin señal celular)...');
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
          if (!locality.trim()) {
            setLocality('Estación Biológica Río Savegre, Dota');
          }
          setGpsStatus(
            'Referencia estación CBLS (9.5512° N, -83.8074° W · 2 240 m s.n.m.).',
          );
        },
        { enableHighAccuracy: true, timeout: 5000 },
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
    if (isEditing && !currentUser.isAdmin) {
      onRequestUserSession();
      return;
    }
    if (!speciesId) return;

    const effectiveObserver = isEditing
      ? observerName.trim() || editingSighting?.observer || currentUser.observerName
      : currentUser.observerName;

    void onSave(
      {
        speciesId,
        individualCount,
        observationMethod,
        sourceDetail: sourceDetail.trim() || undefined,
        observedDate,
        observedTime,
        observer: effectiveObserver,
        latitude,
        longitude,
        elevationM,
        locality: locality.trim() || 'Sector Corredor Biológico Los Santos',
        holdridgeZone,
        microhabitat: microhabitat.trim() || 'Observación directa en transecto',
        notes: notes.trim() || undefined,
        weatherCondition,
        photoUrl: photoUrl.trim() || undefined,
        videoUrl: videoUrl.trim() || undefined,
        audioUrl: audioUrl.trim() || undefined,
      },
      {
        photoFile,
        videoFile,
        removeExistingPhoto,
        removeExistingVideo,
      },
    );
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
              {isEditing
                ? 'Editar avistamiento registrado'
                : 'Registrar avistamiento en campo'}
            </h2>
            <p className="text-xs text-muted">
              {isEditing ? 'Editando como administrador:' : 'Brigadista registrado en el equipo:'}{' '}
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

            <Field
              label={
                isPlantSelected
                  ? 'Individuos o parches contabilizados'
                  : 'Individuos contabilizados'
              }
              hint={isPlantSelected ? 'Ejemplares / cobertura' : 'Conteo directo'}
              htmlFor="obs-count"
            >
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

            {isEditing && (
              <Field
                label="Brigadista responsable del registro"
                htmlFor="obs-observer"
                className="sm:col-span-2"
              >
                <input
                  id="obs-observer"
                  type="text"
                  required
                  value={observerName}
                  onChange={(e) => setObserverName(e.target.value)}
                  className={inputClassName}
                />
              </Field>
            )}
          </div>

          {/* Local Offline Camera / Video Capture + Optional URLs */}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">
                Captura de Fotos y Videos (100% offline en IndexedDB)
              </span>
              <span className="font-mono text-[11px] text-secondary">
                Guardado local sin señal
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Local Photo Capture / Picker */}
              <div className="space-y-2 rounded-control border border-border bg-input/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    Fotografía de campo
                  </span>
                  {(photoFile || (existingLocalPhotoPreview && !removeExistingPhoto)) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                        setPhotoFile(null);
                        setPhotoPreviewUrl(null);
                        if (existingLocalPhotoPreview) {
                          setRemoveExistingPhoto(true);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-coral hover:underline"
                    >
                      <Trash2 className="h-3 w-3" /> Quitar
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-primary/40 bg-primary/15 px-3 text-xs font-semibold text-primary hover:bg-primary/25">
                    <Camera className="h-3.5 w-3.5" />
                    Tomar foto
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        setRemoveExistingPhoto(false);
                        handlePhotoFileChange(e);
                      }}
                      className="sr-only"
                    />
                  </label>
                  <label className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs font-medium text-foreground hover:border-foreground/40">
                    <ImagePlus className="h-3.5 w-3.5 text-secondary" />
                    Galería
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        setRemoveExistingPhoto(false);
                        handlePhotoFileChange(e);
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>

                {photoPreviewUrl && photoFile ? (
                  <div className="space-y-1.5 pt-1">
                    <img
                      src={photoPreviewUrl}
                      alt="Vista previa de fotografía capturada"
                      className="h-28 w-full rounded-md border border-border object-cover"
                    />
                    <p className="truncate font-mono text-[11px] text-secondary">
                      {photoFile.name} · {formatSize(photoFile.size)}
                    </p>
                  </div>
                ) : (
                  existingLocalPhotoPreview &&
                  !removeExistingPhoto && (
                    <div className="space-y-1.5 pt-1">
                      <img
                        src={existingLocalPhotoPreview}
                        alt="Fotografía local guardada en este avistamiento"
                        className="h-28 w-full rounded-md border border-border object-cover"
                      />
                      <p className="truncate font-mono text-[11px] text-secondary">
                        Foto local guardada en el dispositivo
                      </p>
                    </div>
                  )
                )}
              </div>

              {/* Local Video Capture / Picker */}
              <div className="space-y-2 rounded-control border border-border bg-input/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    Video de campo
                  </span>
                  {(videoFile || (existingLocalVideoPreview && !removeExistingVideo)) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
                        setVideoFile(null);
                        setVideoPreviewUrl(null);
                        if (existingLocalVideoPreview) {
                          setRemoveExistingVideo(true);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-coral hover:underline"
                    >
                      <Trash2 className="h-3 w-3" /> Quitar
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-primary/40 bg-primary/15 px-3 text-xs font-semibold text-primary hover:bg-primary/25">
                    <Video className="h-3.5 w-3.5" />
                    Grabar video
                    <input
                      type="file"
                      accept="video/*"
                      capture="environment"
                      onChange={(e) => {
                        setRemoveExistingVideo(false);
                        handleVideoFileChange(e);
                      }}
                      className="sr-only"
                    />
                  </label>
                  <label className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs font-medium text-foreground hover:border-foreground/40">
                    <Video className="h-3.5 w-3.5 text-secondary" />
                    Archivo
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => {
                        setRemoveExistingVideo(false);
                        handleVideoFileChange(e);
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>

                {videoPreviewUrl && videoFile ? (
                  <div className="space-y-1.5 pt-1">
                    <video
                      src={videoPreviewUrl}
                      controls
                      className="h-28 w-full rounded-md border border-border bg-black object-cover"
                    />
                    <p className="truncate font-mono text-[11px] text-secondary">
                      {videoFile.name} · {formatSize(videoFile.size)}
                    </p>
                  </div>
                ) : (
                  existingLocalVideoPreview &&
                  !removeExistingVideo && (
                    <div className="space-y-1.5 pt-1">
                      <video
                        src={existingLocalVideoPreview}
                        controls
                        className="h-28 w-full rounded-md border border-border bg-black object-cover"
                      />
                      <p className="truncate font-mono text-[11px] text-secondary">
                        Video local guardado en el dispositivo
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Foto externa (URL opcional)" htmlFor="obs-photo-url">
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

              <Field label="Video externo (URL opcional)" htmlFor="obs-video-url">
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

              <Field label="Audio / Canto (URL opcional)" htmlFor="obs-audio-url">
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

              <Field
                label={
                  isPlantSelected
                    ? 'Sustrato, forófito y exposición lumínica'
                    : 'Microhábitat y sustrato'
                }
                htmlFor="obs-microhabitat"
                className="sm:col-span-2"
              >
                <input
                  id="obs-microhabitat"
                  type="text"
                  placeholder={
                    isPlantSelected
                      ? 'Ej. Epífito sobre tronco de roble, suelo humífero o talud húmedo'
                      : 'Ej. Sotobosque húmedo sobre vegetación epífita'
                  }
                  value={microhabitat}
                  onChange={(e) => setMicrohabitat(e.target.value)}
                  className={inputClassName}
                />
              </Field>

              <Field
                label="Notas y observaciones de campo"
                hint={
                  isPlantSelected
                    ? 'Fenología (floración, frutos, esporofitos), polinizadores o estado del sustrato'
                    : 'Comportamiento, huellas, clima, vocalización u otros detalles'
                }
                htmlFor="obs-notes"
                className="sm:col-span-2"
              >
                <textarea
                  id="obs-notes"
                  rows={3}
                  placeholder={
                    isPlantSelected
                      ? 'Ej. Individuo adulto con botones florales y frutos verdes, presencia de musgo y epífitas asociadas...'
                      : 'Ej. Individuo adulto desplazándose por sendero húmedo a las 06:15, huellas frescas hacia quebrada...'
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={textareaClassName}
                />
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <Button tone="quiet" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              tone="primary"
              type="submit"
              disabled={!speciesId || !currentUser || (isEditing && !currentUser.isAdmin)}
            >
              {isEditing
                ? 'Guardar cambios del avistamiento'
                : 'Guardar avistamiento en bitácora'}
            </Button>
          </div>
        </form>
      </Surface>
    </div>
  );
};
