import React, { useState } from 'react';
import {
  Check,
  CloudUpload,
  Copy,
  Download,
  HardDrive,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
  Upload,
  UserCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type {
  ChangeLogEntry,
  SightingEntry,
  SpeciesRecord,
  SyncBatchLog,
  UserSession,
} from '../types/cbls';
import { AdminPinModal } from './AdminPinModal';
import { Button, Surface, textareaClassName } from './ui';

interface BackupModuleProps {
  species: SpeciesRecord[];
  sightings: SightingEntry[];
  syncLogs: SyncBatchLog[];
  changeLogs: ChangeLogEntry[];
  userSession: UserSession | null;
  onRequestUserSession: () => void;
  offlineAutonomousMode: boolean;
  effectiveOffline: boolean;
  wsConnected: boolean;
  lastSavedIso: string;
  pendingSyncCount: number;
  checksum: string;
  storageBytes: number;
  onToggleAutonomousMode: () => void;
  onSyncNow: () => void;
  onExportObject: () => Record<string, unknown>;
  onImportJson: (jsonText: string, overrideAdminCode?: string) => Promise<boolean>;
  onResetAllDataToZero: (overrideAdminCode?: string) => void;
}

export const BackupModule: React.FC<BackupModuleProps> = ({
  species,
  sightings,
  syncLogs,
  changeLogs,
  userSession,
  onRequestUserSession,
  offlineAutonomousMode,
  effectiveOffline,
  wsConnected,
  lastSavedIso,
  pendingSyncCount,
  checksum,
  storageBytes,
  onToggleAutonomousMode,
  onSyncNow,
  onExportObject,
  onImportJson,
  onResetAllDataToZero,
}) => {
  const [copiedJson, setCopiedJson] = useState(false);
  const [manualJson, setManualJson] = useState('');
  const [showManualImport, setShowManualImport] = useState(false);
  const [adminPinModalOpen, setAdminPinModalOpen] = useState(false);
  const [confirmAdminReset, setConfirmAdminReset] = useState(false);

  const kbUsed = (storageBytes / 1024).toFixed(1);

  const handleDownloadJson = () => {
    const payload = JSON.stringify(onExportObject(), null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Respaldo_Bitacora_CBLS_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = async () => {
    try {
      const payload = JSON.stringify(onExportObject(), null, 2);
      await navigator.clipboard.writeText(payload);
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportJson(reader.result);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Admin PIN for resetting base to zero */}
      <AdminPinModal
        open={adminPinModalOpen}
        title="Autorizar Reinicio de Base de Datos"
        actionDescription="Esta acción vaciará por completo la base de datos compartida e IndexedDB y reiniciará todos los contadores a 0 en todos los dispositivos"
        onSuccess={(verifiedPin) => {
          setAdminPinModalOpen(false);
          onResetAllDataToZero(verifiedPin);
        }}
        onClose={() => setAdminPinModalOpen(false)}
      />

      {/* Device & Observer Credential Card (Name only, never displays access code) */}
      <Surface className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Sesión activa en este dispositivo</h3>
            <p className="text-xs text-muted">
              Persona:{' '}
              <span className="font-semibold text-foreground">
                {userSession?.observerName || 'No identificada'}
              </span>{' '}
              · Perfil:{' '}
              <span className="font-mono text-secondary font-semibold">
                {userSession?.isAdmin ? 'Administrador autorizado' : 'Observador de campo'}
              </span>
            </p>
          </div>
        </div>
        <Button tone="secondary" onClick={onRequestUserSession}>
          Cambiar persona o código
        </Button>
      </Surface>

      {/* Autonomous Offline Memory & IndexedDB Telemetry */}
      <Surface className="divide-y divide-border">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              {effectiveOffline ? (
                <WifiOff className="h-5 w-5 text-coral" />
              ) : (
                <Wifi className="h-5 w-5 text-primary" />
              )}
              <h2 className="text-lg font-semibold text-foreground">
                {effectiveOffline
                  ? 'Modo Campo Offline Autónomo Activo'
                  : wsConnected
                    ? 'Sincronización en Tiempo Real Activa (Todos los dispositivos)'
                    : 'Reconectando enlace en tiempo real con el servidor...'}
              </h2>
            </div>
            <p className="text-xs text-muted">
              Motor híbrido: caché local en <strong>IndexedDB</strong> y transmisión inmediata por <strong>WebSocket</strong> entre dispositivos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              tone={offlineAutonomousMode ? 'coral' : 'secondary'}
              onClick={onToggleAutonomousMode}
            >
              {offlineAutonomousMode
                ? 'Salir de Modo Campo Autónomo'
                : 'Activar Modo Campo Autónomo'}
            </Button>

            <Button
              tone="primary"
              disabled={effectiveOffline || pendingSyncCount === 0}
              onClick={onSyncNow}
            >
              <CloudUpload className="h-4 w-4" />
              Sincronizar ahora ({pendingSyncCount})
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border sm:grid sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <p className="text-xs text-muted">Memoria IndexedDB</p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {kbUsed} KB
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {species.length} especies · {sightings.length} avist.
            </p>
          </div>

          <div className="p-4">
            <p className="text-xs text-muted">Cola de sincronización</p>
            <p
              className={`mt-1 font-mono text-xl font-semibold ${
                pendingSyncCount > 0 ? 'text-coral' : 'text-secondary'
              }`}
            >
              {pendingSyncCount} reg.
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Pendientes de confirmación en servidor
            </p>
          </div>

          <div className="p-4">
            <p className="text-xs text-muted">Checksum del lote (FNV-1a)</p>
            <p className="mt-1 font-mono text-xl font-semibold text-primary">
              #{checksum}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Verificación de réplica
            </p>
          </div>

          <div className="p-4">
            <p className="text-xs text-muted">Último guardado</p>
            <p className="mt-1 font-mono text-base font-medium text-foreground">
              {lastSavedIso.slice(0, 19).replace('T', ' ')}
            </p>
            <p className="mt-0.5 text-xs text-muted">Fecha y hora UTC</p>
          </div>
        </div>
      </Surface>

      {/* JSON Backup & Zero Reset */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Surface className="divide-y divide-border lg:col-span-7">
          <div className="p-5">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-secondary" />
              <h3 className="text-lg font-semibold text-foreground">
                Respaldo portátil JSON
              </h3>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Descarga o transfiere el inventario íntegro para compartirlo entre teléfonos o tabletas en campo.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button tone="primary" onClick={handleDownloadJson}>
                <Download className="h-4 w-4" />
                Descargar JSON
              </Button>

              <Button tone="secondary" onClick={handleCopyJson}>
                {copiedJson ? (
                  <>
                    <Check className="h-4 w-4 text-primary" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copiar JSON
                  </>
                )}
              </Button>

              <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control border border-border bg-surface px-4 text-sm font-medium text-foreground hover:border-foreground/30">
                <Upload className="h-4 w-4 text-primary" />
                Importar archivo JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileImport}
                  className="sr-only"
                />
              </label>

              <Button
                tone="quiet"
                onClick={() => setShowManualImport((v) => !v)}
              >
                Pegar texto JSON
              </Button>
            </div>

            {showManualImport && (
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <textarea
                  rows={4}
                  value={manualJson}
                  onChange={(e) => setManualJson(e.target.value)}
                  placeholder='{"version": 1, "species": [], "sightings": []}'
                  className={`${textareaClassName} font-mono text-xs`}
                />
                <div className="flex justify-end gap-2">
                  <Button tone="quiet" onClick={() => setShowManualImport(false)}>
                    Cerrar
                  </Button>
                  <Button
                    tone="primary"
                    onClick={() => {
                      onImportJson(manualJson).then((ok) => {
                        if (ok) {
                          setManualJson('');
                          setShowManualImport(false);
                        }
                      });
                    }}
                  >
                    Cargar respaldo
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Reset to 0 (Protected by Admin) */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-secondary" />
                Vaciar y comenzar desde 0
              </h4>
              <p className="text-xs text-muted">
                Elimina todas las especies y avistamientos en IndexedDB para iniciar desde 0
              </p>
            </div>

            {confirmAdminReset ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button tone="quiet" onClick={() => setConfirmAdminReset(false)}>
                  Cancelar
                </Button>
                <Button
                  tone="coral"
                  onClick={() => {
                    onResetAllDataToZero();
                    setConfirmAdminReset(false);
                  }}
                >
                  <RotateCcw className="h-4 w-4 text-coral" />
                  Confirmar reinicio a 0
                </Button>
              </div>
            ) : (
              <Button
                tone="coral"
                onClick={() => {
                  if (userSession?.isAdmin) {
                    setConfirmAdminReset(true);
                  } else {
                    setAdminPinModalOpen(true);
                  }
                }}
              >
                <RotateCcw className="h-4 w-4 text-coral" />
                Reiniciar base a 0
              </Button>
            )}
          </div>
        </Surface>

        {/* Sync Batch History */}
        <Surface className="divide-y divide-border lg:col-span-5">
          <div className="flex items-center justify-between gap-2 p-5">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Historial de Lotes Sincronizados
              </h3>
              <p className="text-xs text-muted">
                Trazabilidad por nombre de persona
              </p>
            </div>
            <RefreshCw className="h-4 w-4 text-secondary" />
          </div>

          <div className="divide-y divide-border">
            {syncLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                No hay lotes sincronizados todavía en este dispositivo.
              </div>
            ) : (
              syncLogs.map((log, idx) => (
                <div
                  key={`${log.batchHash}-${idx}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {log.deviceProfile}
                    </p>
                    <p className="font-mono text-xs text-muted">{log.timestamp}</p>
                  </div>
                  <div className="shrink-0 text-right font-mono text-xs">
                    <span className="text-secondary">#{log.batchHash}</span>
                    <p className="text-muted">{log.recordsSynced} reg.</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Surface>
      </div>

      {/* Name-only Change History Log */}
      <Surface className="divide-y divide-border">
        <div className="flex items-center justify-between gap-2 p-5">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Historial de Cambios
            </h3>
            <p className="text-xs text-muted">
              Auditoría cronológica: registra únicamente el nombre de la persona que realizó cada cambio
            </p>
          </div>
          <History className="h-5 w-5 text-primary" />
        </div>

        <div className="divide-y divide-border">
          {changeLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted">
              Aún no hay movimientos registrados en el historial local.
            </div>
          ) : (
            changeLogs.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {entry.actorName}{' '}
                    <span className="font-normal text-secondary">· {entry.action}</span>
                  </p>
                  <p className="text-foreground/90">
                    {entry.target}
                    {entry.details ? (
                      <span className="text-muted"> — {entry.details}</span>
                    ) : null}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {new Date(entry.timestamp).toLocaleString('es-CR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      </Surface>
    </div>
  );
};
