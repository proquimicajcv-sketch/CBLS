import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

type GisLayerOption = 'hybrid' | 'satellite' | 'roadmap' | 'terrain';

const MAP_TYPES: Array<{
  id: GisLayerOption;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'hybrid', label: 'Híbrido', icon: Globe2 },
  { id: 'satellite', label: 'Satelital', icon: Satellite },
  { id: 'roadmap', label: 'Calles', icon: MapIcon },
  { id: 'terrain', label: 'Terreno', icon: Mountain },
];

// Coordenadas verificadas del Parque Central de San Marcos de Tarrazú (OpenStreetMap)
const PARQUE_CENTRAL_SAN_MARCOS = {
  lat: 9.659503,
  lng: -84.022267,
  zoom: 16,
};

const CBLS_SECTORS = [
  {
    name: 'San Marcos (Parque Central)',
    lat: PARQUE_CENTRAL_SAN_MARCOS.lat,
    lng: PARQUE_CENTRAL_SAN_MARCOS.lng,
    zoom: PARQUE_CENTRAL_SAN_MARCOS.zoom,
  },
  { name: 'San Gerardo de Dota', lat: 9.5525, lng: -83.8065, zoom: 14 },
  { name: 'Santa María de Dota', lat: 9.6531, lng: -83.9708, zoom: 14 },
  { name: 'San Pablo de León Cortés', lat: 9.6855, lng: -84.0419, zoom: 14 },
  { name: 'Cerro Buenavista', lat: 9.5562, lng: -83.7536, zoom: 14 },
];

interface ProbePoint {
  lat: number;
  lng: number;
  elevationM: number;
  holdridgeZone: HoldridgeZoneId;
  elevationSource: 'dem' | 'modelo';
  originLabel: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPinIcon(fill: string, isSelected: boolean, isProbe = false): L.DivIcon {
  const size = isSelected || isProbe ? 34 : 28;
  const ring = isSelected ? '#FFFFFF' : '#030F0A';
  const strokeWidth = isSelected ? 2.6 : 2;
  const centerDot = isProbe ? '#030F0A' : '#030F0A';

  return L.divIcon({
    className: 'cbls-leaflet-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 2],
    popupAnchor: [0, -(size - 6)],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.65)); display:block;">
      <path d="M14 2C8.9 2 4.8 6.1 4.8 11.2c0 6.8 9.2 14.8 9.2 14.8s9.2-8 9.2-14.8C23.2 6.1 19.1 2 14 2z" fill="${escapeHtml(fill)}" stroke="${ring}" stroke-width="${strokeWidth}"/>
      <circle cx="14" cy="11" r="3.4" fill="${centerDot}" />
    </svg>`,
  });
}

function createLandmarkIcon(): L.DivIcon {
  return L.divIcon({
    className: 'cbls-leaflet-landmark',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -10],
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:#071912;border:2px solid #86E5B0;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.6);">
      <div style="width:7px;height:7px;border-radius:9999px;background:#86E5B0;"></div>
    </div>`,
  });
}

