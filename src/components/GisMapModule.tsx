import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  ArrowUpRight,
  Camera,
  Check,
  Copy,
  Crosshair,
  Edit3,
  Globe2,
  Map as MapIcon,
  MapPin,
  Mountain,
  Plus,
  Satellite,
  Trash2,
  Video,
  Volume2,
} from 'lucide-react';
import type {
  HoldridgeZoneId,
  SightingEntry,
  SpeciesRecord,
  TaxonGroup,
  UserSession,
} from '../types/cbls';
import {
  detectHoldridgeZoneByElevation,
  estimateCblsElevationFromCoords,
  getHoldridgeZoneInfo,
  TAXON_COLOR_MAP,
  TAXON_GROUPS,
} from '../utils/ecology';
import { Button, SpecimenImage, Surface } from './ui';

interface GisMapModuleProps {
  species: SpeciesRecord[];
  sightings: SightingEntry[];
  currentUser: UserSession | null;
  onOpenSpeciesDetail: (speciesId: string) => void;
  onRegisterAtPoint: (coords: {
    latitude: number;
    longitude: number;
    elevationM: number;
    holdridgeZone: HoldridgeZoneId;
    localityHint: string;
  }) => void;
  onEditSighting: (sighting: SightingEntry) => void;
  onDeleteSighting: (sightingId: string) => Promise<boolean> | void;
}

type GoogleMapTypeOption = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';

const MAP_TYPES: Array<{
  id: GoogleMapTypeOption;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'hybrid', label: 'Híbrido', icon: Globe2 },
  { id: 'satellite', label: 'Satelital', icon: Satellite },
  { id: 'roadmap', label: 'Calles', icon: MapIcon },
  { id: 'terrain', label: 'Terreno', icon: Mountain },
];

const CBLS_SECTORS = [
  { name: 'San Gerardo de Dota', lat: 9.5525, lng: -83.8065, zoom: 14 },
  { name: 'Santa María de Dota', lat: 9.6531, lng: -83.9708, zoom: 14 },
  { name: 'San Marcos de Tarrazú', lat: 9.6602, lng: -84.0209, zoom: 14 },
  { name: 'San Pablo de León Cortés', lat: 9.6855, lng: -84.0419, zoom: 14 },
  { name: 'Cerro Buenavista', lat: 9.5562, lng: -83.7536, zoom: 14 },
];

const CBLS_DEFAULT_CENTER = { lat: 9.61, lng: -83.9 };

const MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
  (typeof __GOOGLE_MAPS_API_KEY__ !== 'undefined'
    ? __GOOGLE_MAPS_API_KEY__
    : '');

interface ProbePoint {
  lat: number;
  lng: number;
  elevationM: number;
  holdridgeZone: HoldridgeZoneId;
  elevationSource: 'google' | 'modelo';
  originLabel: string;
}

interface SightingMarkerProps {
  sighting: SightingEntry;
  species?: SpeciesRecord;
  isSelected: boolean;
  onSelect: (sightingId: string) => void;
}

const SightingAdvancedMarker: React.FC<SightingMarkerProps> = ({
  sighting,
  species,
  isSelected,
  onSelect,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const color = species ? TAXON_COLOR_MAP[species.taxon] : '#86E5B0';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: sighting.latitude, lng: sighting.longitude }}
        title={`${species?.commonName || 'Avistamiento'} · ${sighting.locality}`}
        onClick={() => onSelect(sighting.id)}
      >
        <Pin
          background={color}
          borderColor={isSelected ? '#FFFFFF' : '#030F0A'}
          glyphColor="#030F0A"
          scale={isSelected ? 1.25 : 1}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow
          anchor={marker}
          maxWidth={250}
          onCloseClick={() => onSelect('')}
        >
          <div className="space-y-1 p-1 text-slate-900">
            <p className="text-xs font-bold">
              {species?.commonName || 'Especie registrada'}
            </p>
            <p className="text-[11px] italic text-slate-600">
              {species?.scientificName || 'Indeterminado'}
            </p>
            <p className="font-mono text-[11px] text-slate-800">
              {sighting.latitude.toFixed(6)}, {sighting.longitude.toFixed(6)}
            </p>
            <p className="text-[11px] text-slate-700">
              {sighting.elevationM} m s.n.m. · {sighting.individualCount} ind.
            </p>
            <p className="text-[11px] font-semibold text-slate-800">
              Método: {sighting.observationMethod || 'En persona'}
            </p>
            <p className="text-[11px] font-medium text-emerald-800">
              Registró: {sighting.observer}
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface InteractiveMapCanvasProps {
  mapType: GoogleMapTypeOption;
  filteredSightings: SightingEntry[];
  speciesLookup: Record<string, SpeciesRecord>;
  selectedSightingId: string | null;
  onSelectSighting: (id: string) => void;
  probePoint: ProbePoint | null;
  onSetProbePoint: (pt: ProbePoint | null) => void;
  pendingFocusSector: { lat: number; lng: number; zoom: number } | null;
  onConsumedFocus: () => void;
  onGpsLocated: (lat: number, lng: number, altMeters?: number | null) => void;
  gpsTriggerCount: number;
}

