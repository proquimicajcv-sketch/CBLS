import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Plus, Search, Trash2, X } from 'lucide-react';
import type {
  CurationStatus,
  SightingEntry,
  SpeciesRecord,
  TaxonGroup,
  UserSession,
} from '../types/cbls';
import {
  getHoldridgeZoneInfo,
  getKingdomSchema,
  TAXON_COLOR_MAP,
  TAXON_GROUPS,
} from '../utils/ecology';
import { Button, inputClassName, SpecimenImage, Surface } from './ui';

interface CollectionModuleProps {
  species: SpeciesRecord[];
  sightings: SightingEntry[];
  currentUser: UserSession | null;
  onOpenSpeciesDetail: (speciesId: string) => void;
  onQuickSighting: (speciesId: string) => void;
  onOpenNewSpecies: () => void;
  onDeleteSpecies: (speciesId: string) => Promise<boolean> | void;
}

export const CollectionModule: React.FC<CollectionModuleProps> = ({
  species,
  sightings,
  currentUser,
  onOpenSpeciesDetail,
  onQuickSighting,
  onOpenNewSpecies,
  onDeleteSpecies,
}) => {
  const [selectedTaxon, setSelectedTaxon] = useState<TaxonGroup | 'Todos'>(
    'Todos',
  );
  const [curationFilter, setCurationFilter] = useState<CurationStatus | 'Todos'>(
    'Todos',
  );
  const [query, setQuery] = useState<string>('');

  const sightingStatsBySpecies = useMemo(() => {
    const map = new Map<
      string,
      { sightingsCount: number; individuals: number; latestSighting?: SightingEntry }
    >();
    sightings.forEach((s) => {
      const prev = map.get(s.speciesId) ?? { sightingsCount: 0, individuals: 0 };
      map.set(s.speciesId, {
        sightingsCount: prev.sightingsCount + 1,
        individuals: prev.individuals + s.individualCount,
        latestSighting: prev.latestSighting ?? s,
      });
    });
    return map;
  }, [sightings]);

  const taxonBreakdown = useMemo(() => {
    const total = Math.max(1, species.length);
    return TAXON_GROUPS.map((taxon) => {
      const spInTaxon = species.filter((s) => s.taxon === taxon);
      const count = spInTaxon.length;
      const pct = species.length > 0 ? Math.round((count / total) * 100) : 0;
      const individuals = spInTaxon.reduce(
        (acc, sp) => acc + (sightingStatsBySpecies.get(sp.id)?.individuals ?? 0),
        0,
      );
      return { taxon, count, pct, individuals };
    });
  }, [species, sightingStatsBySpecies]);

  const filteredSpecies = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return species.filter((sp) => {
      if (selectedTaxon !== 'Todos' && sp.taxon !== selectedTaxon) return false;
      if (curationFilter !== 'Todos' && sp.curationStatus !== curationFilter)
        return false;
      if (!normalized) return true;
      const zoneName = sp.holdridgeZone
        ? getHoldridgeZoneInfo(sp.holdridgeZone).name.toLowerCase()
        : '';
      return (
        sp.scientificName.toLowerCase().includes(normalized) ||
        sp.commonName.toLowerCase().includes(normalized) ||
        (sp.botanicalGroup || '').toLowerCase().includes(normalized) ||
        (sp.locality || '').toLowerCase().includes(normalized) ||
        sp.catalogCode.toLowerCase().includes(normalized) ||
        zoneName.includes(normalized)
      );
    });
  }, [species, selectedTaxon, curationFilter, query]);

  return (
    <div className="space-y-6">
      {/* Taxonomic percentage count */}
      <Surface className="divide-y divide-border">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Panel de conteo y representación taxonómica
            </h2>
            <p className="text-xs text-muted">
              Filtra la colección por grupo (% sobre {species.length} especies catalogadas)
            </p>
          </div>
          {selectedTaxon !== 'Todos' && (
            <Button tone="quiet" onClick={() => setSelectedTaxon('Todos')}>
              Mostrar todos ({species.length})
            </Button>
          )}
        </div>

        <div className="divide-y divide-border sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-6">
          {taxonBreakdown.map(({ taxon, count, pct, individuals }) => {
            const isActive = selectedTaxon === taxon;
            return (
              <button
                key={taxon}
                type="button"
                onClick={() =>
                  setSelectedTaxon((prev) => (prev === taxon ? 'Todos' : taxon))
                }
                aria-pressed={isActive}
                className={`flex w-full flex-col justify-between p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  isActive
                    ? 'bg-surface-elevated text-foreground'
                    : 'hover:bg-foreground/5'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {taxon}
                  </span>
                  <span className="font-mono text-xs text-muted">{pct}%</span>
                </div>

                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-bold tabular-nums text-foreground">
                    {count}
                  </span>
                  <span className="text-xs text-muted">
                    {individuals > 0 ? `esp. · ${individuals} ind.` : 'esp. de muestra'}
                  </span>
                </div>

                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full transition-[width] duration-200"
                    style={{
                      width: `${Math.max(count > 0 ? 8 : 0, pct)}%`,
                      backgroundColor: TAXON_COLOR_MAP[taxon],
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </Surface>

      {/* Search Bar & Curation Filter */}
      <Surface className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="relative md:col-span-7">
            <label htmlFor="collection-search" className="sr-only">
              Buscar por nombre científico, nombre común, localidad o código
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="collection-search"
              type="search"
              placeholder="Buscar por nombre científico, común, familia botánica o código..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${inputClassName} pl-10 pr-10`}
            />
            {query && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className={currentUser?.isAdmin ? 'md:col-span-3' : 'md:col-span-5'}>
            <label htmlFor="curation-select" className="sr-only">
              Filtrar por estado de curaduría
            </label>
            <select
              id="curation-select"
              value={curationFilter}
              onChange={(e) =>
                setCurationFilter(e.target.value as CurationStatus | 'Todos')
              }
              className={inputClassName}
            >
              <option value="Todos">Curaduría: Todos</option>
              <option value="Validado">Curaduría: Validado</option>
              <option value="En revisión">Curaduría: En revisión</option>
              <option value="Borrador local">Curaduría: Borrador local</option>
            </select>
          </div>

          {currentUser?.isAdmin && (
            <div className="md:col-span-2">
              <Button
                tone="primary"
                onClick={onOpenNewSpecies}
                className="w-full"
              >
                <Plus className="h-4 w-4" />
                Nueva especie
              </Button>
            </div>
          )}
        </div>
      </Surface>

      {/* Filtered Specimen Cards */}
      {filteredSpecies.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredSpecies.map((sp) => {
            const stats = sightingStatsBySpecies.get(sp.id) ?? {
              sightingsCount: 0,
              individuals: 0,
              latestSighting: undefined,
            };
            const latestZone = stats.latestSighting
              ? getHoldridgeZoneInfo(stats.latestSighting.holdridgeZone)
              : null;

            return (
              <Surface
                key={sp.id}
                className="flex flex-col justify-between divide-y divide-border overflow-hidden"
              >
                <div>
                  <div className="relative aspect-[4/3] w-full border-b border-border bg-[#040D09]">
                    <SpecimenImage
                      src={sp.photoUrl}
                      alt={sp.commonName}
                      scientificName={sp.scientificName}
                      title={sp.commonName}
                      subtitle={`${sp.catalogCode} · ${sp.photoTag}`}
                      className="h-full w-full"
                    />
                    <span className="pointer-events-none absolute left-2.5 top-2.5 z-[3] rounded-full border border-primary/35 bg-[#04110B]/90 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {sp.taxon === 'Plantas'
                        ? 'Flora · Fijada'
                        : sp.taxon === 'Hongos'
                          ? 'Fungi · Fijada'
                          : 'Muestra · Fijada'}
                    </span>
                  </div>

                  <div className="space-y-2 p-4">
                    <p className="text-xs text-muted">
                      <span className="font-mono">{sp.catalogCode}</span>
                      {' · '}
                      <span>{sp.taxon}</span>
                      {' · '}
                      <span
                        className={
                          sp.curationStatus === 'Validado'
                            ? 'text-secondary'
                            : 'text-muted'
                        }
                      >
                        {sp.curationStatus}
                      </span>
                      {' · '}
                      <span
                        className={
                          ['CR', 'EN', 'VU'].includes(sp.iucn) || sp.medicalAlert
                            ? 'font-mono font-semibold text-coral'
                            : 'font-mono text-muted'
                        }
                      >
                        {sp.medicalAlert
                          ? `UICN ${sp.iucn} · ${getKingdomSchema(sp.taxon).alertBadgeShort}`
                          : `UICN ${sp.iucn}`}
                      </span>
                    </p>

                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {sp.commonName}
                      </h3>
                      <p className="text-sm italic text-muted">
                        {sp.scientificName}
                      </p>
                      {sp.botanicalGroup && (
                        <p className="mt-0.5 text-[11px] font-medium text-secondary">
                          {sp.botanicalGroup}
                        </p>
                      )}
                    </div>

                    <p className="line-clamp-2 text-xs leading-relaxed text-foreground/85">
                      {sp.ecology.chromaticsAnatomy || 'Especie de muestra en catálogo CBLS.'}
                    </p>

                    <div className="pt-1 font-mono text-xs text-muted">
                      {stats.latestSighting && latestZone ? (
                        <>
                          <span>{stats.latestSighting.elevationM} m s.n.m.</span>
                          {' · '}
                          <span className="font-sans">{latestZone.shortName}</span>
                        </>
                      ) : (
                        <span className="font-sans text-primary/85">
                          Especie de muestra · Lista para registrar avistamientos
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="font-mono text-xs">
                    {stats.sightingsCount > 0 ? (
                      <>
                        <span className="font-semibold text-primary">
                          {stats.sightingsCount} avist.
                        </span>
                        <span className="text-muted">
                          {' '}
                          · {stats.individuals} ind.
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold text-primary">
                        Solo muestra
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {currentUser?.isAdmin && (
                      <button
                        type="button"
                        title="Eliminar especie (requiere código personal)"
                        onClick={() => void onDeleteSpecies(sp.id)}
                        className="p-2 text-muted hover:text-coral transition-colors"
                        aria-label="Eliminar especie"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <Button
                      tone="quiet"
                      onClick={() => onQuickSighting(sp.id)}
                      className="min-h-9 px-2.5 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Avist.
                    </Button>
                    <Button
                      tone="secondary"
                      onClick={() => onOpenSpeciesDetail(sp.id)}
                      className="min-h-9 px-3 text-xs"
                    >
                      Ficha
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>
      ) : (
        <Surface className="p-8 text-center">
          <h3 className="text-lg font-semibold text-foreground">
            No hay especies registradas en esta vista
          </h3>
          <p className="mt-1 text-sm text-muted">
            Inicia catalogando las especies observadas en el Corredor Biológico Los Santos.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {species.length > 0 && (
              <Button
                tone="quiet"
                onClick={() => {
                  setQuery('');
                  setSelectedTaxon('Todos');
                  setCurationFilter('Todos');
                }}
              >
                Restablecer filtros
              </Button>
            )}
            {currentUser?.isAdmin && (
              <Button tone="primary" onClick={onOpenNewSpecies}>
                Agregar especie manualmente
              </Button>
            )}
          </div>
        </Surface>
      )}
    </div>
  );
};
