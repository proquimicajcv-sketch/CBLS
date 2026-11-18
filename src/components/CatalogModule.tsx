import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  FilePlus2,
  Lock,
  MapPin,
  Plus,
  Search,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import type {
  CurationStatus,
  IucnCategory,
  PhotoTag,
  SightingEntry,
  SpeciesRecord,
  TaxonGroup,
  UserSession,
} from '../types/cbls';
import {
  getHoldridgeZoneInfo,
  playBioacousticPreview,
  TAXON_GROUPS,
} from '../utils/ecology';
import { idbGetMediaCapture } from '../utils/indexedDb';
import { AdminPinModal } from './AdminPinModal';
import {
  Button,
  Field,
  inputClassName,
  SpecimenImage,
  StepperInput,
  Surface,
  textareaClassName,
} from './ui';

interface CatalogModuleProps {
  species: SpeciesRecord[];
  sightings: SightingEntry[];
  selectedSpeciesId: string | null;
  startInCreateMode: boolean;
  currentUser: UserSession | null;
  onRequestUserSession: () => void;
  onSelectSpecies: (id: string) => void;
  onClearCreateMode: () => void;
  onSaveSpecies: (record: SpeciesRecord, overrideAdminCode?: string) => Promise<boolean> | void;
  onDeleteSpecies: (id: string, overrideAdminCode?: string) => Promise<void> | void;
  onQuickSighting: (speciesId: string) => void;
  onEditSighting: (sighting: SightingEntry) => void;
  onDeleteSighting: (sightingId: string) => Promise<boolean> | void;
}

const PHOTO_TAGS: PhotoTag[] = [
  'Vista general',
  'Ojo',
  'Flanco',
  'Dorso',
  'Puesta',
  'Hembra',
  'Macho',
  'Floración / Fruto',
];

const IUCN_OPTIONS: { code: IucnCategory; label: string }[] = [
  { code: 'LC', label: 'LC — Preocupación menor' },
  { code: 'NT', label: 'NT — Casi amenazada' },
  { code: 'VU', label: 'VU — Vulnerable' },
  { code: 'EN', label: 'EN — En peligro' },
  { code: 'CR', label: 'CR — En peligro crítico' },
];