const InteractiveMapCanvas: React.FC<InteractiveMapCanvasProps> = ({
  mapType,
  filteredSightings,
  speciesLookup,
  selectedSightingId,
  onSelectSighting,
  probePoint,
  onSetProbePoint,
  pendingFocusSector,
  onConsumedFocus,
  onGpsLocated,
  gpsTriggerCount,
}) => {
  const map = useMap();
  const elevationLib = useMapsLibrary('elevation');
  const loadingStatus = useApiLoadingStatus();

  const resolveElevationAndSetProbe = useCallback(
    async (
      rawLat: number,
      rawLng: number,
      originLabel: string,
      gpsAltitude?: number | null,
    ) => {
      const lat = Number(rawLat.toFixed(6));
      const lng = Number(rawLng.toFixed(6));
      const fallbackElev =
        typeof gpsAltitude === 'number' && Number.isFinite(gpsAltitude)
          ? Math.round(gpsAltitude)
          : estimateCblsElevationFromCoords(lat, lng);

      // Immediate feedback with fallback/GPS altitude
      onSetProbePoint({
        lat,
        lng,
        elevationM: fallbackElev,
        holdridgeZone: detectHoldridgeZoneByElevation(fallbackElev),
        elevationSource: 'modelo',
        originLabel,
      });

      // Refine with Google Maps Elevation Service when available
      if (elevationLib && navigator.onLine) {
        try {
          const elevator = new elevationLib.ElevationService();
          const res = await elevator.getElevationForLocations({
            locations: [{ lat, lng }],
          });
          const elevMeters = res.results?.[0]?.elevation;
          if (typeof elevMeters === 'number' && Number.isFinite(elevMeters)) {
            const rounded = Math.max(0, Math.round(elevMeters));
            onSetProbePoint({
              lat,
              lng,
              elevationM: rounded,
              holdridgeZone: detectHoldridgeZoneByElevation(rounded),
              elevationSource: 'google',
              originLabel,
            });
          }
        } catch {
          // Keep fallback elevation gracefully
        }
      }
    },
    [elevationLib, onSetProbePoint],
  );

  // Focus camera when a sector chip is clicked
  useEffect(() => {
    if (!map || !pendingFocusSector) return;
    map.panTo({ lat: pendingFocusSector.lat, lng: pendingFocusSector.lng });
    map.setZoom(pendingFocusSector.zoom);
    onConsumedFocus();
  }, [map, pendingFocusSector, onConsumedFocus]);

  // Trigger GPS location + pan when requested by parent toolbar
  useEffect(() => {
    if (gpsTriggerCount === 0) return;
    if (!('geolocation' in navigator)) {
      const lat = 9.5525;
      const lng = -83.8065;
      if (map) {
        map.panTo({ lat, lng });
        map.setZoom(15);
      }
      resolveElevationAndSetProbe(lat, lng, 'Referencia Estación San Gerardo');
      onGpsLocated(lat, lng, 2240);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        if (map) {
          map.panTo({ lat, lng });
          map.setZoom(16);
        }
        resolveElevationAndSetProbe(
          lat,
          lng,
          'GPS satelital del dispositivo',
          pos.coords.altitude,
        );
        onGpsLocated(lat, lng, pos.coords.altitude);
      },
      () => {
        const lat = 9.5525;
        const lng = -83.8065;
        if (map) {
          map.panTo({ lat, lng });
          map.setZoom(15);
        }
        resolveElevationAndSetProbe(
          lat,
          lng,
          'Referencia CBLS (sin permiso GPS)',
          2240,
        );
        onGpsLocated(lat, lng, 2240);
      },
      { enableHighAccuracy: true, timeout: 6000 },
    );
  }, [gpsTriggerCount, map, onGpsLocated, resolveElevationAndSetProbe]);

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      const latLng = ev.detail.latLng;
      if (!latLng) return;
      resolveElevationAndSetProbe(
        latLng.lat,
        latLng.lng,
        'Punto marcado en el mapa',
      );
    },
    [resolveElevationAndSetProbe],
  );

  if (
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="flex h-[480px] flex-col items-center justify-center gap-3 rounded-control border border-coral/35 bg-[#05140D] p-6 text-center">
        <MapPin className="h-8 w-8 text-coral" />
        <h3 className="text-base font-semibold text-foreground">
          No se pudo inicializar Google Maps en este momento
        </h3>
        <p className="max-w-md text-xs text-muted">
          Verifica tu conexión a internet o el estado de tu clave de Google Maps
          Platform. Los avistamientos almacenados en IndexedDB permanecen intactos.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-control border border-primary/20 bg-[#05140D] sm:h-[540px]">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        defaultCenter={CBLS_DEFAULT_CENTER}
        defaultZoom={11}
        mapTypeId={mapType}
        gestureHandling="greedy"
        streetViewControl={true}
        fullscreenControl={true}
        mapTypeControl={false}
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
      >
        {filteredSightings.map((obs) => (
          <SightingAdvancedMarker
            key={obs.id}
            sighting={obs}
            species={speciesLookup[obs.speciesId]}
            isSelected={selectedSightingId === obs.id}
            onSelect={(id) => onSelectSighting(id)}
          />
        ))}

        {probePoint && (
          <AdvancedMarker
            position={{ lat: probePoint.lat, lng: probePoint.lng }}
            title={`Punto seleccionado: ${probePoint.lat.toFixed(6)}, ${probePoint.lng.toFixed(6)}`}
          >
            <Pin
              background="#86E5B0"
              borderColor="#030F0A"
              glyphColor="#030F0A"
              scale={1.2}
            />
          </AdvancedMarker>
        )}
      </GoogleMap>
    </div>
  );
};

