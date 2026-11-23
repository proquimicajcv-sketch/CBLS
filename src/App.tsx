import React, { useCallback, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Compass,
  Database,
  Home,
  Layers,
  Plus,
  UserCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { AdminPinModal } from './components/AdminPinModal';
import { BackupModule } from './components/BackupModule';
import { CatalogModule } from './components/CatalogModule';
import { CollectionModule } from './components/CollectionModule';
import { DashboardModule } from './components/DashboardModule';
import { GisMapModule } from './components/GisMapModule';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SightingModal } from './components/SightingModal';
import { StatsModule } from './components/StatsModule';
import { Button } from './components/ui';
import { UserSessionModal } from './components/UserSessionModal';
import { useCblsStore } from './hooks/useCblsStore';
import type { AppModuleId, HoldridgeZoneId, SightingEntry } from './types/cbls';

const LEFT_NAV_ITEMS: Array<{
  id: AppModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'portada', label: 'Portada', icon: Home },
  { id: 'fichas', label: 'Ficha', icon: BookOpen },
  { id: 'mapa', label: 'Mapa SIG', icon: Compass },
];

const RIGHT_NAV_ITEMS: Array<{
  id: AppModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'coleccion', label: 'Colección', icon: Layers },
  { id: 'estadistica', label: 'Estadística', icon: BarChart3 },
  { id: 'respaldo', label: 'Respaldo', icon: Database },
];