function getNextCatalogIndex(speciesList: SpeciesRecord[]): number {
  let maxNum = speciesList.length;
  for (const sp of speciesList) {
    const match = sp.catalogCode.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return maxNum + 1;
}

function createEmptySpeciesDraft(nextIndex: number, user: UserSession | null): SpeciesRecord {
  return {
    id: `sp-${Date.now()}`,
    catalogCode: `CBLS-SP-${String(nextIndex).padStart(3, '0')}`,
    scientificName: '',
    commonName: '',
    taxon: 'Aves',
    iucn: 'LC',
    medicalAlert: false,
    curationStatus: 'Borrador local',
    isSample: true,
    photoUrl: '',
    videoUrl: '',
    photoTag: 'Vista general',
    bioacoustics: {
      hasCall: false,
      audioUrl: '',
      dominantFreqKhz: 2.4,
      pulsePattern: 'pulse',
      notes: 'No aplica (Sin canto).',
    },
    activityCycle: 'Diurna',
    ecology: {
      chromaticsAnatomy: '',
      ethologyBehavior: '',
      courtshipReproduction: '',
      interIntraRelations: '',
      confirmedReferences: '',
    },
    updatedAt: new Date().toISOString(),
    synced: false,
    creatorName: user?.observerName,
  };
}

export const CatalogModule: React.FC<CatalogModuleProps> = ({
  species,
  sightings,
  selectedSpeciesId,
  startInCreateMode,
  currentUser,
  onRequestUserSession,
  onSelectSpecies,
  onClearCreateMode,
  onSaveSpecies,
  onDeleteSpecies,
  onQuickSighting,
  onEditSighting,
  onDeleteSighting,
}) => {
  const activeSpecies =
    species.find((s) => s.id === selectedSpeciesId) ?? species[0] ?? null;

  const [mode, setMode] = useState<'view' | 'edit' | 'create'>(
    startInCreateMode || species.length === 0 ? 'create' : 'view',
  );
  const [draft, setDraft] = useState<SpeciesRecord>(() =>
    startInCreateMode || !activeSpecies
      ? createEmptySpeciesDraft(getNextCatalogIndex(species), currentUser)
      : activeSpecies,
  );
  const [listQuery, setListQuery] = useState<string>('');

  // Admin PIN Protection states
  const [adminPinModalOpen, setAdminPinModalOpen] = useState(false);
  const [pendingAdminAction, setPendingAdminAction] = useState<'save' | 'edit' | 'delete' | null>(null);
  const [verifiedAdminPin, setVerifiedAdminPin] = useState<string | null>(null);
  const [confirmAdminDelete, setConfirmAdminDelete] = useState(false);
  const [confirmDeleteSightingId, setConfirmDeleteSightingId] = useState<string | null>(null);

  const [isPlayingCall, setIsPlayingCall] = useState<boolean>(false);
  const [stopAudio, setStopAudio] = useState<(() => void) | null>(null);

  const filteredListSpecies = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return species;
    return species.filter(
      (sp) =>
        sp.commonName.toLowerCase().includes(q) ||
        sp.scientificName.toLowerCase().includes(q) ||
        sp.catalogCode.toLowerCase().includes(q) ||
        sp.taxon.toLowerCase().includes(q),
    );
  }, [species, listQuery]);

  useEffect(() => {
    if (startInCreateMode || species.length === 0) {
      setMode('create');
      setDraft(createEmptySpeciesDraft(getNextCatalogIndex(species), currentUser));
      onClearCreateMode();
    }
  }, [startInCreateMode, species, currentUser, onClearCreateMode]);

  useEffect(() => {
    if (mode === 'view' && activeSpecies) {
      setDraft(activeSpecies);
      setConfirmAdminDelete(false);
    }
  }, [activeSpecies, mode]);

  useEffect(() => {
    return () => {
      if (stopAudio) stopAudio();
    };
  }, [stopAudio]);

  const speciesSightings = activeSpecies
    ? sightings.filter((o) => o.speciesId === activeSpecies.id)
    : [];
  const speciesTotalIndividuals = speciesSightings.reduce(
    (sum, s) => sum + s.individualCount,
    0,
  );

  const handlePlayCall = (target: SpeciesRecord) => {
    if (isPlayingCall && stopAudio) {
      stopAudio();
      setIsPlayingCall(false);
      setStopAudio(null);
      return;
    }
    if (stopAudio) stopAudio();
    setIsPlayingCall(true);

    if (target.bioacoustics.audioUrl) {
      const audio = new Audio(target.bioacoustics.audioUrl);
      audio.play().catch(() => {
        const stop = playBioacousticPreview(
          target.bioacoustics.pulsePattern ?? 'flute',
          target.bioacoustics.dominantFreqKhz ?? 2.4,
          () => {
            setIsPlayingCall(false);
            setStopAudio(null);
          },
        );
        setStopAudio(() => stop);
      });
      const stop = () => {
        audio.pause();
        audio.currentTime = 0;
      };
      setStopAudio(() => stop);
      audio.onended = () => {
        setIsPlayingCall(false);
        setStopAudio(null);
      };
      return;
    }

    const stop = playBioacousticPreview(
      target.bioacoustics.pulsePattern ?? 'flute',
      target.bioacoustics.dominantFreqKhz ?? 2.4,
      () => {
        setIsPlayingCall(false);
        setStopAudio(null);
      },
    );
    setStopAudio(() => stop);
  };

  // Protected edit request (direct for admin session, PIN modal otherwise)
  const requestEditSpecies = () => {
    if (currentUser?.isAdmin && activeSpecies) {
      setDraft(activeSpecies);
      setMode('edit');
      return;
    }
    setPendingAdminAction('edit');
    setAdminPinModalOpen(true);
  };

  // Protected delete request (inline confirm for admin session, PIN modal otherwise)
  const requestDeleteSpecies = () => {
    if (currentUser?.isAdmin) {
      setConfirmAdminDelete(true);
      return;
    }
    setPendingAdminAction('delete');
    setAdminPinModalOpen(true);
  };

  const executeAdminDelete = () => {
    if (!activeSpecies) return;
    onDeleteSpecies(activeSpecies.id, verifiedAdminPin ?? undefined);
    setConfirmAdminDelete(false);
    setMode(species.length <= 1 ? 'create' : 'view');
  };

  const buildCleanSpeciesRecord = (): SpeciesRecord => ({
    ...draft,
    isSample: true,
    latitude: undefined,
    longitude: undefined,
    elevationM: undefined,
    locality: undefined,
    holdridgeZone: undefined,
    scientificName: draft.scientificName.trim(),
    commonName: draft.commonName.trim(),
    creatorName: draft.creatorName || currentUser?.observerName || 'Administrador',
  });

  const handleAdminSuccess = (pin: string) => {
    setVerifiedAdminPin(pin);
    setAdminPinModalOpen(false);
    if (pendingAdminAction === 'edit' && activeSpecies) {
      setDraft(activeSpecies);
      setMode('edit');
    } else if (pendingAdminAction === 'delete' && activeSpecies) {
      onDeleteSpecies(activeSpecies.id, pin);
      setMode(species.length <= 1 ? 'create' : 'view');
    } else if (pendingAdminAction === 'save') {
      const clean = buildCleanSpeciesRecord();
      Promise.resolve(onSaveSpecies(clean, pin)).then((ok) => {
        if (ok !== false) {
          onSelectSpecies(clean.id);
          setMode('view');
        }
      });
    }
    setPendingAdminAction(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.scientificName.trim() || !draft.commonName.trim()) return;
    if (!currentUser) {
      onRequestUserSession();
      return;
    }

    if (!currentUser.isAdmin && !verifiedAdminPin) {
      setPendingAdminAction('save');
      setAdminPinModalOpen(true);
      return;
    }

    const clean = buildCleanSpeciesRecord();
    Promise.resolve(onSaveSpecies(clean, verifiedAdminPin ?? undefined)).then((ok) => {
      if (ok !== false) {
        onSelectSpecies(clean.id);
        setMode('view');
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Admin PIN Authentication Modal */}
      <AdminPinModal
        open={adminPinModalOpen}
        title={
          pendingAdminAction === 'delete'
            ? 'Autorizar Eliminación de Especie'
            : pendingAdminAction === 'save'
              ? 'Autorizar Alta de Especie de Muestra'
              : 'Autorizar Edición de Especie'
        }
        actionDescription={
          pendingAdminAction === 'delete'
            ? `Estás a punto de eliminar permanentemente la ficha de ${activeSpecies?.commonName || 'la especie'}`
            : pendingAdminAction === 'save'
              ? `Solo el código de administrador autorizado puede agregar y sincronizar especies de muestra en todos los dispositivos`
              : `Estás a punto de modificar los datos científicos de ${activeSpecies?.commonName || 'la especie'}`
        }
        onSuccess={handleAdminSuccess}
        onClose={() => {
          setAdminPinModalOpen(false);
          setPendingAdminAction(null);
        }}
      />

      {/* Left Species Selector List */}
      <aside className="space-y-4 lg:col-span-4 lg:sticky lg:top-4 lg:self-start">
        <Surface className="divide-y divide-border">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Catálogo de especímenes
              </h2>
              <p className="text-xs text-muted">
                {species.length} fichas biológicas guardadas
              </p>
            </div>
            <Button
              tone="primary"
              onClick={() => {
                setDraft(createEmptySpeciesDraft(getNextCatalogIndex(species), currentUser));
                setMode('create');
              }}
            >
              <FilePlus2 className="h-4 w-4" />
              Nueva especie
            </Button>
          </div>

          {species.length > 0 && (
            <div className="p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  placeholder="Filtrar lista (nombre, código, taxón)..."
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                  className={`${inputClassName} min-h-9 pl-9 text-xs`}
                />
              </div>
            </div>
          )}

          <div className="max-h-[58vh] divide-y divide-border overflow-y-auto">
            {species.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                No hay especies en el inventario. Haz clic en &quot;Nueva especie&quot; para ingresar la primera.
              </div>
            ) : filteredListSpecies.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                Sin coincidencias para &quot;{listQuery}&quot;.
              </div>
            ) : (
              filteredListSpecies.map((sp) => {
                const isSelected = mode !== 'create' && activeSpecies?.id === sp.id;
                const spSightingCount = sightings.filter(
                  (o) => o.speciesId === sp.id,
                ).length;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => {
                      onSelectSpecies(sp.id);
                      setMode('view');
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      isSelected
                        ? 'bg-surface-elevated text-foreground'
                        : 'hover:bg-foreground/5'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-mono text-muted">
                          {sp.catalogCode}
                        </span>
                        <span className="text-muted">·</span>
                        <span className="font-mono text-primary">Muestra</span>
                        <span className="text-muted">·</span>
                        <span className="text-muted">{sp.taxon}</span>
                        {['CR', 'EN', 'VU'].includes(sp.iucn) || sp.medicalAlert ? (
                          <>
                            <span className="text-muted">·</span>
                            <span className="font-mono text-coral">
                              {sp.medicalAlert ? 'Ofídico' : sp.iucn}
                            </span>
                          </>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {sp.commonName}
                      </p>
                      <p className="text-xs italic text-muted">
                        {sp.scientificName}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted">
                      {spSightingCount > 0 ? `${spSightingCount} avist.` : 'Solo muestra'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </Surface>
      </aside>

      {/* Right Main Detail or Create/Edit Form */}
      <div className="min-w-0 lg:col-span-8">
        {mode === 'view' && activeSpecies ? (
          <Surface className="divide-y divide-border overflow-hidden">
            {/* Field Photograph & Header */}
            <div className="grid grid-cols-1 md:grid-cols-12">
              <div className="relative aspect-[16/10] bg-background md:col-span-6 md:aspect-auto">
                <SpecimenImage
                  src={activeSpecies.photoUrl}
                  alt={`${activeSpecies.commonName} — ${activeSpecies.photoTag}`}
                  scientificName={activeSpecies.scientificName}
                  className="h-full w-full"
                />
                <div className="absolute bottom-3 left-3 bg-background/90 px-2.5 py-1 font-mono text-xs text-foreground">
                  Toma: {activeSpecies.photoTag}
                </div>
              </div>

              <div className="flex flex-col justify-between space-y-4 p-5 md:col-span-6">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">
                      <span className="font-mono text-secondary">
                        {activeSpecies.catalogCode}
                      </span>
                      {' · '}
                      <span className="font-semibold text-primary">
                        Especie de muestra
                      </span>
                      {' · '}
                      <span>{activeSpecies.taxon}</span>
                      {' · '}
                      <span>{activeSpecies.curationStatus}</span>
                    </p>
                    <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-muted">
                      <Lock className="h-3 w-3 text-secondary" />
                      {currentUser?.isAdmin ? 'Acceso Administrador' : 'Edición restringida'}
                    </span>
                  </div>

                  <h2 className="mt-1.5 text-2xl font-semibold text-foreground">
                    {activeSpecies.commonName}
                  </h2>
                  <p className="text-lg italic text-muted">
                    {activeSpecies.scientificName}
                  </p>

                  <p className="mt-3 text-xs text-foreground/90">
                    <span>UICN: </span>
                    <span
                      className={
                        ['CR', 'EN', 'VU'].includes(activeSpecies.iucn)
                          ? 'font-mono font-semibold text-coral'
                          : 'font-mono text-secondary'
                      }
                    >
                      {activeSpecies.iucn}
                    </span>
                    {' · '}
                    <span>Actividad: {activeSpecies.activityCycle}</span>
                    {activeSpecies.medicalAlert && (
                      <>
                        {' · '}
                        <span className="font-medium text-coral">
                          ▲ Venenosa / interés médico
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="space-y-2 border-t border-border pt-3 text-xs text-muted">
                  <p className="font-semibold text-primary">
                    Ficha de referencia (Especie de muestra)
                  </p>
                  {speciesSightings.length > 0 ? (
                    <>
                      <p className="font-mono text-foreground/90">
                        Último avistamiento ({speciesSightings[0].observationMethod || 'En persona'}):{' '}
                        {speciesSightings[0].latitude.toFixed(6)}° N,{' '}
                        {speciesSightings[0].longitude.toFixed(6)}° W ·{' '}
                        {speciesSightings[0].elevationM} m s.n.m.
                      </p>
                      <p className="text-foreground">
                        Localidad registrada: {speciesSightings[0].locality} ·{' '}
                        <span className="text-secondary">
                          {getHoldridgeZoneInfo(speciesSightings[0].holdridgeZone).shortName}
                        </span>
                      </p>
                      {speciesSightings[0].sourceDetail && (
                        <p className="text-muted">
                          Fuente / cámara: {speciesSightings[0].sourceDetail}
                        </p>
                      )}
                      {speciesSightings[0].notes && (
                        <p className="text-foreground/90">
                          Notas de campo: {speciesSightings[0].notes}
                        </p>
                      )}
                      <LocalSightingMediaPreview sighting={speciesSightings[0]} />
                      <p>
                        Total en campo: {speciesSightings.length} avist. ({speciesTotalIndividuals} ind.)
                      </p>
                    </>
                  ) : (
                    <p className="leading-relaxed">
                      Sin ubicación inicial asignada (0 avistamientos · 0 individuos). Las coordenadas y reportes aparecerán únicamente cuando registres avistamientos reales (en persona, cámara trampa o reporte externo).
                    </p>
                  )}
                  {activeSpecies.creatorName && (
                    <p className="text-secondary">
                      Catalogado por: {activeSpecies.creatorName}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <Button
                    tone="primary"
                    onClick={() => onQuickSighting(activeSpecies.id)}
                  >
                    <Plus className="h-4 w-4" />
                    Registrar avistamiento
                  </Button>
                  <Button
                    tone="secondary"
                    onClick={requestEditSpecies}
                  >
                    {!currentUser?.isAdmin && <Lock className="h-3.5 w-3.5 text-secondary" />}
                    <Edit3 className="h-4 w-4" />
                    Editar ficha
                  </Button>
                </div>
              </div>
            </div>

            {/* Sightings registered for this species (with Admin-only Edit/Delete) */}
            {speciesSightings.length > 0 && (
              <div className="divide-y divide-border border-t border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Avistamientos registrados en campo ({speciesSightings.length})
                    </h3>
                    <p className="text-xs text-muted">
                      Total contabilizado: {speciesTotalIndividuals} individuo(s)
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {speciesSightings.map((si) => {
                    const isConfirming = confirmDeleteSightingId === si.id;
                    return (
                      <div
                        key={si.id}
                        className="flex flex-col justify-between gap-3 px-5 py-3.5 sm:flex-row sm:items-start"
                      >
                        <div className="min-w-0 flex-1 space-y-1 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-primary">
                              {si.observer}
                            </span>
                            <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
                              {si.observationMethod || 'En persona'}
                            </span>
                            <span className="font-mono font-semibold text-foreground">
                              {si.individualCount} ind.
                            </span>
                            <span className="font-mono text-muted">
                              {si.observedDate} · {si.observedTime}
                            </span>
                          </div>
                          <p className="text-foreground/90">
                            <MapPin className="mr-1 inline h-3.5 w-3.5 text-secondary" />
                            {si.locality} ·{' '}
                            <span className="text-secondary">
                              {getHoldridgeZoneInfo(si.holdridgeZone).shortName}
                            </span>
                          </p>
                          <p className="font-mono text-[11px] text-muted">
                            GPS: {si.latitude.toFixed(6)}° N, {si.longitude.toFixed(6)}° W · {si.elevationM} m s.n.m.
                          </p>
                          {si.sourceDetail && (
                            <p className="text-muted">Fuente: {si.sourceDetail}</p>
                          )}
                          {si.notes && (
                            <p className="text-foreground/85">Notas: {si.notes}</p>
                          )}
                          {si.id !== speciesSightings[0]?.id && (
                            <LocalSightingMediaPreview sighting={si} />
                          )}
                        </div>

                        {currentUser?.isAdmin && (
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {isConfirming ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSightingId(null)}
                                  className="rounded border border-border bg-input px-2.5 py-1 text-xs font-medium text-foreground hover:border-foreground/40"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteSightingId(null);
                                    void onDeleteSighting(si.id);
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-coral bg-coral/20 px-2.5 py-1 text-xs font-semibold text-coral hover:bg-coral/30"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Confirmar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteSightingId(null);
                                    onEditSighting(si);
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-secondary/35 bg-secondary/10 px-2.5 py-1 text-xs font-medium text-secondary hover:bg-secondary/20"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSightingId(si.id)}
                                  className="inline-flex items-center gap-1 rounded border border-coral/35 bg-coral/10 px-2.5 py-1 text-xs font-medium text-coral hover:bg-coral/20"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Eliminar
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Media URLs Section (Photo, Video, Audio) */}
            <div className="p-5 border-t border-border space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Enlaces Multimedia asociados (URL)
              </h3>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded border border-border p-2">
                  <span className="text-muted block font-medium">Foto URL:</span>
                  {activeSpecies.photoUrl ? (
                    <a
                      href={activeSpecies.photoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline truncate block"
                    >
                      {activeSpecies.photoUrl}
                    </a>
                  ) : (
                    <span className="text-muted/60 italic">Sin URL</span>
                  )}
                </div>
                <div className="rounded border border-border p-2">
                  <span className="text-muted block font-medium">Video URL:</span>
                  {activeSpecies.videoUrl ? (
                    <a
                      href={activeSpecies.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline truncate block"
                    >
                      {activeSpecies.videoUrl}
                    </a>
                  ) : (
                    <span className="text-muted/60 italic">Sin URL</span>
                  )}
                </div>
                <div className="rounded border border-border p-2">
                  <span className="text-muted block font-medium">Audio / Canto URL:</span>
                  {activeSpecies.bioacoustics.audioUrl ? (
                    <a
                      href={activeSpecies.bioacoustics.audioUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline truncate block"
                    >
                      {activeSpecies.bioacoustics.audioUrl}
                    </a>
                  ) : (
                    <span className="text-muted/60 italic">Sin URL</span>
                  )}
                </div>
              </div>
            </div>

            {/* Bioacoustic Status & Player */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  Registro bioacústico de referencia
                </h3>
                <p className="text-xs text-muted">
                  Estado:{' '}
                  <span className="font-medium text-foreground">
                    {activeSpecies.bioacoustics.hasCall || activeSpecies.bioacoustics.audioUrl
                      ? `Sí aplica (Posee canto / audio)`
                      : 'No aplica (Sin canto)'}
                  </span>
                </p>
                <p className="pt-1 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.bioacoustics.notes}
                </p>
              </div>
              {activeSpecies.bioacoustics.hasCall || activeSpecies.bioacoustics.audioUrl ? (
                <Button
                  tone={isPlayingCall ? 'coral' : 'secondary'}
                  onClick={() => handlePlayCall(activeSpecies)}
                >
                  {isPlayingCall ? (
                    <>
                      <Square className="h-4 w-4" />
                      Detener reproducción
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-4 w-4 text-primary" />
                      Reproducir canto
                    </>
                  )}
                </Button>
              ) : null}
            </div>

            {/* 5 Scientific & Ecological Research Blocks */}
            <div className="divide-y divide-border">
              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">
                  Cromática y anatomía del espécimen
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.ecology.chromaticsAnatomy || 'Sin datos registrados.'}
                </p>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">
                  Etología y comportamiento en sitio
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.ecology.ethologyBehavior || 'Sin datos registrados.'}
                </p>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">
                  Cortejo, reproducción y cuidado parental
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.ecology.courtshipReproduction ||
                    'Sin datos registrados.'}
                </p>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">
                  Relaciones intra e interespecíficas
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.ecology.interIntraRelations ||
                    'Sin datos registrados.'}
                </p>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">
                  Datos científicos confirmados y literatura regional
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {activeSpecies.ecology.confirmedReferences ||
                    'Pendiente de verificación bibliográfica.'}
                </p>
              </div>
            </div>

            {/* Curation Footer & Protected Delete Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <span className="font-mono text-xs text-muted">
                Actualizado: {activeSpecies.updatedAt.slice(0, 10)}
              </span>

              {confirmAdminDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-coral font-medium">
                    ¿Eliminar ficha permanentemente?
                  </span>
                  <Button tone="quiet" onClick={() => setConfirmAdminDelete(false)}>
                    Cancelar
                  </Button>
                  <Button tone="coral" onClick={executeAdminDelete}>
                    <Trash2 className="h-4 w-4" />
                    Confirmar eliminación
                  </Button>
                </div>
              ) : (
                <Button tone="coral" onClick={requestDeleteSpecies}>
                  {!currentUser?.isAdmin && <Lock className="h-3.5 w-3.5" />}
                  <Trash2 className="h-4 w-4" />
                  Eliminar ficha
                </Button>
              )}
            </div>
          </Surface>
        ) : (
          /* Create / Edit Form View */
          <Surface>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  {mode === 'create'
                    ? 'Agregar especie de muestra (sin ubicación inicial)'
                    : `Editar especie de muestra: ${draft.commonName}`}
                </h2>
                <p className="text-xs text-muted">
                  La ficha se guarda solo como muestra en la colección para ir registrando sus avistamientos posteriormente.
                </p>
              </div>
              {species.length > 0 && activeSpecies && (
                <Button tone="quiet" onClick={() => setMode('view')}>
                  Volver a lectura
                </Button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="divide-y divide-border">
              {/* Block 1: Taxonomy & Basic Metadata */}
              <div className="space-y-4 p-5">
                <h3 className="text-base font-semibold text-foreground">
                  Taxonomía y datos básicos de curaduría
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Nombre científico (binomio)"
                    hint="Cursiva"
                    htmlFor="sp-sci"
                  >
                    <input
                      id="sp-sci"
                      type="text"
                      required
                      placeholder="Ej. Pharomachrus mocinno"
                      value={draft.scientificName}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, scientificName: e.target.value }))
                      }
                      className={`${inputClassName} italic`}
                    />
                  </Field>

                  <Field
                    label="Nombre común / vernáculo"
                    htmlFor="sp-common"
                  >
                    <input
                      id="sp-common"
                      type="text"
                      required
                      placeholder="Ej. Quetzal centroamericano"
                      value={draft.commonName}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, commonName: e.target.value }))
                      }
                      className={inputClassName}
                    />
                  </Field>

                  <Field label="Grupo taxonómico" htmlFor="sp-taxon">
                    <select
                      id="sp-taxon"
                      value={draft.taxon}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          taxon: e.target.value as TaxonGroup,
                        }))
                      }
                      className={inputClassName}
                    >
                      {TAXON_GROUPS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Código de catálogo CBLS" htmlFor="sp-code">
                    <input
                      id="sp-code"
                      type="text"
                      required
                      value={draft.catalogCode}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, catalogCode: e.target.value }))
                      }
                      className={`${inputClassName} font-mono`}
                    />
                  </Field>

                  <Field label="Categoría Lista Roja UICN" htmlFor="sp-iucn">
                    <select
                      id="sp-iucn"
                      value={draft.iucn}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          iucn: e.target.value as IucnCategory,
                        }))
                      }
                      className={inputClassName}
                    >
                      {IUCN_OPTIONS.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Estado de curaduría" htmlFor="sp-curation">
                    <select
                      id="sp-curation"
                      value={draft.curationStatus}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          curationStatus: e.target.value as CurationStatus,
                        }))
                      }
                      className={inputClassName}
                    >
                      <option value="Borrador local">Borrador local</option>
                      <option value="En revisión">En revisión</option>
                      <option value="Validado">Validado</option>
                    </select>
                  </Field>

                  <Field label="Horario de actividad" htmlFor="sp-cycle">
                    <select
                      id="sp-cycle"
                      value={draft.activityCycle}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          activityCycle:
                            e.target.value as SpeciesRecord['activityCycle'],
                        }))
                      }
                      className={inputClassName}
                    >
                      <option value="Diurna">Diurna</option>
                      <option value="Nocturna">Nocturna</option>
                      <option value="Crepuscular">Crepuscular</option>
                      <option value="Permanente (Flora)">Permanente (Flora)</option>
                    </select>
                  </Field>

                  <div className="flex items-end">
                    <label className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-control border border-border bg-input px-3.5 py-2.5 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={draft.medicalAlert}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            medicalAlert: e.target.checked,
                          }))
                        }
                        className="h-5 w-5 accent-primary"
                      />
                      <span>Alerta ofídica / veneno / prioritario</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Block 2: Multimedia por URL (Fotos, Videos, Audios) */}
              <div className="space-y-4 p-5">
                <h3 className="text-base font-semibold text-foreground">
                  Multimedia por Enlace URL (Imágenes, Videos, Audios)
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="URL de Fotografía Principal"
                    hint="Pega enlace https://..."
                    htmlFor="sp-photo-url"
                  >
                    <input
                      id="sp-photo-url"
                      type="url"
                      placeholder="https://ejemplo.com/quetzal.jpg"
                      value={draft.photoUrl}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, photoUrl: e.target.value }))
                      }
                      className={inputClassName}
                    />
                  </Field>

                  <Field
                    label="Etiqueta anatómica de la foto"
                    htmlFor="sp-photo-tag"
                  >
                    <select
                      id="sp-photo-tag"
                      value={draft.photoTag}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          photoTag: e.target.value as PhotoTag,
                        }))
                      }
                      className={inputClassName}
                    >
                      {PHOTO_TAGS.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="URL de Video (opcional)"
                    hint="YouTube, Vimeo o video directo"
                    htmlFor="sp-video-url"
                  >
                    <input
                      id="sp-video-url"
                      type="url"
                      placeholder="https://ejemplo.com/comportamiento.mp4"
                      value={draft.videoUrl || ''}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, videoUrl: e.target.value }))
                      }
                      className={inputClassName}
                    />
                  </Field>

                  <Field
                    label="URL de Canto / Audio (opcional)"
                    hint="MP3, WAV o enlace sonoro"
                    htmlFor="sp-audio-url"
                  >
                    <input
                      id="sp-audio-url"
                      type="url"
                      placeholder="https://ejemplo.com/canto_macho.mp3"
                      value={draft.bioacoustics.audioUrl || ''}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          bioacoustics: { ...p.bioacoustics, audioUrl: e.target.value },
                        }))
                      }
                      className={inputClassName}
                    />
                  </Field>
                </div>
              </div>

              {/* Block 3: Bioacoustics */}
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Registro bioacústico
                    </h3>
                    <p className="text-xs text-muted">
                      Define si el taxón posee canto o estridulación
                    </p>
                  </div>

                  <div role="group" aria-label="Estado bioacústico" className="flex flex-wrap gap-2">
                    <Button
                      tone={!draft.bioacoustics.hasCall ? 'primary' : 'quiet'}
                      onClick={() =>
                        setDraft((p) => ({
                          ...p,
                          bioacoustics: {
                            ...p.bioacoustics,
                            hasCall: false,
                            notes: p.bioacoustics.notes || 'No aplica (Sin canto).',
                          },
                        }))
                      }
                    >
                      No aplica (Sin canto)
                    </Button>
                    <Button
                      tone={draft.bioacoustics.hasCall ? 'primary' : 'quiet'}
                      onClick={() =>
                        setDraft((p) => ({
                          ...p,
                          bioacoustics: {
                            ...p.bioacoustics,
                            hasCall: true,
                            dominantFreqKhz: p.bioacoustics.dominantFreqKhz ?? 2.4,
                            pulsePattern: p.bioacoustics.pulsePattern ?? 'pulse',
                          },
                        }))
                      }
                    >
                      Sí aplica (Posee canto)
                    </Button>
                  </div>
                </div>

                {draft.bioacoustics.hasCall && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      label="Frecuencia dominante (kHz)"
                      htmlFor="sp-freq"
                    >
                      <StepperInput
                        id="sp-freq"
                        value={draft.bioacoustics.dominantFreqKhz ?? 2.4}
                        min={0.4}
                        max={9.5}
                        step={0.1}
                        unit="kHz"
                        onChange={(val) =>
                          setDraft((p) => ({
                            ...p,
                            bioacoustics: {
                              ...p.bioacoustics,
                              dominantFreqKhz: val,
                            },
                          }))
                        }
                      />
                    </Field>

                    <Field label="Patrón espectral sintético" htmlFor="sp-pattern">
                      <select
                        id="sp-pattern"
                        value={draft.bioacoustics.pulsePattern ?? 'pulse'}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            bioacoustics: {
                              ...p.bioacoustics,
                              pulsePattern: e.target.value as
                                | 'flute'
                                | 'pulse'
                                | 'whistle'
                                | 'chirp',
                            },
                          }))
                        }
                        className={inputClassName}
                      >
                        <option value="flute">Silbido aflautado (Aves)</option>
                        <option value="pulse">Pulsos repetitivos (Anfibios)</option>
                        <option value="chirp">Chirridos metálicos (Insectos/Aves)</option>
                        <option value="whistle">Silbido descendente (Mamíferos)</option>
                      </select>
                    </Field>
                  </div>
                )}

                <Field
                  label="Notas de bioacústica y contexto de emisión"
                  htmlFor="sp-bio-notes"
                >
                  <textarea
                    id="sp-bio-notes"
                    rows={2}
                    value={draft.bioacoustics.notes}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        bioacoustics: { ...p.bioacoustics, notes: e.target.value },
                      }))
                    }
                    className={textareaClassName}
                  />
                </Field>
              </div>

              {/* Block 4: Sample-Only Notice (No initial location stored on species) */}
              <div className="p-5">
                <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-[#05140E] p-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      Especie de muestra (sin ubicación de avistamiento predeterminada)
                    </h3>
                    <p className="text-xs leading-relaxed text-muted">
                      Al guardar esta ficha quedará disponible en{' '}
                      <strong className="text-foreground">Colección</strong> y en el selector de{' '}
                      <strong className="text-foreground">Avistamientos</strong>. No se asigna dónde se ve ni coordenadas hasta que registres avistamientos reales en campo o desde el Mapa SIG.
                    </p>
                  </div>
                </div>
              </div>

              {/* Block 5: Ecological & Diagnostic Research Fields */}
              <div className="space-y-4 p-5">
                <h3 className="text-base font-semibold text-foreground">
                  Campos de investigación biológica y ecología
                </h3>

                <Field
                  label="Cromática y anatomía del espécimen"
                  hint="Morfología diagnóstica, patrones de color, escamación, plumaje o follaje"
                  htmlFor="eco-chrom"
                >
                  <textarea
                    id="eco-chrom"
                    rows={3}
                    value={draft.ecology.chromaticsAnatomy}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        ecology: {
                          ...p.ecology,
                          chromaticsAnatomy: e.target.value,
                        },
                      }))
                    }
                    className={textareaClassName}
                  />
                </Field>

                <Field
                  label="Etología y comportamiento en sitio"
                  hint="Termorregulación, estrato vertical, forrajeo y desplazamiento"
                  htmlFor="eco-etho"
                >
                  <textarea
                    id="eco-etho"
                    rows={3}
                    value={draft.ecology.ethologyBehavior}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        ecology: {
                          ...p.ecology,
                          ethologyBehavior: e.target.value,
                        },
                      }))
                    }
                    className={textareaClassName}
                  />
                </Field>

                <Field
                  label="Cortejo, reproducción y cuidado parental"
                  htmlFor="eco-repro"
                >
                  <textarea
                    id="eco-repro"
                    rows={2}
                    value={draft.ecology.courtshipReproduction}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        ecology: {
                          ...p.ecology,
                          courtshipReproduction: e.target.value,
                        },
                      }))
                    }
                    className={textareaClassName}
                  />
                </Field>

                <Field
                  label="Relaciones intra e interespecíficas"
                  htmlFor="eco-rel"
                >
                  <textarea
                    id="eco-rel"
                    rows={2}
                    value={draft.ecology.interIntraRelations}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        ecology: {
                          ...p.ecology,
                          interIntraRelations: e.target.value,
                        },
                      }))
                    }
                    className={textareaClassName}
                  />
                </Field>

                <Field
                  label="Datos científicos confirmados"
                  htmlFor="eco-ref"
                >
                  <textarea
                    id="eco-ref"
                    rows={2}
                    value={draft.ecology.confirmedReferences}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        ecology: {
                          ...p.ecology,
                          confirmedReferences: e.target.value,
                        },
                      }))
                    }
                    className={textareaClassName}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 p-5">
                {species.length > 0 && activeSpecies && (
                  <Button tone="quiet" onClick={() => setMode('view')}>
                    Cancelar
                  </Button>
                )}
                <Button tone="primary" type="submit">
                  Guardar ficha en catálogo CBLS
                </Button>
              </div>
            </form>
          </Surface>
        )}
      </div>
    </div>
  );
};

