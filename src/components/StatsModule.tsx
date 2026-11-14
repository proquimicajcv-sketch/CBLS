import React, { useMemo, useState } from 'react';
import { Check, Copy, FileSpreadsheet, FileText } from 'lucide-react';
import type { SightingEntry, SpeciesRecord, TaxonGroup } from '../types/cbls';
import {
  generateDarwinCoreCsv,
  getHoldridgeZoneInfo,
  HOLDRIDGE_ZONES,
  TAXON_COLOR_MAP,
  TAXON_GROUPS,
} from '../utils/ecology';
import { Button, Surface } from './ui';

interface StatsModuleProps {
  species: SpeciesRecord[];
  sightings: SightingEntry[];
}

function computeDiversityMetrics(sightings: SightingEntry[]): {
  shannonH: number;
  pielouJ: number;
  observedRichness: number;
} {
  const countsBySpecies = new Map<string, number>();
  let totalN = 0;

  sightings.forEach((s) => {
    if (s.individualCount > 0) {
      countsBySpecies.set(
        s.speciesId,
        (countsBySpecies.get(s.speciesId) ?? 0) + s.individualCount,
      );
      totalN += s.individualCount;
    }
  });

  const richness = countsBySpecies.size;
  if (totalN === 0 || richness === 0) {
    return { shannonH: 0, pielouJ: 0, observedRichness: 0 };
  }

  let h = 0;
  countsBySpecies.forEach((count) => {
    const p = count / totalN;
    if (p > 0) {
      h -= p * Math.log(p);
    }
  });

  const j = richness > 1 ? h / Math.log(richness) : 1;
  return {
    shannonH: h,
    pielouJ: j,
    observedRichness: richness,
  };
}