export const GisMapModule: React.FC<GisMapModuleProps> = ({
  species,
  sightings,
  currentUser,
  onOpenSpeciesDetail,
  onRegisterAtPoint,
  onEditSighting,
  onDeleteSighting,
}) => {
  const [taxonFilter, setTaxonFilter] = useState<TaxonGroup | 'Todos'>('Todos');
  const [mapType, setMapType] = useState<GoogleMapTypeOption>('hybrid');
  const [selectedSightingId, setSelectedSightingId] = useState<string | null>(
    sightings[0]?.id ?? null,
  );
  const [probePoint, setProbePoint] = useState<ProbePoint | null>(null);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);
  const [gpsTriggerCount, setGpsTriggerCount] = useState<number>(0);
  const [confirmDeleteSightingId, setConfirmDeleteSightingId] = useState<
    string | null
  >(null);
  const [pendingFocusSector, setPendingFocusSector] = useState<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);

  const speciesLookup = useMemo<Record<string, SpeciesRecord>>(() => {
    const record: Record<string, SpeciesRecord> = {};
    for (const sp of species) {
      record[sp.id] = sp;
    }
    return record;
  }, [species]);

  const filteredSightings = useMemo(() => {
    return sightings.filter((obs) => {
      if (taxonFilter === 'Todos') return true;
      const sp = speciesLookup[obs.speciesId];
      return sp?.taxon === taxonFilter;
    });
  }, [sightings, speciesLookup, taxonFilter]);

  const activeSighting =
    filteredSightings.find((s) => s.id === selectedSightingId) ??
    filteredSightings[0] ??
    null;
  const activeSpecies = activeSighting
    ? speciesLookup[activeSighting.speciesId]
    : null;

  const handleCopyProbeCoords = async () => {
    if (!probePoint) return;
    const text = `${probePoint.lat.toFixed(6)}, ${probePoint.lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCoords(true);
      window.setTimeout(() => setCopiedCoords(false), 2000);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const handleGpsLocated = useCallback(() => {
    // Handled inside InteractiveMapCanvas probe state
  }, []);

  const handleConsumedFocus = useCallback(() => {
    setPendingFocusSector(null);
  }, []);

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <Surface className="divide-y divide-border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Mapa SIG Real — Corredor Biológico Los Santos
            </h2>
            <p className="text-xs text-muted">
              Haz clic en cualquier punto del mapa para obtener coordenadas WGS84
              exactas (6 decimales), elevación y zona Holdridge
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Basemap Type Switcher: Satélite, Híbrido, Calles, Terreno */}
            <div
              className="flex flex-wrap items-center rounded-lg border border-border bg-input p-1"
              role="group"
              aria-label="Tipo de mapa"
            >
              {MAP_TYPES.map((type) => {
                const Icon = type.icon;
                const active = mapType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setMapType(type.id)}
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {type.label}
                  </button>
                );
              })}
            </div>

            <Button
              tone="secondary"
              onClick={() => setGpsTriggerCount((c) => c + 1)}
              className="min-h-10 px-3 text-xs"
            >
              <Crosshair className="h-4 w-4 text-primary" />
              Mi GPS exacto
            </Button>
          </div>
        </div>

        {/* Sector Quick Jumps + Taxon Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium text-muted">
              Filtrar taxón:
            </span>
            <button
              type="button"
              onClick={() => setTaxonFilter('Todos')}
              className={`min-h-8 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors ${
                taxonFilter === 'Todos'
                  ? 'border-primary bg-primary font-semibold text-primary-foreground'
                  : 'border-border bg-input text-foreground hover:border-foreground/40'
              }`}
            >
              Todos ({sightings.length})
            </button>

            {TAXON_GROUPS.map((taxon) => {
              const count = sightings.filter(
                (s) => speciesLookup[s.speciesId]?.taxon === taxon,
              ).length;
              const active = taxonFilter === taxon;
              return (
                <button
                  key={taxon}
                  type="button"
                  onClick={() => setTaxonFilter(taxon)}
                  className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary font-semibold text-primary-foreground'
                      : 'border-border bg-input text-foreground hover:border-foreground/40'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: active
                        ? '#030F0A'
                        : TAXON_COLOR_MAP[taxon],
                    }}
                  />
                  {taxon} ({count})
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted">Sectores:</span>
            {CBLS_SECTORS.map((sec) => (
              <button
                key={sec.name}
                type="button"
                onClick={() =>
                  setPendingFocusSector({
                    lat: sec.lat,
                    lng: sec.lng,
                    zoom: sec.zoom,
                  })
                }
                className="rounded-md border border-border bg-[#05140D] px-2 py-1 text-[11px] text-muted transition-colors hover:border-primary/45 hover:text-primary"
              >
                {sec.name}
              </button>
            ))}
          </div>
        </div>
      </Surface>

      {/* Main Split: Real Interactive Google Map + Exact Coordinate Inspector / Selected Sighting */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Surface inset className="overflow-hidden lg:col-span-8">
          <div className="p-3">
            {MAPS_API_KEY ? (
              <APIProvider
                apiKey={MAPS_API_KEY}
                libraries={['marker', 'elevation']}
                language="es"
                region="CR"
              >
                <InteractiveMapCanvas
                  mapType={mapType}
                  filteredSightings={filteredSightings}
                  speciesLookup={speciesLookup}
                  selectedSightingId={selectedSightingId}
                  onSelectSighting={(id) => setSelectedSightingId(id || null)}
                  probePoint={probePoint}
                  onSetProbePoint={setProbePoint}
                  pendingFocusSector={pendingFocusSector}
                  onConsumedFocus={handleConsumedFocus}
                  onGpsLocated={handleGpsLocated}
                  gpsTriggerCount={gpsTriggerCount}
                />
              </APIProvider>
            ) : (
              <div className="flex h-[480px] flex-col items-center justify-center gap-3 rounded-control border border-border bg-[#05140D] p-6 text-center">
                <MapPin className="h-8 w-8 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Clave de Google Maps pendiente de configuración
                </h3>
                <p className="max-w-md text-xs text-muted">
                  Configura la variable de entorno{' '}
                  <span className="font-mono text-primary">
                    VITE_GOOGLE_MAPS_API_KEY
                  </span>{' '}
                  en el panel de ajustes de Google Maps para cargar la vista
                  satelital y de calles interactiva.
                </p>
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
              <span>
                Mostrando {filteredSightings.length} avistamientos en mapa real ·
                Toca cualquier punto para obtener sus coordenadas exactas
              </span>
              <span className="font-mono text-primary">Datum: WGS84</span>
            </div>
          </div>
        </Surface>

        {/* Right Column: Exact Coordinate Probe + Selected Sighting Inspector */}
        <div className="space-y-4 lg:col-span-4">
          {/* Exact Coordinate Inspector Card */}
          <Surface elevated className="space-y-3 border-primary/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Coordenadas exactas del punto
                </h3>
              </div>
              {probePoint && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  {probePoint.elevationSource === 'google'
                    ? 'Elevación real'
                    : 'Estimado CBLS'}
                </span>
              )}
            </div>

            {probePoint ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-primary/25 bg-[#030F0A] p-3 font-mono text-xs">
                  <p className="text-[11px] text-muted">
                    {probePoint.originLabel}
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-primary">
                    {probePoint.lat.toFixed(6)}, {probePoint.lng.toFixed(6)}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 text-[11px] text-foreground/90">
                    <span>Lat: {probePoint.lat.toFixed(6)}° N</span>
                    <span>Lon: {probePoint.lng.toFixed(6)}° W</span>
                    <span>Altitud: {probePoint.elevationM} m s.n.m.</span>
                    <span className="truncate text-secondary">
                      {getHoldridgeZoneInfo(probePoint.holdridgeZone).shortName}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    tone="quiet"
                    onClick={handleCopyProbeCoords}
                    className="min-h-10 flex-1 text-xs"
                  >
                    {copiedCoords ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-primary" />
                        Copiadas
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copiar coords
                      </>
                    )}
                  </Button>
                  <Button
                    tone="primary"
                    onClick={() =>
                      onRegisterAtPoint({
                        latitude: probePoint.lat,
                        longitude: probePoint.lng,
                        elevationM: probePoint.elevationM,
                        holdridgeZone: probePoint.holdridgeZone,
                        localityHint: `Punto SIG (${getHoldridgeZoneInfo(probePoint.holdridgeZone).shortName})`,
                      })
                    }
                    className="min-h-10 flex-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Registrar aquí
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted">
                Haz clic sobre cualquier lugar del mapa o presiona{' '}
                <strong className="text-primary">&quot;Mi GPS exacto&quot;</strong>{' '}
                para generar latitud y longitud exactas (6 decimales), altitud y
                zona de vida Holdridge.
              </p>
            )}
          </Surface>

          {/* Selected Sighting Detail Panel */}
          {activeSighting ? (
            <Surface className="divide-y divide-border overflow-hidden">
              <div className="aspect-[16/9] w-full bg-background">
                <SpecimenImage
                  src={activeSighting.photoUrl || activeSpecies?.photoUrl}
                  alt={activeSpecies?.commonName || 'Avistamiento'}
                  scientificName={
                    activeSpecies?.scientificName || 'Indeterminado'
                  }
                  className="h-full w-full"
                />
              </div>

              <div className="space-y-3 p-5">
                <p className="text-xs text-muted">
                  <span className="font-semibold text-primary">
                    Brigadista: {activeSighting.observer}
                  </span>
                  {' · '}
                  <span>{activeSpecies?.taxon || 'Taxón'}</span>
                  {' · '}
                  <span className="font-mono">
                    {activeSpecies?.catalogCode || 'CBLS'}
                  </span>
                </p>

                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    {activeSpecies?.commonName || 'Especie registrada'}
                  </h3>
                  <p className="text-sm italic text-muted">
                    {activeSpecies?.scientificName || 'Indeterminado'}
                  </p>
                </div>

                <div className="space-y-1.5 border-t border-border pt-3 text-xs text-foreground/90">
                  <p>
                    <span className="text-muted">Localidad:</span>{' '}
                    {activeSighting.locality}
                  </p>
                  <p className="font-mono">
                    <span className="font-sans text-muted">Coordenadas:</span>{' '}
                    {activeSighting.latitude.toFixed(6)}° N,{' '}
                    {activeSighting.longitude.toFixed(6)}° W
                  </p>
                  <p className="font-mono">
                    <span className="font-sans text-muted">Altitud:</span>{' '}
                    {activeSighting.elevationM} m s.n.m.
                  </p>
                  <p>
                    <span className="text-muted">Zona Holdridge:</span>{' '}
                    <span className="text-secondary">
                      {getHoldridgeZoneInfo(activeSighting.holdridgeZone).name}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted">Método de detección:</span>{' '}
                    <span className="font-medium text-primary">
                      {activeSighting.observationMethod || 'En persona'}
                    </span>
                    {activeSighting.sourceDetail ? (
                      <span className="text-muted"> · {activeSighting.sourceDetail}</span>
                    ) : null}
                  </p>
                  <p>
                    <span className="text-muted">Conteo:</span>{' '}
                    <span className="font-mono font-semibold text-primary">
                      {activeSighting.individualCount} ind.
                    </span>{' '}
                    ({activeSighting.observedDate} ·{' '}
                    {activeSighting.observedTime})
                  </p>
                  {activeSighting.notes && (
                    <p className="pt-1 text-foreground/90">
                      <span className="text-muted">Notas:</span> {activeSighting.notes}
                    </p>
                  )}
                  {activeSighting.localMediaSummary && (
                    <p className="font-mono text-[11px] text-secondary">
                      Evidencia local: {activeSighting.localMediaSummary}
                    </p>
                  )}

                  {(activeSighting.photoUrl ||
                    activeSighting.videoUrl ||
                    activeSighting.audioUrl) && (
                    <div className="flex flex-wrap gap-2 pt-2 text-xs">
                      {activeSighting.photoUrl && (
                        <a
                          href={activeSighting.photoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-primary hover:underline"
                        >
                          <Camera className="h-3 w-3" /> Ver Foto
                        </a>
                      )}
                      {activeSighting.videoUrl && (
                        <a
                          href={activeSighting.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-primary hover:underline"
                        >
                          <Video className="h-3 w-3" /> Ver Video
                        </a>
                      )}
                      {activeSighting.audioUrl && (
                        <a
                          href={activeSighting.audioUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-primary hover:underline"
                        >
                          <Volume2 className="h-3 w-3" /> Escuchar Canto
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {activeSpecies && (
                    <Button
                      tone="secondary"
                      onClick={() => onOpenSpeciesDetail(activeSpecies.id)}
                      className="flex-1"
                    >
                      Ver ficha completa
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    tone="primary"
                    onClick={() =>
                      onRegisterAtPoint({
                        latitude: activeSighting.latitude,
                        longitude: activeSighting.longitude,
                        elevationM: activeSighting.elevationM,
                        holdridgeZone: activeSighting.holdridgeZone,
                        localityHint: activeSighting.locality,
                      })
                    }
                    className="flex-1"
                  >
                    <Plus className="h-4 w-4" />
                    Nuevo en sitio
                  </Button>
                </div>

                {currentUser?.isAdmin && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                    {confirmDeleteSightingId === activeSighting.id ? (
                      <>
                        <span className="mr-auto text-xs font-medium text-coral">
                          ¿Eliminar este avistamiento?
                        </span>
                        <Button
                          tone="quiet"
                          onClick={() => setConfirmDeleteSightingId(null)}
                          className="min-h-9 text-xs"
                        >
                          Cancelar
                        </Button>
                        <Button
                          tone="coral"
                          onClick={() => {
                            const idToDel = activeSighting.id;
                            setConfirmDeleteSightingId(null);
                            void onDeleteSighting(idToDel);
                          }}
                          className="min-h-9 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Confirmar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          tone="secondary"
                          onClick={() => {
                            setConfirmDeleteSightingId(null);
                            onEditSighting(activeSighting);
                          }}
                          className="min-h-9 flex-1 text-xs"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar avistamiento
                        </Button>
                        <Button
                          tone="coral"
                          onClick={() => setConfirmDeleteSightingId(activeSighting.id)}
                          className="min-h-9 flex-1 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar avistamiento
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Surface>
          ) : (
            <Surface className="p-6 text-center">
              <h3 className="text-base font-semibold text-foreground">
                Sin avistamientos filtrados
              </h3>
              <p className="mt-1 text-sm text-muted">
                Toca cualquier punto del mapa satelital o de calles para generar
                coordenadas exactas y registrar tu primer avistamiento.
              </p>
            </Surface>
          )}
        </div>
      </div>
    </div>
  );
};