export default function App() {
  const store = useCblsStore();

  const [activeModule, setActiveModule] = useState<AppModuleId>('portada');
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(
    store.species[0]?.id ?? null,
  );
  const [startCatalogInCreate, setStartCatalogInCreate] =
    useState<boolean>(false);
  const [autoOpenSpeciesModal, setAutoOpenSpeciesModal] =
    useState<boolean>(false);

  // User session identification modal
  const [userSessionModalOpen, setUserSessionModalOpen] = useState<boolean>(
    () => !store.userSession,
  );

  // Sighting modal states
  const [sightingModalOpen, setSightingModalOpen] = useState<boolean>(false);
  const [sightingModalSpeciesId, setSightingModalSpeciesId] = useState<
    string | undefined
  >(undefined);
  const [editingSighting, setEditingSighting] = useState<SightingEntry | null>(
    null,
  );
  const [sightingPresetCoords, setSightingPresetCoords] = useState<{
    latitude: number;
    longitude: number;
    elevationM: number;
    holdridgeZone: HoldridgeZoneId;
    localityHint?: string;
  } | null>(null);

  // Exclusive personal admin code gate for deleting any species or sighting
  const [pendingDelete, setPendingDelete] = useState<{
    kind: 'species' | 'sighting';
    id: string;
    title: string;
    description: string;
    confirmLabel: string;
    resolve: (deleted: boolean) => void;
  } | null>(null);

  const requestDeleteSpecies = useCallback(
    (speciesId: string): Promise<boolean> => {
      const targetSp = store.species.find((s) => s.id === speciesId);
      const label = targetSp
        ? `${targetSp.commonName} (${targetSp.catalogCode})`
        : 'esta especie';
      return new Promise<boolean>((resolve) => {
        setPendingDelete({
          kind: 'species',
          id: speciesId,
          title: 'Autorizar Eliminación de Ficha',
          description: `Vas a eliminar permanentemente la ficha de ${label} y sus avistamientos asociados en todos los dispositivos`,
          confirmLabel: 'Eliminar ficha',
          resolve,
        });
      });
    },
    [store.species],
  );

  const requestDeleteSighting = useCallback(
    (sightingId: string): Promise<boolean> => {
      const target = store.sightings.find((s) => s.id === sightingId);
      const sp = target
        ? store.species.find((s) => s.id === target.speciesId)
        : undefined;
      const label = sp
        ? `${sp.commonName} (${target?.observedDate ?? ''})`
        : target?.occurrenceId || 'este avistamiento';
      return new Promise<boolean>((resolve) => {
        setPendingDelete({
          kind: 'sighting',
          id: sightingId,
          title: 'Autorizar Eliminación de Avistamiento',
          description: `Vas a eliminar permanentemente el avistamiento de ${label} en todos los dispositivos`,
          confirmLabel: 'Eliminar avistamiento',
          resolve,
        });
      });
    },
    [store.sightings, store.species],
  );

  const handleOpenSpeciesDetail = useCallback((speciesId: string) => {
    setSelectedSpeciesId(speciesId);
    setStartCatalogInCreate(false);
    setAutoOpenSpeciesModal(true);
    setActiveModule('fichas');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenNewSpecies = useCallback(() => {
    if (!store.userSession?.isAdmin) {
      setUserSessionModalOpen(true);
      return;
    }
    setAutoOpenSpeciesModal(false);
    setStartCatalogInCreate(true);
    setActiveModule('fichas');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [store.userSession]);

  const handleClearCreateMode = useCallback(() => {
    setStartCatalogInCreate(false);
  }, []);

  const handleClearAutoOpenDetail = useCallback(() => {
    setAutoOpenSpeciesModal(false);
  }, []);

  const handleQuickSighting = useCallback(
    (speciesId?: string) => {
      if (!store.userSession) {
        setUserSessionModalOpen(true);
        return;
      }
      setEditingSighting(null);
      setSightingModalSpeciesId(speciesId);
      setSightingPresetCoords(null);
      setSightingModalOpen(true);
    },
    [store.userSession],
  );

  const handleEditSighting = useCallback(
    (sighting: SightingEntry) => {
      if (!store.userSession?.isAdmin) {
        setUserSessionModalOpen(true);
        return;
      }
      setEditingSighting(sighting);
      setSightingModalSpeciesId(sighting.speciesId);
      setSightingPresetCoords(null);
      setSightingModalOpen(true);
    },
    [store.userSession],
  );

  const handleRegisterAtMapPoint = useCallback(
    (coords: {
      latitude: number;
      longitude: number;
      elevationM: number;
      holdridgeZone: HoldridgeZoneId;
      localityHint: string;
    }) => {
      if (!store.userSession) {
        setUserSessionModalOpen(true);
        return;
      }
      setEditingSighting(null);
      setSightingModalSpeciesId(selectedSpeciesId ?? store.species[0]?.id);
      setSightingPresetCoords(coords);
      setSightingModalOpen(true);
    },
    [selectedSpeciesId, store.species, store.userSession],
  );

  const renderNavButton = (item: {
    id: AppModuleId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    const Icon = item.icon;
    const isCurrent = activeModule === item.id;
    return (
      <li key={item.id} className="min-w-0">
        <button
          type="button"
          aria-current={isCurrent ? 'page' : undefined}
          onClick={() => {
            if (item.id === 'fichas') {
              setAutoOpenSpeciesModal(false);
              setStartCatalogInCreate(false);
            }
            setActiveModule(item.id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
            isCurrent
              ? 'text-primary font-semibold'
              : 'text-muted hover:text-foreground'
          }`}
        >
          <span
            className={`flex h-7 w-9 items-center justify-center rounded-md transition-colors ${
              isCurrent ? 'bg-primary/15 text-primary' : 'bg-transparent'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
          </span>
          <span className="truncate">{item.label}</span>
        </button>
      </li>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-background pb-24 text-foreground">
        {/* Device User Session Modal */}
        <UserSessionModal
          open={userSessionModalOpen}
          currentSession={store.userSession}
          onSave={(name, code) => {
            const res = store.saveUserSession(name, code);
            if (res.ok) setUserSessionModalOpen(false);
            return res;
          }}
          onClose={() => setUserSessionModalOpen(false)}
          canCancel={Boolean(store.userSession)}
        />

        {/* Compact Institutional Header for non-portada modules */}
        {activeModule !== 'portada' && (
          <header className="sticky top-0 z-30 border-b border-border bg-[#04110B]/92 backdrop-blur-md">
            <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
              <button
                type="button"
                onClick={() => setActiveModule('portada')}
                className="flex min-w-0 items-center gap-3 text-left"
              >
                <img
                  src="/pwa-192x192.png?v=puma2"
                  alt="BioCBLS"
                  className="h-9 w-9 shrink-0 rounded-lg border border-primary/40 bg-[#040B08] object-cover"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-lg font-bold tracking-tight text-primary">
                      Bitácora CBLS
                    </span>
                    <span className="font-mono text-[11px] text-secondary">
                      Los Santos · CR
                    </span>
                  </div>
                  <p className="max-w-xs truncate text-[11px] text-muted">
                    Sistema de Bitácora de Campo & Taxonomía
                  </p>
                </div>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUserSessionModalOpen(true)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-[#061810] px-3 py-1 text-xs text-foreground hover:border-primary/50"
                  title="Cambiar persona o código de acceso"
                >
                  <UserCheck className="h-3.5 w-3.5 text-primary" />
                  <span className="max-w-[140px] truncate font-medium">
                    {store.userSession?.observerName || 'Identificarme'}
                  </span>
                  {store.userSession?.isAdmin && (
                    <span className="font-mono font-semibold text-primary">
                      · Admin
                    </span>
                  )}
                </button>

                <PWAInstallButton />

                <button
                  type="button"
                  onClick={() => setActiveModule('respaldo')}
                  className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-[#061810] px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/50"
                >
                  {store.effectiveOffline ? (
                    <>
                      <WifiOff className="h-3.5 w-3.5 text-coral" />
                      <span className="text-coral">Offline</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="h-3.5 w-3.5 text-primary" />
                      <span className="text-primary">En vivo</span>
                    </>
                  )}
                </button>

                <Button
                  tone="primary"
                  onClick={() => handleQuickSighting()}
                  className="min-h-9 px-3 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Avistamiento
                </Button>
              </div>
            </div>
          </header>
        )}

        {/* Non-Intrusive Offline Mountain Field Banner & Auto-Sync Status */}
        {(store.effectiveOffline || store.isAutoSyncing || store.outboxCount > 0) && (
          <div
            role="status"
            aria-live="polite"
            className={`border-b px-4 py-2 text-xs sm:px-6 ${
              store.effectiveOffline
                ? 'border-coral/40 bg-[#1B0D0B] text-foreground'
                : 'border-primary/40 bg-[#061D14] text-foreground'
            }`}
          >
            <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {store.effectiveOffline ? (
                  <WifiOff className="h-3.5 w-3.5 shrink-0 text-coral" />
                ) : (
                  <Wifi className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />
                )}
                <span>
                  {store.effectiveOffline
                    ? 'Modo Offline (Sin señal): los avistamientos, notas, GPS y fotos/videos se guardan localmente en IndexedDB.'
                    : store.isAutoSyncing
                      ? `Conexión recuperada: sincronizando ${store.outboxCount} registro(s) con Firebase...`
                      : `${store.outboxCount} registro(s) pendientes de subir a Firebase.`}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                {store.localMediaStats.count > 0 && (
                  <span className="text-secondary">
                    {store.localMediaStats.count} media local
                  </span>
                )}
                {!store.effectiveOffline && !store.isAutoSyncing && store.outboxCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void store.syncPendingRecords()}
                    className="rounded border border-primary/40 bg-primary/15 px-2.5 py-0.5 font-semibold text-primary hover:bg-primary/25"
                  >
                    Sincronizar ahora
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Inline Feedback / Storage Banner */}
        {(store.storageError || store.statusMessage) && (
          <div
            role="status"
            className="border-b border-border bg-surface-elevated px-4 py-2 text-xs sm:px-6"
          >
            <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-3">
              <span
                className={
                  store.storageError ? 'text-coral' : 'text-foreground'
                }
              >
                {store.storageError ?? store.statusMessage}
              </span>
              <button
                type="button"
                onClick={store.clearStatusMessage}
                className="shrink-0 font-mono text-xs text-muted underline hover:text-foreground"
              >
                Ocultar
              </button>
            </div>
          </div>
        )}

        {/* Main Active Module Workspace */}
        <main
          className={
            activeModule === 'portada'
              ? 'mx-auto max-w-[90rem]'
              : 'mx-auto max-w-[90rem] px-4 pt-5 sm:px-6 sm:pt-6'
          }
        >
          {activeModule === 'portada' && (
            <DashboardModule
              species={store.species}
              sightings={store.sightings}
              changeLogs={store.changeLogs}
              totalIndividuals={store.totalIndividuals}
              currentUser={store.userSession}
              effectiveOffline={store.effectiveOffline}
              wsConnected={store.wsConnected}
              pendingSyncCount={store.pendingSyncCount}
              checksum={store.checksum}
              pwaInstallSlot={<PWAInstallButton />}
              onRequestUserSession={() => setUserSessionModalOpen(true)}
              onNavigate={setActiveModule}
              onOpenSpeciesDetail={handleOpenSpeciesDetail}
              onOpenNewSpecies={handleOpenNewSpecies}
              onQuickSighting={handleQuickSighting}
              onEditSighting={handleEditSighting}
              onDeleteSighting={requestDeleteSighting}
            />
          )}

          {activeModule === 'fichas' && (
            <CatalogModule
              species={store.species}
              sightings={store.sightings}
              selectedSpeciesId={selectedSpeciesId}
              startInCreateMode={startCatalogInCreate}
              autoOpenDetail={autoOpenSpeciesModal}
              currentUser={store.userSession}
              onRequestUserSession={() => setUserSessionModalOpen(true)}
              onSelectSpecies={setSelectedSpeciesId}
              onClearCreateMode={handleClearCreateMode}
              onClearAutoOpenDetail={handleClearAutoOpenDetail}
              onSaveSpecies={store.upsertSpecies}
              onDeleteSpecies={requestDeleteSpecies}
              onQuickSighting={handleQuickSighting}
              onEditSighting={handleEditSighting}
              onDeleteSighting={requestDeleteSighting}
            />
          )}

          {activeModule === 'mapa' && (
            <GisMapModule
              species={store.species}
              sightings={store.sightings}
              currentUser={store.userSession}
              onOpenSpeciesDetail={handleOpenSpeciesDetail}
              onRegisterAtPoint={handleRegisterAtMapPoint}
              onEditSighting={handleEditSighting}
              onDeleteSighting={requestDeleteSighting}
            />
          )}

          {activeModule === 'coleccion' && (
            <CollectionModule
              species={store.species}
              sightings={store.sightings}
              currentUser={store.userSession}
              onOpenSpeciesDetail={handleOpenSpeciesDetail}
              onQuickSighting={handleQuickSighting}
              onOpenNewSpecies={handleOpenNewSpecies}
              onDeleteSpecies={requestDeleteSpecies}
            />
          )}

          {activeModule === 'estadistica' && (
            <StatsModule
              species={store.species}
              sightings={store.sightings}
            />
          )}

          {activeModule === 'respaldo' && (
            <BackupModule
              species={store.species}
              sightings={store.sightings}
              syncLogs={store.syncLogs}
              changeLogs={store.changeLogs}
              userSession={store.userSession}
              onRequestUserSession={() => setUserSessionModalOpen(true)}
              offlineAutonomousMode={store.offlineAutonomousMode}
              effectiveOffline={store.effectiveOffline}
              wsConnected={store.wsConnected}
              isAutoSyncing={store.isAutoSyncing}
              outboxCount={store.outboxCount}
              localMediaStats={store.localMediaStats}
              lastSavedIso={store.lastSavedIso}
              pendingSyncCount={store.pendingSyncCount}
              checksum={store.checksum}
              storageBytes={store.storageBytes}
              onToggleAutonomousMode={store.toggleAutonomousMode}
              onSyncNow={store.syncPendingRecords}
              onExportObject={store.exportBackupObject}
              onImportJson={store.importBackupJson}
              onResetAllDataToZero={store.resetAllDataToZero}
            />
          )}
        </main>

        {/* Native-Style Floating Bottom Navigation Bar with Centered + */}
        <nav
          aria-label="Navegación principal de módulos CBLS"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/20 bg-[#04120C]/94 px-2 py-1.5 backdrop-blur-md"
        >
          <ul className="mx-auto grid max-w-4xl grid-cols-7 items-center gap-1">
            {LEFT_NAV_ITEMS.map(renderNavButton)}

            <li className="flex justify-center">
              <button
                type="button"
                aria-label="Registrar avistamiento rápido"
                title="Registrar avistamiento en campo"
                onClick={() => handleQuickSighting()}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/50 bg-[#0B2D1F] text-primary transition-transform hover:scale-105 hover:bg-primary hover:text-primary-foreground active:scale-95 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Plus className="h-5 w-5" />
              </button>
            </li>

            {RIGHT_NAV_ITEMS.map(renderNavButton)}
          </ul>
        </nav>

        {/* Modal for Georeferenced Sighting Registration & Admin Editing */}
        <SightingModal
          open={sightingModalOpen}
          speciesList={store.species}
          initialSpeciesId={sightingModalSpeciesId}
          editingSighting={editingSighting}
          presetCoords={sightingPresetCoords}
          currentUser={store.userSession}
          onRequestUserSession={() => setUserSessionModalOpen(true)}
          onClose={() => {
            setSightingModalOpen(false);
            setEditingSighting(null);
          }}
          onSave={async (entry, mediaInput) => {
            if (editingSighting) {
              await store.updateSighting(editingSighting.id, entry, mediaInput);
            } else {
              await store.addSighting(entry, mediaInput);
            }
          }}
        />

        {/* Global Security Gate: Personal Admin Code Required for Every Deletion */}
        <AdminPinModal
          open={Boolean(pendingDelete)}
          title={pendingDelete?.title ?? 'Autorizar Eliminación'}
          actionDescription={
            pendingDelete?.description ??
            'Esta acción eliminará permanentemente el registro seleccionado'
          }
          confirmLabel={pendingDelete?.confirmLabel ?? 'Autorizar eliminación'}
          onSuccess={(verifiedPin) => {
            const current = pendingDelete;
            setPendingDelete(null);
            if (!current) return;
            const action =
              current.kind === 'species'
                ? store.deleteSpecies(current.id, verifiedPin)
                : store.deleteSighting(current.id, verifiedPin);
            void action.then((ok) => current.resolve(Boolean(ok)));
          }}
          onClose={() => {
            const current = pendingDelete;
            setPendingDelete(null);
            current?.resolve(false);
          }}
        />
      </div>
    </MotionConfig>
  );
}
