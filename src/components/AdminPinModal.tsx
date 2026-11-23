import React, { useState } from 'react';
import { KeyRound, Lock, X } from 'lucide-react';
import { ADMIN_PIN } from '../utils/ecology';
import { Button, Field, inputClassName, Surface } from './ui';

interface AdminPinModalProps {
  open: boolean;
  title: string;
  actionDescription: string;
  onSuccess: (verifiedPin: string) => void;
  onClose: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  open,
  title,
  actionDescription,
  onSuccess,
  onClose,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pin.trim();
    if (cleaned === ADMIN_PIN) {
      setError(false);
      setPin('');
      onSuccess(cleaned);
    } else {
      setError(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface elevated className="w-full max-w-sm rounded-xl p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-primary">
            <Lock className="h-5 w-5" />
            <h3 className="font-semibold text-foreground">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground"
            aria-label="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            {actionDescription}. Ingresa la clave de administrador para autorizar esta operación.
          </p>

          <Field label="Clave de Administrador" htmlFor="admin-pin-input">
            <div className="relative">
              <input
                id="admin-pin-input"
                type="password"
                maxLength={8}
                autoFocus
                placeholder="Ingresa clave..."
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(false);
                }}
                className={`${inputClassName} font-mono tracking-widest text-center text-lg`}
              />
              <KeyRound className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            </div>
          </Field>

          {error && (
            <p role="alert" className="text-xs font-medium text-coral text-center">
              Clave incorrecta. Solo el administrador autorizado puede editar o eliminar especies.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button tone="quiet" onClick={onClose}>
              Cancelar
            </Button>
            <Button tone="primary" type="submit">
              Verificar clave
            </Button>
          </div>
        </form>
      </Surface>
    </div>
  );
};
