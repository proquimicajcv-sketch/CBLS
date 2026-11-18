import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldCheck, UserCheck } from 'lucide-react';
import type { UserSession } from '../types/cbls';
import { Button, Field, inputClassName, Surface } from './ui';

interface UserSessionModalProps {
  open: boolean;
  currentSession: UserSession | null;
  onSave: (name: string, code: string) => { ok: boolean; error?: string };
  onClose?: () => void;
  canCancel?: boolean;
}

export const UserSessionModal: React.FC<UserSessionModalProps> = ({
  open,
  currentSession,
  onSave,
  onClose,
  canCancel = false,
}) => {
  const [name, setName] = useState(currentSession?.observerName || '');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(currentSession?.observerName || '');
      setCode('');
      setShowCode(false);
      setError(null);
    }
  }, [open, currentSession]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor indica tu nombre completo.');
      return;
    }
    if (!code.trim()) {
      setError('Ingresa tu código de acceso autorizado.');
      return;
    }

    const res = onSave(name.trim(), code.trim().toUpperCase());
    if (!res.ok) {
      setError(res.error || 'Código de acceso no autorizado.');
      return;
    }
    if (onClose) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4"
    >
      <Surface elevated className="w-full max-w-md rounded-xl p-6 shadow-2xl border border-primary/30">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Acceso a Bitácora CBLS</h2>
            <p className="text-xs text-muted">Ingreso con código autorizado</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <p className="text-xs text-foreground/85 leading-relaxed">
            Ingresa tu nombre o identificador de brigadista y uno de los códigos de acceso asignados para el Corredor Biológico Los Santos.{' '}
            <span className="text-secondary font-medium">
              Tu nombre quedará vinculado a cada avistamiento y cambio para la vista consolidada del equipo.
            </span>
          </p>

          <Field label="Nombre o ID del brigadista" htmlFor="observer-name-input">
            <input
              id="observer-name-input"
              type="text"
              required
              autoFocus
              placeholder="Ej. Valeria Mora / Brigadista 03"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              className={inputClassName}
            />
          </Field>

          <Field
            label="Código de acceso"
            hint="4 dígitos"
            htmlFor="observer-code-input"
          >
            <div className="relative">
              <input
                id="observer-code-input"
                type={showCode ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={8}
                required
                placeholder="Ingresa tu código asignado"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                className={`${inputClassName} font-mono tracking-widest pr-20`}
              />
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                aria-label={showCode ? 'Ocultar código' : 'Mostrar código'}
                className="absolute right-9 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-foreground"
              >
                {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <ShieldCheck className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            </div>
          </Field>

          {error && (
            <p role="alert" className="text-xs text-coral font-medium">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            {canCancel && onClose && (
              <Button tone="quiet" onClick={onClose}>
                Cerrar
              </Button>
            )}
            <Button tone="primary" type="submit" className="w-full sm:w-auto">
              Confirmar ingreso
            </Button>
          </div>
        </form>
      </Surface>
    </div>
  );
};