export const StatsModule: React.FC<StatsModuleProps> = ({
  species,
  sightings,
}) => {
  const [copiedCsv, setCopiedCsv] = useState<boolean>(false);

  const speciesMap = useMemo(
    () => new Map(species.map((s) => [s.id, s])),
    [species],
  );

  const diversity = useMemo(
    () => computeDiversityMetrics(sightings),
    [sightings],
  );

  const taxonSeries = useMemo(() => {
    return TAXON_GROUPS.map((taxon) => {
      const individuals = sightings.reduce((acc, s) => {
        const sp = speciesMap.get(s.speciesId);
        return sp?.taxon === taxon ? acc + s.individualCount : acc;
      }, 0);
      const obsCount = sightings.filter(
        (s) => speciesMap.get(s.speciesId)?.taxon === taxon,
      ).length;
      return { taxon, individuals, obsCount };
    });
  }, [sightings, speciesMap]);

  const maxTaxonIndividuals = Math.max(
    5,
    ...taxonSeries.map((d) => d.individuals),
  );

  const holdridgeSeries = useMemo(() => {
    return HOLDRIDGE_ZONES.map((zone) => {
      const obsCount = sightings.filter(
        (s) => s.holdridgeZone === zone.id,
      ).length;
      const individuals = sightings
        .filter((s) => s.holdridgeZone === zone.id)
        .reduce((acc, s) => acc + s.individualCount, 0);
      return { zone, obsCount, individuals };
    });
  }, [sightings]);

  const maxZoneObs = Math.max(5, ...holdridgeSeries.map((d) => d.obsCount));

  const iucnSummary = useMemo(() => {
    const order: Array<{ code: SpeciesRecord['iucn']; name: string }> = [
      { code: 'CR', name: 'En peligro crítico (CR)' },
      { code: 'EN', name: 'En peligro (EN)' },
      { code: 'VU', name: 'Vulnerable (VU)' },
      { code: 'NT', name: 'Casi amenazada (NT)' },
      { code: 'LC', name: 'Preocupación menor (LC)' },
    ];
    return order.map((item) => ({
      ...item,
      count: species.filter((s) => s.iucn === item.code).length,
    }));
  }, [species]);

  const triggerDownload = (
    filename: string,
    content: string,
    mimeType: string,
  ) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDarwinCore = () => {
    const csv = generateDarwinCoreCsv(species, sightings);
    triggerDownload(
      `Bitacora_CBLS_DarwinCore_${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8;',
    );
  };

  const handleDownloadAnalyticalReport = () => {
    const totalInd = sightings.reduce((sum, s) => sum + s.individualCount, 0);
    const lines = [
      'INFORME CIENTÍFICO Y AUDITORÍA DE BIODIVERSIDAD — BITÁCORA CBLS',
      'Corredor Biológico Los Santos (Tarrazú · Dota · León Cortés, Costa Rica)',
      `Fecha de emisión: ${new Date().toISOString().slice(0, 10)}`,
      '------------------------------------------------------------------------',
      `Especies catalogadas: ${species.length} taxones`,
      `Riqueza observada: ${diversity.observedRichness} especies`,
      `Avistamientos georreferenciados: ${sightings.length} entradas`,
      `Individuos contabilizados (N): ${totalInd} especímenes`,
      `Índice de Shannon-Wiener (H'): ${diversity.shannonH.toFixed(3)} nats`,
      `Equitatividad de Pielou (J'): ${diversity.pielouJ.toFixed(3)}`,
      '',
      'DISTRIBUCIÓN POR GRUPO TAXONÓMICO:',
      ...taxonSeries.map(
        (t) =>
          `- ${t.taxon}: ${t.obsCount} avistamientos | ${t.individuals} individuos`,
      ),
      '',
      'DISTRIBUCIÓN ALTITUDINAL POR ZONA DE VIDA HOLDRIDGE:',
      ...holdridgeSeries.map(
        (h) =>
          `- ${h.zone.name} (${h.zone.minElevation}-${h.zone.maxElevation} m): ${h.obsCount} avistamientos | ${h.individuals} individuos`,
      ),
    ];
    triggerDownload(
      `Informe_Auditoria_CBLS_${new Date().toISOString().slice(0, 10)}.txt`,
      lines.join('\n'),
      'text/plain;charset=utf-8;',
    );
  };

  const handleCopyCsv = async () => {
    try {
      await navigator.clipboard.writeText(
        generateDarwinCoreCsv(species, sightings),
      );
      setCopiedCsv(true);
      window.setTimeout(() => setCopiedCsv(false), 2200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <Surface className="divide-y divide-border md:grid md:grid-cols-3 md:divide-x md:divide-y-0">
        <div className="p-5">
          <p className="text-xs font-medium text-muted">
            Índice de Shannon-Wiener (H&apos;)
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tabular-nums text-foreground">
              {diversity.shannonH.toFixed(2)}
            </span>
            <span className="font-mono text-xs text-secondary">nats</span>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Sobre N = {sightings.reduce((s, o) => s + o.individualCount, 0)} individuos en S = {diversity.observedRichness} especies
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-muted">
            Equitatividad de Pielou (J&apos;)
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tabular-nums text-foreground">
              {diversity.pielouJ.toFixed(2)}
            </span>
            <span className="font-mono text-xs text-muted">escala 0–1</span>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Uniformidad relativa entre especies
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-muted">
            Amplitud altitudinal
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tabular-nums text-primary">
              {sightings.length > 0
                ? `${Math.min(...sightings.map((s) => s.elevationM))}–${Math.max(
                    ...sightings.map((s) => s.elevationM),
                  )}`
                : '0'}
            </span>
            <span className="font-mono text-xs text-muted">m s.n.m.</span>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Rango registrado en campo
          </p>
        </div>
      </Surface>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Surface className="divide-y divide-border">
          <div className="p-5">
            <h2 className="text-base font-semibold text-foreground">
              Abundancia por grupo taxonómico
            </h2>
            <p className="text-xs text-muted">Total de individuos registrados</p>
          </div>
          <div className="p-5">
            <svg viewBox="0 0 540 240" className="h-auto w-full">
              {taxonSeries.map((row, index) => {
                const yTop = 20 + index * 34;
                const barWidth = Math.max(
                  row.individuals > 0 ? 4 : 0,
                  Math.round((row.individuals / maxTaxonIndividuals) * 350),
                );
                return (
                  <g key={row.taxon}>
                    <text
                      x={110}
                      y={yTop + 14}
                      textAnchor="end"
                      fill="#FFF5D1"
                      fontSize="12"
                    >
                      {row.taxon}
                    </text>
                    <rect
                      x={120}
                      y={yTop}
                      width={barWidth}
                      height={18}
                      rx={3}
                      fill={TAXON_COLOR_MAP[row.taxon]}
                    />
                    <text
                      x={120 + barWidth + 8}
                      y={yTop + 14}
                      fill="#FFF5D1"
                      fontSize="11"
                      fontFamily="JetBrains Mono"
                    >
                      {row.individuals}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Surface>

        <Surface className="divide-y divide-border">
          <div className="p-5">
            <h2 className="text-base font-semibold text-foreground">
              Frecuencia por Zona de Vida Holdridge
            </h2>
            <p className="text-xs text-muted">Número de avistamientos georreferenciados</p>
          </div>
          <div className="p-5">
            <svg viewBox="0 0 540 240" className="h-auto w-full">
              {holdridgeSeries.map((row, index) => {
                const yTop = 20 + index * 38;
                const barWidth = Math.max(
                  row.obsCount > 0 ? 4 : 0,
                  Math.round((row.obsCount / maxZoneObs) * 310),
                );
                return (
                  <g key={row.zone.id}>
                    <text
                      x={150}
                      y={yTop + 14}
                      textAnchor="end"
                      fill="#FFF5D1"
                      fontSize="11"
                    >
                      {row.zone.shortName}
                    </text>
                    <rect
                      x={160}
                      y={yTop}
                      width={barWidth}
                      height={18}
                      rx={3}
                      fill="#55CB45"
                    />
                    <text
                      x={160 + barWidth + 8}
                      y={yTop + 14}
                      fill="#FFF5D1"
                      fontSize="11"
                      fontFamily="JetBrains Mono"
                    >
                      {row.obsCount}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Surface>
      </div>

      {/* IUCN Audit */}
      <Surface className="divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">
            Auditoría de Categorías UICN
          </h2>
          <p className="text-xs text-muted">
            Distribución de riesgo de extinción entre las {species.length} especies
          </p>
        </div>
        <div className="divide-y divide-border sm:grid sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          {iucnSummary.map((item) => (
            <div key={item.code} className="p-4">
              <span
                className={`font-mono text-xs font-semibold ${
                  ['CR', 'EN', 'VU'].includes(item.code)
                    ? 'text-coral'
                    : 'text-secondary'
                }`}
              >
                {item.code}
              </span>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
                {item.count}
              </p>
              <p className="mt-0.5 text-xs text-muted">{item.name}</p>
            </div>
          ))}
        </div>
      </Surface>

      {/* Darwin Core Matrix Export */}
      <Surface className="divide-y divide-border">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Matriz estándar Simple Darwin Core (TDWG)
            </h2>
            <p className="text-xs text-muted">
              Incluye nombre de la persona observadora y enlaces multimedia por URL
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button tone="primary" onClick={handleDownloadDarwinCore}>
              <FileSpreadsheet className="h-4 w-4" />
              Exportar CSV
            </Button>
            <Button tone="secondary" onClick={handleDownloadAnalyticalReport}>
              <FileText className="h-4 w-4" />
              Informe .TXT
            </Button>
            <Button tone="quiet" onClick={handleCopyCsv}>
              {copiedCsv ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              {copiedCsv ? 'Copiado' : 'Copiar CSV'}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-4 py-3 font-mono">dwc:occurrenceID</th>
                <th className="px-4 py-3">Especie</th>
                <th className="px-4 py-3">Detección</th>
                <th className="px-4 py-3 font-mono">Conteo</th>
                <th className="px-4 py-3">Localidad</th>
                <th className="px-4 py-3">Observador</th>
                <th className="px-4 py-3">Multimedia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sightings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    No hay avistamientos registrados en la base de datos.
                  </td>
                </tr>
              ) : (
                sightings.map((obs) => {
                  const sp = speciesMap.get(obs.speciesId);
                  const hasMedia = obs.photoUrl || obs.videoUrl || obs.audioUrl;
                  return (
                    <tr key={obs.id} className="hover:bg-foreground/5">
                      <td className="px-4 py-3 font-mono text-muted">{obs.occurrenceId}</td>
                      <td className="px-4 py-3 italic text-foreground">
                        {sp?.scientificName || 'Indeterminado'}
                      </td>
                      <td className="px-4 py-3 text-secondary">
                        {obs.observationMethod || 'En persona'}
                      </td>
                      <td className="px-4 py-3 font-mono text-primary font-semibold">
                        {obs.individualCount} ind.
                      </td>
                      <td className="px-4 py-3 text-muted">{obs.locality}</td>
                      <td className="px-4 py-3 text-foreground">{obs.observer}</td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {hasMedia ? 'Adjunto por URL' : 'Sin enlace'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
};
