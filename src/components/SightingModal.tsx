import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Compass,
  Eye,
  Footprints,
  Headphones,
  ImagePlus,
  MapPin,
  Mic,
  Search,
  Square,
  Trash2,
  Users,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import type { SightingMediaInput } from '../hooks/useCblsStore';
import type {
  HoldridgeZoneId,
  SightingCanton,
  SightingEntry,
  SightingIdCertainty,
  SightingObservationMethod,
  SightingVitalStatus,
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
  SpecimenImage,
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

  // Extended CBLS field monitoring fields
  const [vitalStatus, setVitalStatus] = useState<SightingVitalStatus>('Vivo');
  const [mortalityCause, setMortalityCause] = useState<string>('Atropello vehicular');
  const [mortalityRoadType, setMortalityRoadType] = useState<string>(
    'Carretera asfaltada principal',
  );
  const [mortalitySiteAction, setMortalitySiteAction] = useState<string>(
    'Retirado de la calzada',
  );
  const [canton, setCanton] = useState<SightingCanton>('Dota');
  const [gpsAccuracyM, setGpsAccuracyM] = useState<string>('');
  const [idCertainty, setIdCertainty] =
    useState<SightingIdCertainty>('Confirmada en campo');
  const [selectedDemography, setSelectedDemography] = useState<string[]>([]);
  const [selectedBehavior, setSelectedBehavior] = useState<string[]>([]);

  // Local offline-captured Photo, Video & Audio Blobs (saved in IndexedDB)
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('audio/webm');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [existingLocalPhotoPreview, setExistingLocalPhotoPreview] = useState<string | null>(null);
  const [existingLocalVideoPreview, setExistingLocalVideoPreview] = useState<string | null>(null);
  const [existingLocalAudioPreview, setExistingLocalAudioPreview] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState<boolean>(false);
  const [removeExistingVideo, setRemoveExistingVideo] = useState<boolean>(false);
  const [removeExistingAudio, setRemoveExistingAudio] = useState<boolean>(false);

  // Offline MediaRecorder state
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [audioRecorderStatus, setAudioRecorderStatus] = useState<string>('Listo para grabar');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Optional Media URLs
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string>('');

  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const stopActiveAudioRecording = (discard = false) => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      if (discard) {
        recorder.onstop = null;
      }
      try {
        recorder.stop();
      } catch {
        // ignore stop errors when already inactive
      }
    }
    if (discard && audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    setIsRecordingAudio(false);
  };

  const selectedSpecies = useMemo(
    () => speciesList.find((sp) => sp.id === speciesId) ?? null,
    [speciesList, speciesId],
  );
  const isPlantSelected =
    selectedSpecies?.taxon === 'Plantas' || selectedSpecies?.taxon === 'Hongos';

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
    if (!open) {
      stopActiveAudioRecording(true);
      return;
    }

    stopActiveAudioRecording(true);
    setPhotoFile(null);
    setVideoFile(null);
    setAudioBlob(null);
    setAudioMimeType('audio/webm');
    setRecordingSeconds(0);
    setAudioRecorderStatus('Listo para grabar');
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVideoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setAudioPreviewUrl((prev) => {
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
    setExistingLocalAudioPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemoveExistingPhoto(false);
    setRemoveExistingVideo(false);
    setRemoveExistingAudio(false);
    setSpeciesSearch('');
    setGpsStatus(null);

    if (editingSighting) {
      setSpeciesId(editingSighting.speciesId);
      setIndividualCount(editingSighting.individualCount);
      setObservationMethod(editingSighting.observationMethod || 'En persona');
      setSourceDetail(editingSighting.sourceDetail || '');
      setVitalStatus(editingSighting.vitalStatus || 'Vivo');
      setMortalityCause(editingSighting.mortality?.cause || 'Atropello vehicular');
      setMortalityRoadType(
        editingSighting.mortality?.roadType || 'Carretera asfaltada principal',
      );
      setMortalitySiteAction(
        editingSighting.mortality?.siteAction || 'Retirado de la calzada',
      );
      setCanton(editingSighting.canton || 'Dota');
      setGpsAccuracyM(
        typeof editingSighting.gpsAccuracyM === 'number'
          ? String(editingSighting.gpsAccuracyM)
          : '',
      );
      setIdCertainty(editingSighting.idCertainty || 'Confirmada en campo');
      setSelectedDemography(
        editingSighting.demography
          ? editingSighting.demography
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      );
      setSelectedBehavior(
        editingSighting.behavior
          ? editingSighting.behavior
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      );
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
      if (editingSighting.localAudioId) {
        void idbGetMediaCapture(editingSighting.localAudioId).then((cap) => {
          if (!active || !cap) return;
          const u = URL.createObjectURL(cap.blob);
          toRevoke.push(u);
          setExistingLocalAudioPreview(u);
          setAudioRecorderStatus('Audio local guardado en el dispositivo');
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
    setVitalStatus('Vivo');
    setMortalityCause('Atropello vehicular');
    setMortalityRoadType('Carretera asfaltada principal');
    setMortalitySiteAction('Retirado de la calzada');
    setCanton('Dota');
    setGpsAccuracyM('');
    setIdCertainty('Confirmada en campo');
    setSelectedDemography([]);
    setSelectedBehavior([]);
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
      stopActiveAudioRecording(true);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [photoPreviewUrl, videoPreviewUrl, audioPreviewUrl]);

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

  const handleStartAudioRecording = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setAudioRecorderStatus('Tu navegador no soporta grabación de micrófono');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const preferredMime =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        if (recordingTimerRef.current !== null) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        const mime = recorder.mimeType || preferredMime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setAudioBlob(blob);
        setAudioMimeType(mime);
        setRemoveExistingAudio(false);
        setAudioPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setAudioRecorderStatus(`Audio capturado listo para guardar (${formatSize(blob.size)})`);
        setIsRecordingAudio(false);
        stream.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      };

      recorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      setAudioRecorderStatus('Grabando sonido ambiente / canto...');
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);
    } catch {
      setAudioRecorderStatus('Sin acceso al micrófono');
      setIsRecordingAudio(false);
    }
  };

  const handleStopAudioRecording = () => {
    stopActiveAudioRecording(false);
  };

  const toggleMultiOption = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
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
          const acc =
            typeof pos.coords.accuracy === 'number' && Number.isFinite(pos.coords.accuracy)
              ? Math.max(1, Math.min(5000, Math.round(pos.coords.accuracy)))
              : null;
          const zone = detectHoldridgeZoneByElevation(alt);
          setLatitude(lat);
          setLongitude(lon);
          setElevationM(alt);
          setHoldridgeZone(zone);
          if (acc !== null) {
            setGpsAccuracyM(String(acc));
          }
          setGpsStatus(
            `Posición exacta: ${lat.toFixed(6)}° N, ${lon.toFixed(6)}° W · ${alt} m s.n.m.${
              acc !== null ? ` (±${acc} m)` : ''
            }`,
          );
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

  const isMortalityAlert =
    vitalStatus === 'Muerto / Atropellado' || vitalStatus === 'Herido / Rescate';

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

    if (isRecordingAudio) {
      stopActiveAudioRecording(true);
    }

    const effectiveObserver = isEditing
      ? observerName.trim() || editingSighting?.observer || currentUser.observerName
      : currentUser.observerName;

    const parsedAccuracy = Number(gpsAccuracyM);
    const validAccuracy =
      gpsAccuracyM.trim() !== '' && Number.isFinite(parsedAccuracy) && parsedAccuracy >= 1
        ? Math.min(5000, Math.round(parsedAccuracy))
        : undefined;

    void onSave(
      {
        speciesId,
        individualCount,
        observationMethod,
        sourceDetail: sourceDetail.trim() || undefined,
        vitalStatus,
        mortality: isMortalityAlert
          ? {
              cause: mortalityCause,
              roadType: mortalityRoadType,
              siteAction: mortalitySiteAction,
            }
          : undefined,
        canton,
        gpsAccuracyM: validAccuracy,
        idCertainty,
        demography:
          selectedDemography.length > 0 ? selectedDemography.join(', ') : undefined,
        behavior: selectedBehavior.length > 0 ? selectedBehavior.join(', ') : undefined,
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
        audioBlob,
        audioMimeType,
        removeExistingPhoto,
        removeExistingVideo,
        removeExistingAudio,
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

            {/* 1. DETECCIÓN AMPLIADA (Incluye Bioacústica y Rastro indirecto) */}
            <div className="space-y-3 sm:col-span-2">
              <span className="block text-sm font-medium text-emerald-100/90">
                Forma de avistamiento / detección
              </span>
              <div
                role="radiogroup"
                aria-label="Forma de avistamiento"
                className="grid grid-cols-2 gap-2 sm:grid-cols-5"
              >
                {(
                  [
                    {
                      id: 'En persona' as const,
                      label: 'En persona',
                      desc: 'Visual directo',
                      icon: Eye,
                    },
                    {
                      id: 'Bioacústica / Canto' as const,
                      label: 'Bioacústica',
                      desc: 'Canto o llamado',
                      icon: Volume2,
                    },
                    {
                      id: 'Rastro indirecto' as const,
                      label: 'Rastro',
                      desc: 'Huella, excreta, muda',
                      icon: Footprints,
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
                      desc: 'Terceros / vecino',
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
                      onClick={() => {
                        setObservationMethod(opt.id);
                        if (opt.id === 'Rastro indirecto' && vitalStatus === 'Vivo') {
                          setVitalStatus('Rastro sin individuo');
                        }
                      }}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition ${
                        active
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                          : 'border-emerald-800/70 bg-[#0b1f18] text-emerald-100/85 hover:border-emerald-600/60'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${
                            active ? 'text-emerald-300' : 'text-emerald-400/70'
                          }`}
                        />
                        <span
                          className={`text-xs font-semibold ${
                            active ? 'text-emerald-200' : 'text-emerald-100'
                          }`}
                        >
                          {opt.label}
                        </span>
                      </span>
                      <span className="text-[11px] leading-tight text-emerald-100/60">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(observationMethod === 'Cámara trampa' ||
                observationMethod === 'Reporte de tercero' ||
                observationMethod === 'Rastro indirecto') && (
                <Field
                  label={
                    observationMethod === 'Cámara trampa'
                      ? 'Código o estación de cámara trampa (opcional)'
                      : observationMethod === 'Rastro indirecto'
                        ? 'Tipo de rastro o indicio observado (opcional)'
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
                        : observationMethod === 'Rastro indirecto'
                          ? 'Ej. Huellas frescas en barro, excreta, plumas o muda de piel'
                          : 'Ej. Vecino de la finca / Guía local'
                    }
                    value={sourceDetail}
                    onChange={(e) => setSourceDetail(e.target.value)}
                    className={inputClassName}
                  />
                </Field>
              )}
            </div>

            {/* 2. ESTADO VITAL DEL INDIVIDUO + PANEL CONDICIONAL DE ATROPELLO / MORTALIDAD */}
            <div className="space-y-3 rounded-xl border border-emerald-800/60 bg-[#091a14] p-3.5 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-emerald-100/90">
                  Condición / Estado vital del espécimen
                </span>
                <span className="text-[11px] text-emerald-300/70">
                  Monitoreo vial y amenazas
                </span>
              </div>

              <div
                role="radiogroup"
                aria-label="Condición o estado vital del espécimen"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {(
                  [
                    { id: 'Vivo' as const, label: 'Vivo / Activo', tone: 'emerald' as const },
                    {
                      id: 'Muerto / Atropellado' as const,
                      label: 'Muerto / Atropello',
                      tone: 'rose' as const,
                    },
                    {
                      id: 'Herido / Rescate' as const,
                      label: 'Herido / Rescate',
                      tone: 'amber' as const,
                    },
                    {
                      id: 'Rastro sin individuo' as const,
                      label: 'Solo rastro',
                      tone: 'emerald' as const,
                    },
                  ] as const
                ).map((opt) => {
                  const active = vitalStatus === opt.id;
                  const activeClass =
                    opt.tone === 'rose'
                      ? 'border-rose-400 bg-rose-500/20 text-rose-100'
                      : opt.tone === 'amber'
                        ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                        : 'border-emerald-400 bg-emerald-500/20 text-emerald-200';
                  const hoverClass =
                    opt.tone === 'rose'
                      ? 'hover:border-rose-400/60'
                      : opt.tone === 'amber'
                        ? 'hover:border-amber-400/60'
                        : 'hover:border-emerald-500/60';
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setVitalStatus(opt.id)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? activeClass
                          : `border-emerald-800/70 bg-[#0b1f18] text-emerald-100/80 ${hoverClass}`
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {isMortalityAlert && (
                <div className="grid grid-cols-1 gap-3 border-t border-rose-500/25 pt-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="obs-mortality-cause"
                      className="mb-1 block text-xs text-rose-200/90"
                    >
                      Causa probable
                    </label>
                    <select
                      id="obs-mortality-cause"
                      value={mortalityCause}
                      onChange={(e) => setMortalityCause(e.target.value)}
                      className="w-full rounded-lg border border-rose-500/30 bg-[#0d221b] px-3 py-2 text-xs text-emerald-50 focus:border-rose-400 focus:outline-none"
                    >
                      <option value="Atropello vehicular">Atropello vehicular</option>
                      <option value="Persecución humana">
                        Persecución / matanza (ej. serpientes)
                      </option>
                      <option value="Depredación animal doméstico">
                        Ataque perro / gato doméstico
                      </option>
                      <option value="Electrocución / tendido">
                        Electrocución / cableado
                      </option>
                      <option value="Colisión infraestructura">
                        Choque contra ventana / malla
                      </option>
                      <option value="Depredación natural">Depredación natural</option>
                      <option value="Causa desconocida">Causa desconocida</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="obs-mortality-road"
                      className="mb-1 block text-xs text-rose-200/90"
                    >
                      Tipo de vía / entorno
                    </label>
                    <select
                      id="obs-mortality-road"
                      value={mortalityRoadType}
                      onChange={(e) => setMortalityRoadType(e.target.value)}
                      className="w-full rounded-lg border border-rose-500/30 bg-[#0d221b] px-3 py-2 text-xs text-emerald-50 focus:border-rose-400 focus:outline-none"
                    >
                      <option value="Carretera asfaltada principal">
                        Carretera asfaltada (Ruta Nacional)
                      </option>
                      <option value="Calle cantonal / lastre">
                        Calle cantonal / lastre
                      </option>
                      <option value="Camino interno de finca">
                        Camino interno de finca / cafetal
                      </option>
                      <option value="Cruce de quebrada / puente">
                        Cruce de quebrada / alcantarilla
                      </option>
                      <option value="Sendero / bosque">
                        Sendero / interior de bosque
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="obs-mortality-action"
                      className="mb-1 block text-xs text-rose-200/90"
                    >
                      Acción en sitio
                    </label>
                    <select
                      id="obs-mortality-action"
                      value={mortalitySiteAction}
                      onChange={(e) => setMortalitySiteAction(e.target.value)}
                      className="w-full rounded-lg border border-rose-500/30 bg-[#0d221b] px-3 py-2 text-xs text-emerald-50 focus:border-rose-400 focus:outline-none"
                    >
                      <option value="Retirado de la calzada">
                        Retirado de la calzada (evitar carroñeros)
                      </option>
                      <option value="Dejado in situ">Dejado in situ (solo registro)</option>
                      <option value="Reportado a SINAC / 911">
                        Reportado a SINAC / Bomberos / 9-1-1
                      </option>
                      <option value="Traslado a centro de rescate">
                        Trasladado a centro de rescate
                      </option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* 3. CANTÓN CBLS + PRECISIÓN GPS + CERTEZA TAXONÓMICA */}
            <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="obs-canton"
                  className="mb-1 block text-xs font-medium text-emerald-100/90"
                >
                  Cantón Zona de los Santos
                </label>
                <select
                  id="obs-canton"
                  value={canton}
                  onChange={(e) => setCanton(e.target.value as SightingCanton)}
                  className="w-full rounded-xl border border-emerald-800/70 bg-[#0b1f18] px-3 py-2.5 text-sm text-emerald-50 focus:border-emerald-400 focus:outline-none"
                >
                  <option value="Tarrazú">Tarrazú</option>
                  <option value="Dota">Dota</option>
                  <option value="León Cortés Castro">León Cortés Castro</option>
                  <option value="Zona de amortiguamiento">
                    Zona de amortiguamiento / límite
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="obs-gps-accuracy"
                  className="mb-1 block text-xs font-medium text-emerald-100/90"
                >
                  Precisión GPS (± metros)
                </label>
                <div className="flex items-center rounded-xl border border-emerald-800/70 bg-[#0b1f18] px-3 py-2.5 focus-within:border-emerald-400">
                  <span className="mr-1.5 text-xs text-emerald-300/70">±</span>
                  <input
                    id="obs-gps-accuracy"
                    type="number"
                    placeholder="8"
                    min={1}
                    max={5000}
                    value={gpsAccuracyM}
                    onChange={(e) => setGpsAccuracyM(e.target.value)}
                    className="w-full bg-transparent font-mono text-sm text-emerald-50 focus:outline-none"
                  />
                  <span className="ml-1 text-xs text-emerald-300/70">m</span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="obs-id-certainty"
                  className="mb-1 block text-xs font-medium text-emerald-100/90"
                >
                  Nivel de certeza ID
                </label>
                <select
                  id="obs-id-certainty"
                  value={idCertainty}
                  onChange={(e) =>
                    setIdCertainty(e.target.value as SightingIdCertainty)
                  }
                  className="w-full rounded-xl border border-emerald-800/70 bg-[#0b1f18] px-3 py-2.5 text-sm text-emerald-50 focus:border-emerald-400 focus:outline-none"
                >
                  <option value="Confirmada en campo">Confirmada en campo</option>
                  <option value="Requiere revisión curatorial">
                    Requiere revisión curatorial
                  </option>
                  <option value="Solo género / familia">Solo género o familia</option>
                </select>
              </div>
            </div>

            {/* 4. DEMOGRAFÍA Y CONDUCTA (CHIPS DE SELECCIÓN MÚLTIPLE RÁPIDA) */}
            <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-emerald-100/90">
                  Edad y sexo (opcional)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(['Adulto', 'Juvenil / Cría', 'Macho', 'Hembra'] as const).map((item) => {
                    const active = selectedDemography.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleMultiOption(item, setSelectedDemography)}
                        className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                          active
                            ? 'border-emerald-400 bg-emerald-500/20 font-medium text-emerald-200'
                            : 'border-emerald-800/70 bg-[#0b1f18] text-emerald-100/80 hover:border-emerald-600/60'
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-emerald-100/90">
                  Actividad / Conducta observada
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { val: 'Forrajeando', label: 'Forrajeando' },
                      { val: 'Vocalizando', label: 'Vocalizando' },
                      { val: 'En reposo / Percha', label: 'En reposo' },
                      { val: 'Cruzando vía', label: 'Cruzando vía' },
                      { val: 'Anidando / Crías', label: 'Anidando / Crías' },
                    ] as const
                  ).map((item) => {
                    const active = selectedBehavior.includes(item.val);
                    return (
                      <button
                        key={item.val}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleMultiOption(item.val, setSelectedBehavior)}
                        className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                          active
                            ? 'border-emerald-400 bg-emerald-500/20 font-medium text-emerald-200'
                            : 'border-emerald-800/70 bg-[#0b1f18] text-emerald-100/80 hover:border-emerald-600/60'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
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
                    <SpecimenImage
                      src={photoPreviewUrl}
                      alt="Vista previa de fotografía capturada"
                      scientificName={photoFile.name}
                      title="Vista previa de fotografía capturada"
                      subtitle={formatSize(photoFile.size)}
                      className="h-36 w-full rounded-md border border-border"
                    />
                    <p className="truncate font-mono text-[11px] text-secondary">
                      {photoFile.name} · {formatSize(photoFile.size)}
                    </p>
                  </div>
                ) : (
                  existingLocalPhotoPreview &&
                  !removeExistingPhoto && (
                    <div className="space-y-1.5 pt-1">
                      <SpecimenImage
                        src={existingLocalPhotoPreview}
                        alt="Fotografía local guardada en este avistamiento"
                        scientificName="Registro de campo"
                        title="Fotografía local del avistamiento"
                        className="h-36 w-full rounded-md border border-border"
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

            {/* 5. GRABADORA DE AUDIO BIOACÚSTICO OFFLINE EN CAMPO */}
            <div className="rounded-xl border border-emerald-800/60 bg-[#091a14] p-3.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-100">
                  <Mic
                    className={`h-3.5 w-3.5 ${
                      isRecordingAudio ? 'animate-pulse text-rose-400' : 'text-emerald-300'
                    }`}
                  />
                  Audio / Canto en campo (Offline)
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-emerald-300/80">
                    {isRecordingAudio
                      ? `Grabando ${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(recordingSeconds % 60).padStart(2, '0')}`
                      : audioRecorderStatus}
                  </span>
                  {(audioBlob || (existingLocalAudioPreview && !removeExistingAudio)) &&
                    !isRecordingAudio && (
                      <button
                        type="button"
                        onClick={() => {
                          if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
                          setAudioBlob(null);
                          setAudioPreviewUrl(null);
                          if (existingLocalAudioPreview) {
                            setRemoveExistingAudio(true);
                          }
                          setAudioRecorderStatus('Listo para grabar');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-coral hover:underline"
                      >
                        <Trash2 className="h-3 w-3" /> Quitar
                      </button>
                    )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleStartAudioRecording()}
                  disabled={isRecordingAudio}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-40"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Grabar canto / llamado
                </button>
                <button
                  type="button"
                  onClick={handleStopAudioRecording}
                  disabled={!isRecordingAudio}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/30 disabled:opacity-40"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Detener
                </button>
                {(audioPreviewUrl || (existingLocalAudioPreview && !removeExistingAudio)) && (
                  <audio
                    src={audioPreviewUrl || existingLocalAudioPreview || undefined}
                    controls
                    className="h-8 max-w-full flex-1 min-w-[200px]"
                  />
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
