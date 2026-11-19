import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  FilePlus2,
  Leaf,
  Lock,
  MapPin,
  PawPrint,
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
  FAUNA_ACTIVITY_CYCLES,
  FAUNA_PHOTO_TAGS,
  FLORA_PHENOLOGY_CYCLES,
  FLORA_PHOTO_TAGS,
  formatSpeciesMarkdown,
  getHoldridgeZoneInfo,
  getKingdomSchema,
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

const IUCN_OPTIONS: { code: IucnCategory; label: string }[] = [
  { code: 'LC', label: 'LC — Preocupación menor' },
  { code: 'NT', label: 'NT — Casi amenazado' },
  { code: 'VU', label: 'VU — Vulnerable' },
  { code: 'EN', label: 'EN — En peligro' },
  { code: 'CR', label: 'CR — En peligro crítico' },
];

function getNextCatalogIndex(speciesList: SpeciesRecord[], prefix = 'CBLS-'): number {
  let maxNum = speciesList.length;
  for (const sp of speciesList) {
    if (prefix === 'CBLS-FL-' && !sp.catalogCode.startsWith('CBLS-FL-')) continue;
    const match = sp.catalogCode.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return prefix === 'CBLS-FL-'
    ? speciesList.filter((s) => s.taxon === 'Plantas' || s.catalogCode.startsWith('CBLS-FL-')).length + 1
    : maxNum + 1;
}

function createEmptySpeciesDraft(
  nextIndex: number,
  user: UserSession | null,
  kingdom: 'Animalia' | 'Plantae' = 'Animalia',
): SpeciesRecord {
  const isPlant = kingdom === 'Plantae';
  return {
    id: `sp-${Date.now()}`,
    catalogCode: `${isPlant ? 'CBLS-FL' : 'CBLS-SP'}-${String(nextIndex).padStart(3, '0')}`,
    scientificName: '',
    commonName: '',
    taxon: isPlant ? 'Plantas' : 'Aves',
    botanicalGroup: '',
    iucn: 'LC',
    medicalAlert: false,
    curationStatus: 'Borrador local',
    isSample: true,
    photoUrl: '',
    videoUrl: '',
    macroPhotoUrl: '',
    photoTag: 'Vista general',
    initialAbundanceNote: '',
    bioacoustics: {
      hasCall: false,
      audioUrl: '',
      dominantFreqKhz: 2.4,
      pulsePattern: 'pulse',
      notes: isPlant ? '' : 'No aplica (Sin canto).',
    },
    activityCycle: isPlant ? 'Permanente (Flora)' : 'Diurna',
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

  const isAdmin = Boolean(currentUser?.isAdmin);
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>(
    isAdmin && startInCreateMode ? 'create' : 'view',
  );
  const [draft, setDraft] = useState<SpeciesRecord>(() =>
    isAdmin && (startInCreateMode || !activeSpecies)
      ? createEmptySpeciesDraft(getNextCatalogIndex(species), currentUser)
      : (activeSpecies ?? createEmptySpeciesDraft(1, currentUser)),
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
  const [copiedMode, setCopiedMode] = useState<'markdown' | 'json' | null>(null);

  const filteredListSpecies = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return species;
    return species.filter(
      (sp) =>
        sp.commonName.toLowerCase().includes(q) ||
        sp.scientificName.toLowerCase().includes(q) ||
        sp.catalogCode.toLowerCase().includes(q) ||
        sp.taxon.toLowerCase().includes(q) ||
        (sp.botanicalGroup || '').toLowerCase().includes(q),
    );
  }, [species, listQuery]);

  useEffect(() => {
    if (!isAdmin && mode !== 'view') {
      setMode('view');
    }
  }, [isAdmin, mode]);

  useEffect(() => {
    if (startInCreateMode && isAdmin) {
      setMode('create');
      setDraft(createEmptySpeciesDraft(getNextCatalogIndex(species), currentUser));
      onClearCreateMode();
    } else if (startInCreateMode && !isAdmin) {
      onClearCreateMode();
    }
  }, [startInCreateMode, isAdmin, species, currentUser, onClearCreateMode]);

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

  const handleCopySpeciesExport = async (
    record: SpeciesRecord,
    format: 'markdown' | 'json',
  ) => {
    const content =
      format === 'markdown'
        ? formatSpeciesMarkdown(record)
        : JSON.stringify(record, null, 2);
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMode(format);
      window.setTimeout(() => setCopiedMode(null), 1800);
    } catch {
      // Clipboard API may be unavailable in restricted contexts
    }
  };

  const handleDraftTaxonSwitch = (nextTaxon: TaxonGroup) => {
    setDraft((prev) => {
      const nextIsPlant = nextTaxon === 'Plantas';
      const wasPlant = prev.taxon === 'Plantas';
      if (nextIsPlant === wasPlant) {
        return { ...prev, taxon: nextTaxon };
      }

      let nextCode = prev.catalogCode;
      if (mode === 'create') {
        if (nextIsPlant && prev.catalogCode.startsWith('CBLS-SP-')) {
          const floraIndex = getNextCatalogIndex(species, 'CBLS-FL-');
          nextCode = `CBLS-FL-${String(floraIndex).padStart(3, '0')}`;
        } else if (!nextIsPlant && prev.catalogCode.startsWith('CBLS-FL-')) {
          const faunaIndex = getNextCatalogIndex(species, 'CBLS-');
          nextCode = `CBLS-SP-${String(faunaIndex).padStart(3, '0')}`;
        }
      }

      const nextActivity = nextIsPlant
        ? (FLORA_PHENOLOGY_CYCLES as readonly string[]).includes(prev.activityCycle)
          ? prev.activityCycle
          : 'Permanente (Flora)'
        : (FAUNA_ACTIVITY_CYCLES as readonly string[]).includes(prev.activityCycle)
          ? prev.activityCycle
          : 'Diurna';

      const currentNotes = prev.bioacoustics.notes?.trim() || '';
      const nextNotes = nextIsPlant
        ? currentNotes === 'No aplica (Sin canto).'
          ? ''
          : prev.bioacoustics.notes
        : currentNotes || 'No aplica (Sin canto).';

      return {
        ...prev,
        taxon: nextTaxon,
        catalogCode: nextCode,
        activityCycle: nextActivity,
        bioacoustics: {
          ...prev.bioacoustics,
          hasCall: nextIsPlant ? false : prev.bioacoustics.hasCall,
          notes: nextNotes,
        },
      };
    });
  };

  const applyFloraExampleTemplate = () => {
    setDraft((prev) => ({
      ...prev,
      taxon: 'Plantas',
      catalogCode:
        prev.catalogCode.startsWith('CBLS-SP-') || !prev.catalogCode.trim()
          ? `CBLS-FL-${String(getNextCatalogIndex(species, 'CBLS-FL-')).padStart(3, '0')}`
          : prev.catalogCode,
      scientificName: 'Quercus costaricensis',
      commonName: 'Roble de altura, encino negro, roble blanco',
      botanicalGroup: 'Fagaceae (Árbol emergente del dosel)',
      iucn: 'LC',
      curationStatus: 'Borrador local',
      activityCycle: 'Fructificación',
      medicalAlert: true,
      initialAbundanceNote: 'Rodales dominantes (especie estructural del bosque montano)',
      photoTag: 'Corteza / Tallo',
      photoUrl: prev.photoUrl || '',
      macroPhotoUrl: prev.macroPhotoUrl || '',
      bioacoustics: {
        ...prev.bioacoustics,
        hasCall: false,
        notes:
          'Sustrato terrestre en suelos volcánicos humíferos y ácidos de montaña. Exposición plena en el dosel superior (25–35 m) con alta condensación de neblina.',
      },
      ecology: {
        chromaticsAnatomy:
          'Árbol robusto de hasta 35 m de altura con tronco grueso y corteza grisácea profundamente fisurada. Hojas simples, alternas, coriáceas, elípticas a obovadas con margen entero o ligeramente ondulado y envés con pubescencia ferrugínea.',
        ethologyBehavior:
          'Adaptado a bajas temperaturas nocturnas y alta radiación UV diurna mediante hojas gruesas esclerófilas con cutícula cerosa que reduce la pérdida hídrica y soporta vientos de altura.',
        courtshipReproduction:
          'Polinización anemófila (por el viento) mediante amentos colgantes. Produce bellotas ovoides parcialmente cubiertas por una cúpula escamosa; dispersión mediada por gravedad y fauna silvestre.',
        interIntraRelations:
          'Especie clave estructural: alberga cientos de especies de epífitas (orquídeas, bromelias, musgos), mantiene simbiosis ectomicorrícica obligada en sus raíces y alimenta fauna como Melanerpes formicivorus.',
        confirmedReferences:
          'Endémico de las tierras altas de Costa Rica y el oeste de Panamá (Cordillera Central y de Talamanca). Constituye la matriz forestal principal del Corredor Biológico Los Santos.',
      },
    }));
  };

  const activeSchema = getKingdomSchema(activeSpecies?.taxon);
  const draftSchema = getKingdomSchema(draft.taxon);
  const draftPhotoTagOptions = draftSchema.isPlant ? FLORA_PHOTO_TAGS : FAUNA_PHOTO_TAGS;
  const draftCycleOptions = draftSchema.isPlant ? FLORA_PHENOLOGY_CYCLES : FAUNA_ACTIVITY_CYCLES;

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
    botanicalGroup: draft.botanicalGroup?.trim() || undefined,
    macroPhotoUrl: draft.macroPhotoUrl?.trim() || undefined,
    initialAbundanceNote: draft.initialAbundanceNote?.trim() || undefined,
    bioacoustics: {
      ...draft.bioacoustics,
      hasCall: draft.taxon === 'Plantas' ? false : draft.bioacoustics.hasCall,
      notes:
        draft.bioacoustics.notes.trim() ||
        (draft.taxon === 'Plantas'
          ? 'Sin notas de sustrato registradas.'
          : 'No aplica (Sin canto).'),
    },
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
                {species.length} fichas fijadas y sincronizadas
              </p>
            </div>
            {isAdmin && (
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
            )}
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
                              {sp.medicalAlert
                                ? sp.taxon === 'Plantas'
                                  ? 'Veda / Endémica'
                                  : 'Ofídico'
                                : sp.iucn}
                            </span>
                          </>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {sp.commonName}
                      </p>
                      <p className="text-xs italic text-muted">
                        {sp.scientificName}
                        {sp.botanicalGroup ? ` · ${sp.botanicalGroup}` : ''}
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
                  {activeSchema.isPlant ? 'Diagnóstico' : 'Toma'}: {activeSpecies.photoTag}
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
                        {activeSchema.isPlant ? 'Flora · Muestra' : 'Especie de muestra'}
                      </span>
                      {' · '}
                      <span>{activeSpecies.taxon}</span>
                      {' · '}
                      <span>{activeSpecies.curationStatus}</span>
                    </p>
                    <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-muted">
                      <Lock className="h-3 w-3 text-secondary" />
                      {isAdmin ? 'Acceso Administrador · Editable' : 'Ficha fijada · Solo lectura'}
                    </span>
                  </div>

                  <h2 className="mt-1.5 text-2xl font-semibold text-foreground">
                    {activeSpecies.commonName}
                  </h2>
                  <p className="text-lg italic text-muted">
                    {activeSpecies.scientificName}
                  </p>
                  {activeSpecies.botanicalGroup && (
                    <p className="mt-1 text-xs font-medium text-secondary">
                      {activeSchema.botanicalGroupLabel}: {activeSpecies.botanicalGroup}
                    </p>
                  )}

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
                    <span>
                      {activeSchema.isPlant ? 'Fenología' : 'Actividad'}: {activeSpecies.activityCycle}
                    </span>
                    {activeSpecies.medicalAlert && (
                      <>
                        {' · '}
                        <span className="font-medium text-coral">
                          {activeSchema.alertDetailLabel}
                        </span>
                      </>
                    )}
                  </p>
                  {activeSpecies.initialAbundanceNote && (
                    <p className="mt-1.5 text-xs text-foreground/85">
                      <span className="text-muted">
                        {activeSchema.isPlant ? 'Cobertura / individuos:' : 'Abundancia de referencia:'}
                      </span>{' '}
                      {activeSpecies.initialAbundanceNote}
                    </p>
                  )}
                </div>

                <div className="space-y-2 border-t border-border pt-3 text-xs text-muted">
                  <p className="font-semibold text-primary">
                    {activeSchema.isPlant
                      ? 'Ficha botánica de referencia (Flora CBLS)'
                      : 'Ficha de referencia (Especie de muestra)'}
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
                  {isAdmin && (
                    <Button
                      tone="secondary"
                      onClick={requestEditSpecies}
                    >
                      <Edit3 className="h-4 w-4" />
                      Editar ficha
                    </Button>
                  )}
                  <Button
                    tone="quiet"
                    onClick={() => void handleCopySpeciesExport(activeSpecies, 'markdown')}
                  >
                    {copiedMode === 'markdown' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-primary" />
                        ¡Copiado MD!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copiar Markdown
                      </>
                    )}
                  </Button>
                  <Button
                    tone="quiet"
                    onClick={() => void handleCopySpeciesExport(activeSpecies, 'json')}
                  >
                    {copiedMode === 'json' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-primary" />
                        ¡Copiado JSON!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copiar JSON
                      </>
                    )}
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

            {/* Media URLs Section (Photo, Video, Macro/Herbarium or Audio) */}
            <div className="p-5 border-t border-border space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Enlaces Multimedia asociados (URL)
              </h3>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded border border-border p-2">
                  <span className="text-muted block font-medium">Foto principal URL:</span>
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
                  <span className="text-muted block font-medium">
                    {activeSchema.isPlant ? 'Foto Macro / Herbario URL:' : 'Audio / Canto URL:'}
                  </span>
                  {activeSchema.isPlant ? (
                    activeSpecies.macroPhotoUrl ? (
                      <a
                        href={activeSpecies.macroPhotoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline truncate block"
                      >
                        {activeSpecies.macroPhotoUrl}
                      </a>
                    ) : (
                      <span className="text-muted/60 italic">Sin URL</span>
                    )
                  ) : activeSpecies.bioacoustics.audioUrl ? (
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
              {activeSchema.isPlant && activeSpecies.macroPhotoUrl && (
                <div className="pt-1">
                  <img
                    src={activeSpecies.macroPhotoUrl}
                    alt={`Detalle macro / herbario de ${activeSpecies.commonName}`}
                    className="max-h-44 rounded-lg border border-border object-cover"
                  />
                </div>
              )}
            </div>

            {/* Bioacoustic Status OR Botanical Substrate/Microhabitat */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  {activeSchema.substrateOrBioHeader}
                </h3>
                {!activeSchema.isPlant && (
                  <p className="text-xs text-muted">
                    Estado:{' '}
                    <span className="font-medium text-foreground">
                      {activeSpecies.bioacoustics.hasCall || activeSpecies.bioacoustics.audioUrl
                        ? `Sí aplica (Posee canto / audio)`
                        : 'No aplica (Sin canto)'}
                    </span>
                  </p>
                )}
                <p className="pt-1 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.bioacoustics.notes || 'Sin notas registradas.'}
                </p>
              </div>
              {(!activeSchema.isPlant &&
                (activeSpecies.bioacoustics.hasCall || activeSpecies.bioacoustics.audioUrl)) ||
              (activeSchema.isPlant && activeSpecies.bioacoustics.audioUrl) ? (
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
                  {activeSchema.eco1Label}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.ecology.chromaticsAnatomy || 'Sin datos registrados.'}
                </p>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">
                  {activeSchema.eco2Label}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.ecology.ethologyBehavior || 'Sin datos registrados.'}
                </p>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">
                  {activeSchema.eco3Label}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.ecology.courtshipReproduction ||
                    'Sin datos registrados.'}
                </p>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">
                  {activeSchema.eco4Label}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {activeSpecies.ecology.interIntraRelations ||
                    'Sin datos registrados.'}
                </p>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">
                  {activeSchema.eco5Label}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {activeSpecies.ecology.confirmedReferences ||
                    'Pendiente de verificación bibliográfica.'}
                </p>
              </div>
            </div>

            {/* Curation Footer & Admin-Only Delete Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <span className="font-mono text-xs text-muted">
                Actualizado: {activeSpecies.updatedAt.slice(0, 10)}
              </span>

              {isAdmin ? (
                confirmAdminDelete ? (
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
                    <Trash2 className="h-4 w-4" />
                    Eliminar ficha
                  </Button>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
                  <Lock className="h-3.5 w-3.5 text-secondary" />
                  Ficha fijada · Solo Jorge C (Admin) puede editar o eliminar
                </span>
              )}
            </div>
          </Surface>
        ) : !isAdmin ? (
          <Surface className="p-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Catálogo sincronizado en espera de fichas
            </h2>
            <p className="mx-auto max-w-md text-xs leading-relaxed text-muted">
              Aún no hay fichas de especies cargadas. En cuanto el administrador agregue una especie con su código personal, aparecerá aquí automáticamente en tiempo real para que puedas observarla y registrar avistamientos.
            </p>
          </Surface>
        ) : (
          /* Create / Edit Form View (Admin Only) */
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
              {/* Block 0: Kingdom Selector (Fauna Animalia vs Flora Plantae) */}
              <div className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
                      1. Reino biológico (adapta los campos automáticamente)
                    </h3>
                    <p className="text-xs text-muted">
                      Cambia entre Fauna (Animalia) y Flora (Plantae) para ajustar fenología, sustrato y campos botánicos.
                    </p>
                  </div>
                  {mode === 'create' && draftSchema.isPlant && (
                    <Button tone="quiet" onClick={applyFloraExampleTemplate} className="min-h-8 text-xs">
                      <Leaf className="h-3.5 w-3.5 text-primary" />
                      Cargar ejemplo Flora (Quercus)
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDraftTaxonSwitch(
                        draft.taxon === 'Plantas' ? 'Aves' : draft.taxon,
                      )
                    }
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      !draftSchema.isPlant
                        ? 'border-primary bg-primary/15 text-foreground'
                        : 'border-border bg-input text-muted hover:border-foreground/30 hover:text-foreground'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                        !draftSchema.isPlant
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted'
                      }`}
                    >
                      <PawPrint className="h-4 w-4" />
                    </span>
                    <div>
                      <span className="block text-sm font-semibold text-foreground">
                        Fauna (Animalia)
                      </span>
                      <span className="block font-mono text-[11px] text-muted">
                        Prefijo CBLS-SP-XXX · Bioacústica y etología
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDraftTaxonSwitch('Plantas')}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      draftSchema.isPlant
                        ? 'border-primary bg-primary/15 text-foreground'
                        : 'border-border bg-input text-muted hover:border-foreground/30 hover:text-foreground'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                        draftSchema.isPlant
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted'
                      }`}
                    >
                      <Leaf className="h-4 w-4" />
                    </span>
                    <div>
                      <span className="block text-sm font-semibold text-foreground">
                        Flora (Plantae)
                      </span>
                      <span className="block font-mono text-[11px] text-muted">
                        Prefijo CBLS-FL-XXX · Fenología, sustrato y simbiosis
                      </span>
                    </div>
                  </button>
                </div>
              </div>

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
                      placeholder={
                        draftSchema.isPlant
                          ? 'Ej. Quercus costaricensis'
                          : 'Ej. Pharomachrus mocinno'
                      }
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
                      placeholder={
                        draftSchema.isPlant
                          ? 'Ej. Roble de altura, encino negro'
                          : 'Ej. Quetzal centroamericano'
                      }
                      value={draft.commonName}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, commonName: e.target.value }))
                      }
                      className={inputClassName}
                    />
                  </Field>

                  <Field label={draftSchema.taxonGroupLabel} htmlFor="sp-taxon">
                    <select
                      id="sp-taxon"
                      value={draft.taxon}
                      onChange={(e) =>
                        handleDraftTaxonSwitch(e.target.value as TaxonGroup)
                      }
                      className={inputClassName}
                    >
                      {TAXON_GROUPS.map((t) => (
                        <option key={t} value={t}>
                          {t === 'Plantas' ? 'Plantas (Flora / Plantae)' : t}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label={draftSchema.botanicalGroupLabel}
                    hint={draftSchema.isPlant ? 'Familia y hábito' : 'Opcional'}
                    htmlFor="sp-bot-group"
                  >
                    <input
                      id="sp-bot-group"
                      type="text"
                      placeholder={draftSchema.botanicalGroupPlaceholder}
                      value={draft.botanicalGroup || ''}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, botanicalGroup: e.target.value }))
                      }
                      className={inputClassName}
                    />
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

                  <Field label={draftSchema.activityLabel} htmlFor="sp-cycle">
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
                      {draftCycleOptions.map((cycle) => (
                        <option key={cycle} value={cycle}>
                          {cycle}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="flex items-end sm:col-span-2">
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
                      <span>{draftSchema.alertCheckboxLabel}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Block 2: Multimedia por URL & Diagnóstico */}
              <div className="space-y-4 p-5">
                <h3 className="text-base font-semibold text-foreground">
                  {draftSchema.isPlant
                    ? 'Multimedia y Registros Diagnósticos Botánicos'
                    : 'Multimedia por Enlace URL (Imágenes, Videos, Audios)'}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label={draftSchema.abundanceLabel}
                    hint={draftSchema.isPlant ? 'Opcional' : 'Opcional'}
                    htmlFor="sp-abundance"
                  >
                    <input
                      id="sp-abundance"
                      type="text"
                      placeholder={draftSchema.abundancePlaceholder}
                      value={draft.initialAbundanceNote || ''}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          initialAbundanceNote: e.target.value,
                        }))
                      }
                      className={inputClassName}
                    />
                  </Field>

                  <Field
                    label={draftSchema.photoTagLabel}
                    htmlFor="sp-photo-tag"
                  >
                    <select
                      id="sp-photo-tag"
                      value={
                        (draftPhotoTagOptions as readonly string[]).includes(draft.photoTag)
                          ? draft.photoTag
                          : 'Vista general'
                      }
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          photoTag: e.target.value as PhotoTag,
                        }))
                      }
                      className={inputClassName}
                    >
                      {draftPhotoTagOptions.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="URL de Fotografía Principal"
                    hint="Pega enlace https://..."
                    htmlFor="sp-photo-url"
                  >
                    <input
                      id="sp-photo-url"
                      type="url"
                      placeholder={
                        draftSchema.isPlant
                          ? 'https://ejemplo.com/quercus_costaricensis.jpg'
                          : 'https://ejemplo.com/quetzal.jpg'
                      }
                      value={draft.photoUrl}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, photoUrl: e.target.value }))
                      }
                      className={inputClassName}
                    />
                  </Field>

                  {draftSchema.isPlant ? (
                    <Field
                      label={draftSchema.macroOrExtraUrlLabel}
                      hint={draftSchema.macroOrExtraUrlHint}
                      htmlFor="sp-macro-url"
                    >
                      <input
                        id="sp-macro-url"
                        type="url"
                        placeholder={draftSchema.macroOrExtraUrlPlaceholder}
                        value={draft.macroPhotoUrl || ''}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            macroPhotoUrl: e.target.value,
                          }))
                        }
                        className={inputClassName}
                      />
                    </Field>
                  ) : (
                    <Field
                      label={draftSchema.macroOrExtraUrlLabel}
                      hint={draftSchema.macroOrExtraUrlHint}
                      htmlFor="sp-audio-url"
                    >
                      <input
                        id="sp-audio-url"
                        type="url"
                        placeholder={draftSchema.macroOrExtraUrlPlaceholder}
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
                  )}

                  <Field
                    label="URL de Video (opcional)"
                    hint="YouTube, Vimeo o video directo"
                    htmlFor="sp-video-url"
                    className="sm:col-span-2"
                  >
                    <input
                      id="sp-video-url"
                      type="url"
                      placeholder="https://ejemplo.com/registro_campo.mp4"
                      value={draft.videoUrl || ''}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, videoUrl: e.target.value }))
                      }
                      className={inputClassName}
                    />
                  </Field>
                </div>
              </div>

              {/* Block 3: Bioacoustics (Fauna) OR Substrate & Microhabitat (Flora) */}
              <div className="space-y-4 p-5">
                {draftSchema.isPlant ? (
                  <>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {draftSchema.substrateOrBioHeader}
                      </h3>
                      <p className="text-xs text-muted">
                        Documenta sustrato (terrestre, epífito, litófito), forófito hospedero, humedad y exposición solar.
                      </p>
                    </div>

                    <Field
                      label={draftSchema.substrateOrBioNotesLabel}
                      htmlFor="sp-bio-notes"
                    >
                      <textarea
                        id="sp-bio-notes"
                        rows={3}
                        placeholder={draftSchema.substrateOrBioPlaceholder}
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
                  </>
                ) : (
                  <>
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
                      label={draftSchema.substrateOrBioNotesLabel}
                      htmlFor="sp-bio-notes"
                    >
                      <textarea
                        id="sp-bio-notes"
                        rows={2}
                        placeholder={draftSchema.substrateOrBioPlaceholder}
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
                  </>
                )}
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
                  {draftSchema.ecologySectionTitle}
                </h3>

                <Field
                  label={draftSchema.eco1Label}
                  hint={draftSchema.eco1Hint}
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
                  label={draftSchema.eco2Label}
                  hint={draftSchema.eco2Hint}
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
                  label={draftSchema.eco3Label}
                  hint={draftSchema.eco3Hint}
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
                  label={draftSchema.eco4Label}
                  hint={draftSchema.eco4Hint}
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
                  label={draftSchema.eco5Label}
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
