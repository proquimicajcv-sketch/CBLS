import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Button } from './ui';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <Button
        tone="secondary"
        onClick={install}
        className="min-h-10 px-3 text-xs"
        title="Instalar Bitácora CBLS en tu pantalla de inicio"
      >
        <Download className="h-4 w-4 text-primary" />
        Instalar App
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button
          tone="secondary"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-10 px-3 text-xs"
          title="Instalar en iPhone o iPad"
        >
          <Smartphone className="h-4 w-4 text-primary" />
          Instalar en iOS
        </Button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
              <h3 className="text-base font-bold text-foreground">
                Instalar en iPhone / iPad
              </h3>
              <p className="mt-3 text-xs text-foreground/90 leading-relaxed">
                1. Presiona el botón de <strong>Compartir</strong> en la barra de Safari (icono con flecha hacia arriba).<br /><br />
                2. Desliza hacia abajo y selecciona <strong>&quot;Agregar a inicio&quot;</strong>.<br /><br />
                La app funcionará de forma independiente sin conexión en campo.
              </p>
              <Button
                tone="primary"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full"
              >
                Entendido
              </Button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
