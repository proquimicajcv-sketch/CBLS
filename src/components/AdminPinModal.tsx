import React, { useEffect, useState } from 'react';
import { KeyRound, Lock, X } from 'lucide-react';
import { isPersonalAdminCode } from '../utils/ecology';
import { Button, Field, inputClassName, Surface } from './ui';

interface AdminPinModalProps {
  open: boolean;
  title: string;
  actionDescription: string;
  confirmLabel?: string;
  onSuccess: (verifiedPin: string) => void;
  onClose: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  open,
  title,
  actionDescription,
  confirmLabel = 'Autorizar con código',
  onSuccess,
  onClose,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin('');
      setError(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleClose = () => {
    setPin('');
    setError(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pin.trim();
    if (isPersonalAdminCode(cleaned)) {
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
      aria-labelledby="admin-pin-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <Surface elevated className="w-full max-w-sm rounded-xl p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-primary">
            <Lock className="h-5 w-5" />
            <h3 id="admin-pin-modal-title" className="font-semibold text-foreground">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted hover:text-foreground"
            aria-label="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            {actionDescription}. Por seguridad, debes ingresar tu código personal exclusivo de administrador para autorizar esta acción.
          </p>

          <Field label="Código personal de administrador" htmlFor="admin-pin-input">
            <div className="relative">
              <input
                id="admin-pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                autoFocus
                placeholder="Ingresa código..."
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
              Código incorrecto. Ningún otro código está autorizado para realizar esta acción.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button tone="quiet" onClick={handleClose}>
              Cancelar
            </Button>
            <Button tone="coral" type="submit">
              {confirmLabel}
            </Button>
          </div>
        </form>
      </Surface>
    </div>
  );
};