function buildLayerGroup(layerType: GisLayerOption): L.LayerGroup {
  if (layerType === 'satellite') {
    return L.layerGroup([
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
          maxZoom: 19,
        },
      ),
    ]);
  }

  if (layerType === 'roadmap') {
    return L.layerGroup([
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }),
    ]);
  }

  if (layerType === 'terrain') {
    return L.layerGroup([
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Topografía © Esri, USGS, OpenStreetMap',
          maxZoom: 19,
        },
      ),
    ]);
  }

  // Híbrido: satélite Esri + calles/límites/lugares de referencia
  return L.layerGroup([
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Satélite © Esri · Referencia © Esri / OSM',
        maxZoom: 19,
      },
    ),
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        opacity: 0.85,
      },
    ),
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
      },
    ),
  ]);
}

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
  const [mapType, setMapType] = useState<GisLayerOption>('hybrid');
  const [selectedSightingId, setSelectedSightingId] = useState<string | null>(
    null,
  );
  const [probePoint, setProbePoint] = useState<ProbePoint | null>(null);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const probeLayerRef = useRef<L.LayerGroup | null>(null);

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

      setProbePoint({
        lat,
        lng,
        elevationM: fallbackElev,
        holdridgeZone: detectHoldridgeZoneByElevation(fallbackElev),
        elevationSource: 'modelo',
        originLabel,
      });

      if (navigator.onLine) {
        try {
          const resp = await fetch(
            `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
          );
          if (resp.ok) {
            const payload = (await resp.json()) as { elevation?: number[] };
            const demElev = payload?.elevation?.[0];
            if (typeof demElev === 'number' && Number.isFinite(demElev)) {
              const rounded = Math.max(0, Math.round(demElev));
              setProbePoint({
                lat,
                lng,
                elevationM: rounded,
                holdridgeZone: detectHoldridgeZoneByElevation(rounded),
                elevationSource: 'dem',
                originLabel,
              });
            }
          }
        } catch {
          // Keep offline/model elevation gracefully
        }
      }
    },
    [],
  );

  // Initialize Leaflet map once, always centered on Parque Central, San Marcos de Tarrazú
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    const map = L.map(container, {
      center: [PARQUE_CENTRAL_SAN_MARCOS.lat, PARQUE_CENTRAL_SAN_MARCOS.lng],
      zoom: PARQUE_CENTRAL_SAN_MARCOS.zoom,
      zoomControl: true,
    });

    L.control.scale({ imperial: false, metric: true }).addTo(map);

    const baseGroup = buildLayerGroup('hybrid').addTo(map);
    const markersGroup = L.layerGroup().addTo(map);
    const probeGroup = L.layerGroup().addTo(map);

    // Reference marker on Parque Central, San Marcos de Tarrazú
    L.marker([PARQUE_CENTRAL_SAN_MARCOS.lat, PARQUE_CENTRAL_SAN_MARCOS.lng], {
      icon: createLandmarkIcon(),
      title: 'Parque Central, San Marcos de Tarrazú',
    })
      .bindPopup(
        `<div style="font-family:sans-serif;color:#0f172a;">
          <strong style="font-size:13px;">Parque Central, San Marcos de Tarrazú</strong><br/>
          <span style="font-size:11px;color:#334155;">Punto de referencia inicial · CBLS</span><br/>
          <span style="font-family:monospace;font-size:11px;">${PARQUE_CENTRAL_SAN_MARCOS.lat.toFixed(6)}, ${PARQUE_CENTRAL_SAN_MARCOS.lng.toFixed(6)}</span>
        </div>`,
      )
      .addTo(map);

    map.on('click', (ev: L.LeafletMouseEvent) => {
      void resolveElevationAndSetProbe(
        ev.latlng.lat,
        ev.latlng.lng,
        'Punto marcado en el mapa',
      );
    });

    mapInstanceRef.current = map;
    baseLayerGroupRef.current = baseGroup;
    markersLayerRef.current = markersGroup;
    probeLayerRef.current = probeGroup;

    // Ensure tiles size cleanly once container settles
    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
      baseLayerGroupRef.current = null;
      markersLayerRef.current = null;
      probeLayerRef.current = null;
    };
  }, [resolveElevationAndSetProbe]);

  // Swap basemap layer without losing map position or markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (baseLayerGroupRef.current) {
      map.removeLayer(baseLayerGroupRef.current);
    }
    const nextGroup = buildLayerGroup(mapType);
    nextGroup.addTo(map);
    baseLayerGroupRef.current = nextGroup;
  }, [mapType]);

  // Sync filtered sighting markers onto the map
  useEffect(() => {
    const markersGroup = markersLayerRef.current;
    if (!markersGroup) return;

    markersGroup.clearLayers();

    for (const obs of filteredSightings) {
      const sp = speciesLookup[obs.speciesId];
      const color = sp ? TAXON_COLOR_MAP[sp.taxon] : '#86E5B0';
      const isSelected = selectedSightingId === obs.id;
      const marker = L.marker([obs.latitude, obs.longitude], {
        icon: createPinIcon(color, isSelected),
        title: `${sp?.commonName || 'Avistamiento'} · ${obs.locality}`,
      });

      const popupHtml = `
        <div style="min-width:190px;max-width:240px;font-family:sans-serif;color:#0f172a;line-height:1.35;">
          <div style="font-size:13px;font-weight:700;">${escapeHtml(sp?.commonName || 'Especie registrada')}</div>
          <div style="font-size:11px;font-style:italic;color:#475569;margin-bottom:4px;">${escapeHtml(sp?.scientificName || 'Indeterminado')}</div>
          <div style="font-family:monospace;font-size:11px;color:#1e293b;">${obs.latitude.toFixed(6)}, ${obs.longitude.toFixed(6)}</div>
          <div style="font-size:11px;color:#334155;">${obs.elevationM} m s.n.m. · ${obs.individualCount} ind.</div>
          <div style="font-size:11px;font-weight:600;color:#1e293b;margin-top:2px;">Método: ${escapeHtml(obs.observationMethod || 'En persona')}</div>
          <div style="font-size:11px;font-weight:600;color:#065f46;">Registró: ${escapeHtml(obs.observer)}</div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        setSelectedSightingId(obs.id);
      });

      marker.addTo(markersGroup);
      if (isSelected) {
        marker.openPopup();
      }
    }
  }, [filteredSightings, speciesLookup, selectedSightingId]);

  // Sync user probe pin onto the map
  useEffect(() => {
    const probeGroup = probeLayerRef.current;
    if (!probeGroup) return;

    probeGroup.clearLayers();
    if (!probePoint) return;

    L.marker([probePoint.lat, probePoint.lng], {
      icon: createPinIcon('#86E5B0', true, true),
      title: `Punto seleccionado: ${probePoint.lat.toFixed(6)}, ${probePoint.lng.toFixed(6)}`,
    })
      .bindPopup(
        `<div style="font-family:sans-serif;color:#0f172a;">
          <strong style="font-size:12px;">${escapeHtml(probePoint.originLabel)}</strong><br/>
          <span style="font-family:monospace;font-size:11px;">${probePoint.lat.toFixed(6)}, ${probePoint.lng.toFixed(6)}</span><br/>
          <span style="font-size:11px;">${probePoint.elevationM} m s.n.m. · ${escapeHtml(getHoldridgeZoneInfo(probePoint.holdridgeZone).shortName)}</span>
        </div>`,
      )
      .addTo(probeGroup);
  }, [probePoint]);

  const handleFocusSector = (lat: number, lng: number, zoom: number) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([lat, lng], zoom, { duration: 0.65 });
  };

  const handleUseDeviceGps = () => {
    const map = mapInstanceRef.current;
    if (!('geolocation' in navigator)) {
      if (map) {
        map.flyTo(
          [PARQUE_CENTRAL_SAN_MARCOS.lat, PARQUE_CENTRAL_SAN_MARCOS.lng],
          16,
        );
      }
      void resolveElevationAndSetProbe(
        PARQUE_CENTRAL_SAN_MARCOS.lat,
        PARQUE_CENTRAL_SAN_MARCOS.lng,
        'Referencia Parque Central San Marcos',
        1430,
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        if (map) {
          map.flyTo([lat, lng], 16, { duration: 0.7 });
        }
        void resolveElevationAndSetProbe(
          lat,
          lng,
          'GPS satelital del dispositivo',
          pos.coords.altitude,
        );
      },
      () => {
        const lat = 9.5525;
        const lng = -83.8065;
        if (map) {
          map.flyTo([lat, lng], 15, { duration: 0.7 });
        }
        void resolveElevationAndSetProbe(
          lat,
          lng,
          'Referencia CBLS (sin permiso GPS)',
          2240,
        );
      },
      { enableHighAccuracy: true, timeout: 6000 },
    );
  };

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

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <Surface className="divide-y divide-border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Mapa SIG Interactivo — Corredor Biológico Los Santos
            </h2>
            <p className="text-xs text-muted">
              Haz clic en cualquier punto del mapa para obtener coordenadas WGS84
              exactas (6 decimales), elevación y zona Holdridge
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Basemap Type Switcher: Híbrido, Satélite, Calles, Terreno */}
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
              onClick={handleUseDeviceGps}
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
                onClick={() => handleFocusSector(sec.lat, sec.lng, sec.zoom)}
                className="rounded-md border border-border bg-[#05140D] px-2 py-1 text-[11px] text-muted transition-colors hover:border-primary/45 hover:text-primary"
              >
                {sec.name}
              </button>
            ))}
          </div>
        </div>
      </Surface>

      {/* Main Split: Interactive Leaflet Map + Exact Coordinate Inspector / Selected Sighting */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Surface inset className="overflow-hidden lg:col-span-8">
          <div className="p-3">
            <div className="relative z-0 h-[460px] w-full overflow-hidden rounded-control border border-primary/20 bg-[#05140D] sm:h-[540px]">
              <div
                ref={mapContainerRef}
                className="h-full w-full"
                aria-label="Mapa SIG interactivo centrado en Parque Central de San Marcos de Tarrazú"
              />
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
              <span>
                Inicio: Parque Central, San Marcos de Tarrazú ·{' '}
                {filteredSightings.length} avistamientos · Toca cualquier punto
                para obtener coordenadas
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
                  {probePoint.elevationSource === 'dem'
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
                      <span className="text-muted">
                        {' '}
                        · {activeSighting.sourceDetail}
                      </span>
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
                      <span className="text-muted">Notas:</span>{' '}
                      {activeSighting.notes}
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
                    <Button
                      tone="secondary"
                      onClick={() => onEditSighting(activeSighting)}
                      className="min-h-9 flex-1 text-xs"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Editar avistamiento
                    </Button>
                    <Button
                      tone="coral"
                      onClick={() => void onDeleteSighting(activeSighting.id)}
                      className="min-h-9 flex-1 text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar avistamiento
                    </Button>
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