const LocalSightingMediaPreview: React.FC<{ sighting: SightingEntry }> = ({
  sighting,
}) => {
  const [photoSrc, setPhotoSrc] = useState<string | null>(sighting.photoUrl || null);
  const [videoSrc, setVideoSrc] = useState<string | null>(sighting.videoUrl || null);

  useEffect(() => {
    let active = true;
    const urlsToRevoke: string[] = [];

    setPhotoSrc(sighting.photoUrl || null);
    setVideoSrc(sighting.videoUrl || null);

    if (sighting.localPhotoId && !sighting.photoUrl) {
      void idbGetMediaCapture(sighting.localPhotoId).then((cap) => {
        if (!active || !cap) return;
        const objUrl = URL.createObjectURL(cap.blob);
        urlsToRevoke.push(objUrl);
        setPhotoSrc(objUrl);
      });
    }
    if (sighting.localVideoId && !sighting.videoUrl) {
      void idbGetMediaCapture(sighting.localVideoId).then((cap) => {
        if (!active || !cap) return;
        const objUrl = URL.createObjectURL(cap.blob);
        urlsToRevoke.push(objUrl);
        setVideoSrc(objUrl);
      });
    }

    return () => {
      active = false;
      urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [
    sighting.id,
    sighting.photoUrl,
    sighting.videoUrl,
    sighting.localPhotoId,
    sighting.localVideoId,
  ]);

  if (!photoSrc && !videoSrc && !sighting.localMediaSummary) {
    return null;
  }

  return (
    <div className="space-y-2 pt-1">
      {sighting.localMediaSummary && (
        <p className="font-mono text-[11px] text-secondary">
          Evidencia capturada: {sighting.localMediaSummary}
        </p>
      )}
      {(photoSrc || videoSrc) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {photoSrc && (
            <img
              src={photoSrc}
              alt="Evidencia fotográfica del avistamiento"
              className="h-28 w-full rounded-md border border-border object-cover"
            />
          )}
          {videoSrc && (
            <video
              src={videoSrc}
              controls
              className="h-28 w-full rounded-md border border-border bg-black object-cover"
            />
          )}
        </div>
      )}
    </div>
  );
};
