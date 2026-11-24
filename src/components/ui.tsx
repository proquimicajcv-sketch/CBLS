import React, { useEffect, useRef, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import {
  Minus,
  Plus,
  ImageOff,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

export const Surface = ({
  inset = false,
  elevated = false,
  className = '',
  ...props
}: ComponentProps<'div'> & { inset?: boolean; elevated?: boolean }) => {
  const toneClass = inset
    ? '[:where(&)]:bg-background [:where(&)]:border [:where(&)]:border-border'
    : elevated
      ? '[:where(&)]:bg-surface-elevated [:where(&)]:border [:where(&)]:border-primary/25'
      : '[:where(&)]:bg-surface [:where(&)]:border [:where(&)]:border-border';

  return (
    <div
      className={`min-w-0 [:where(&)]:rounded-card [:where(&)]:text-foreground ${toneClass} ${className}`}
      {...props}
    />
  );
};

const buttonTones = {
  primary:
    '[:where(&)]:bg-primary [:where(&)]:text-primary-foreground [:where(&)]:font-semibold hover:brightness-95',
  secondary:
    '[:where(&)]:border [:where(&)]:border-secondary [:where(&)]:bg-transparent [:where(&)]:text-foreground hover:bg-secondary/15',
  quiet:
    '[:where(&)]:border [:where(&)]:border-border [:where(&)]:bg-surface [:where(&)]:text-foreground hover:border-foreground/30',
  ghost:
    '[:where(&)]:bg-transparent [:where(&)]:text-muted hover:text-foreground hover:bg-foreground/5',
  coral:
    '[:where(&)]:border [:where(&)]:border-coral [:where(&)]:bg-coral/15 [:where(&)]:text-foreground hover:bg-coral/25',
};

export const Button = ({
  tone = 'primary',
  type = 'button',
  className = '',
  ...props
}: ComponentProps<'button'> & { tone?: keyof typeof buttonTones }) => (
  <button
    type={type}
    className={`[:where(&)]:inline-flex [:where(&)]:min-h-12 [:where(&)]:items-center [:where(&)]:justify-center [:where(&)]:gap-2 whitespace-nowrap [:where(&)]:rounded-control [:where(&)]:px-4 [:where(&)]:text-sm [:where(&)]:font-medium transition-[transform,opacity,background-color,border-color,color] duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${buttonTones[tone]} ${className}`}
    {...props}
  />
);

export const Field = ({
  label,
  hint,
  htmlFor,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`min-w-0 space-y-1.5 ${className}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
    {children}
  </div>
);

export const inputClassName =
  'w-full min-h-12 rounded-control border border-border bg-input px-3.5 py-2.5 text-base text-foreground placeholder:text-muted/65 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary transition-colors duration-150';

export const textareaClassName =
  'w-full rounded-control border border-border bg-input px-3.5 py-2.5 text-base leading-relaxed text-foreground placeholder:text-muted/65 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary transition-colors duration-150';

export const StepperInput = ({
  id,
  value,
  min = 1,
  max = 9999,
  step = 1,
  unit,
  onChange,
}: {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (next: number) => void;
}) => {
  const clamp = (n: number) => {
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  };

  return (
    <div className="flex min-h-12 items-stretch rounded-control border border-border bg-input">
      <button
        type="button"
        aria-label="Disminuir valor"
        onClick={() => onChange(clamp(Number((value - step).toFixed(4))))}
        disabled={value <= min}
        className="flex min-w-12 items-center justify-center border-r border-border text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="flex flex-1 items-center justify-center gap-1.5 px-3">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isNaN(parsed)) {
              onChange(clamp(parsed));
            }
          }}
          className="w-full bg-transparent text-center font-mono text-base font-medium tabular-nums text-foreground focus:outline-none"
        />
        {unit ? <span className="shrink-0 font-mono text-xs text-muted">{unit}</span> : null}
      </div>
      <button
        type="button"
        aria-label="Aumentar valor"
        onClick={() => onChange(clamp(Number((value + step).toFixed(4))))}
        disabled={value >= max}
        className="flex min-w-12 items-center justify-center border-l border-border text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
};

const FRASES_CBLS = [
  '“En última instancia, conservamos solo lo que amamos; amaremos solo lo que entendemos.” — Baba Dioum',
  '“Cuando tiramos de algo en la naturaleza, descubrimos que está conectado a todo lo demás.” — John Muir',
  '“Cada registro en Tarrazú, Dota y León Cortés es una prueba de que el bosque sigue vivo.” — Brigada CBLS',
  '“No venimos solo a contar especies; venimos a proteger la vida del Corredor Biológico Los Santos.” — Brigada CBLS',
  '“Donde hay agua limpia, sombra y bosque en pie, hay futuro para la montaña y su gente.” — CBLS',
  '“Observar con paciencia y rigor es la primera forma de cuidar lo que amamos.” — Brigada CBLS',
] as const;

function pickNextQuoteIndex(previousIndex: number): number {
  if (FRASES_CBLS.length <= 1) return 0;
  let next: number;
  do {
    next = Math.floor(Math.random() * FRASES_CBLS.length);
  } while (next === previousIndex);
  return next;
}

export const ImageLightbox = ({
  open,
  src,
  alt,
  title,
  scientificName,
  subtitle,
  onClose,
}: {
  open: boolean;
  src: string;
  alt: string;
  title?: string;
  scientificName?: string;
  subtitle?: string;
  onClose: () => void;
}) => {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState<number>(() => pickNextQuoteIndex(-1));

  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const movedRef = useRef(false);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const clampZoom = (next: number) => Math.min(4, Math.max(1, Number(next.toFixed(2))));

  const showNextQuote = () => {
    setQuoteIndex((prev) => pickNextQuoteIndex(prev));
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const applyZoom = (next: number) => {
    const clamped = clampZoom(next);
    setZoom(clamped);
    if (clamped <= 1) {
      setOffset({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    if (!open) return;
    resetView();
    setQuoteIndex((prev) => pickNextQuoteIndex(prev));

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => clampZoom(z + 0.5));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => {
          const next = clampZoom(z - 0.5);
          if (next <= 1) setOffset({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === '0') {
        e.preventDefault();
        resetView();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const getTouchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (zoom <= 1) return;
    e.preventDefault();
    movedRef.current = false;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      movedRef.current = true;
    }
    setOffset({
      x: dragStartRef.current.ox + dx,
      y: dragStartRef.current.oy + dy,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      pinchStartRef.current = {
        distance: getTouchDistance(e.touches),
        zoom,
      };
      dragStartRef.current = null;
      setIsDragging(false);
      return;
    }
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        lastTapRef.current = 0;
        applyZoom(zoom > 1.1 ? 1 : 2.25);
        return;
      }
      lastTapRef.current = now;

      if (zoom > 1) {
        movedRef.current = false;
        setIsDragging(true);
        dragStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          ox: offset.x,
          oy: offset.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      const dist = getTouchDistance(e.touches);
      const scaleFactor = dist / Math.max(1, pinchStartRef.current.distance);
      applyZoom(pinchStartRef.current.zoom * scaleFactor);
      return;
    }
    if (e.touches.length === 1 && dragStartRef.current && zoom > 1) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        movedRef.current = true;
      }
      setOffset({
        x: dragStartRef.current.ox + dx,
        y: dragStartRef.current.oy + dy,
      });
    }
  };

  const handleTouchEnd = () => {
    pinchStartRef.current = null;
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.35 : -0.35;
    applyZoom(zoom + delta);
  };

  const headingTitle = title || alt;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vista detallada de ${headingTitle}`}
      className="fixed inset-0 z-[120] flex flex-col bg-[#020805]/95 text-foreground backdrop-blur-md"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !movedRef.current) {
          onClose();
        }
      }}
    >
      {/* Top Info & Close Bar */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#04110B]/90 px-4 py-3 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white sm:text-base">
            {headingTitle}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {scientificName && (
              <span className="truncate italic text-primary/90">{scientificName}</span>
            )}
            {scientificName && subtitle && <span aria-hidden="true">·</span>}
            {subtitle && <span className="truncate font-mono text-[11px]">{subtitle}</span>}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar vista detallada"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white transition-colors hover:border-coral/60 hover:bg-coral/15 hover:text-coral focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X className="h-5 w-5" />
          <span className="hidden sm:inline">Cerrar</span>
        </button>
      </div>

      {/* Main Zoomable Image Stage */}
      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-5 touch-none select-none ${
          zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === e.currentTarget && !movedRef.current) {
            onClose();
          }
          movedRef.current = false;
        }}
      >
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          draggable={false}
          onDoubleClick={(e) => {
            e.stopPropagation();
            applyZoom(zoom > 1.1 ? 1 : 2.25);
          }}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          }}
          className={`max-h-full max-w-full rounded-lg object-contain shadow-2xl ${
            isDragging ? '' : 'transition-transform duration-150 ease-out'
          }`}
        />
      </div>

      {/* CBLS Quote Banner — right above the bottom zoom controls bar */}
      <div
        className="shrink-0 px-3 pb-2 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="cblsQuoteBanner"
          className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-950/50 px-4 py-2 text-emerald-100/95"
        >
          <p id="cblsQuoteText" className="cbls-quote-bar m-0">
            {FRASES_CBLS[quoteIndex]}
          </p>
          <button
            type="button"
            onClick={showNextQuote}
            title="Cambiar frase"
            className="shrink-0 rounded bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 focus-visible:outline-2 focus-visible:outline-primary"
          >
            Nueva frase
          </button>
        </div>
      </div>

      {/* Bottom Zoom Controls Bar (Thumb-friendly) */}
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#04110B]/90 px-4 py-3 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="hidden text-xs text-muted md:block">
          Doble clic o rueda del ratón para acercar · Arrastra para explorar detalles
        </p>
        <p className="text-[11px] text-muted md:hidden">
          Pellizca o toca dos veces para acercar
        </p>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => applyZoom(zoom - 0.5)}
            disabled={zoom <= 1}
            aria-label="Alejar imagen"
            className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-white/15 bg-white/5 text-white transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-35"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={resetView}
            title="Restablecer al 100%"
            className="inline-flex h-11 min-w-[68px] items-center justify-center rounded-control border border-white/15 bg-white/5 px-3 font-mono text-xs font-semibold tabular-nums text-white transition-colors hover:border-primary/50 hover:text-primary"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            onClick={() => applyZoom(zoom + 0.5)}
            disabled={zoom >= 4}
            aria-label="Acercar imagen"
            className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-white/15 bg-white/5 text-white transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-35"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          {zoom > 1 && (
            <button
              type="button"
              onClick={resetView}
              aria-label="Restablecer vista"
              className="inline-flex h-11 items-center gap-1.5 rounded-control border border-primary/35 bg-primary/15 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ajustar</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const SpecimenImage = ({
  src,
  alt,
  scientificName,
  title,
  subtitle,
  fit = 'contain',
  zoomable = true,
  showZoomHint = true,
  className = '',
}: {
  src?: string;
  alt: string;
  scientificName: string;
  title?: string;
  subtitle?: string;
  fit?: 'contain' | 'cover';
  zoomable?: boolean;
  showZoomHint?: boolean;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-surface-elevated via-surface to-background p-4 text-center ${className}`}
      >
        <ImageOff className="mb-2 h-8 w-8 text-muted/60" />
        <span className="font-mono text-xs text-secondary">Imagen por URL</span>
        <span className="mt-0.5 max-w-[90%] truncate text-xs italic text-muted">
          {scientificName || alt}
        </span>
      </div>
    );
  }

  const handleOpenLightbox = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!zoomable) return;
    e.stopPropagation();
    setLightboxOpen(true);
  };

  return (
    <>
      <div
        role={zoomable ? 'button' : undefined}
        tabIndex={zoomable ? 0 : undefined}
        aria-label={
          zoomable ? `Ver imagen completa de ${title || alt} con detalle` : undefined
        }
        title={zoomable ? 'Tocar para ver imagen completa y con detalle' : undefined}
        onClick={zoomable ? handleOpenLightbox : undefined}
        onKeyDown={
          zoomable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenLightbox(e);
                }
              }
            : undefined
        }
        className={`group/specimen relative overflow-hidden bg-[#040D09] ${
          zoomable
            ? 'cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary'
            : ''
        } ${className}`}
      >
        {fit === 'contain' && (
          <>
            <img
              src={src}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 select-none object-cover opacity-35 blur-xl saturate-125"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/35"
            />
          </>
        )}

        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={`relative z-[1] h-full w-full ${
            fit === 'contain' ? 'object-contain' : 'object-cover'
          } ${
            zoomable
              ? 'transition-transform duration-200 ease-out group-hover/specimen:scale-[1.02]'
              : ''
          }`}
        />

        {zoomable && showZoomHint && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2.5 right-2.5 z-[2] inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-[#04110B]/85 px-2 py-1 text-[11px] font-medium text-white/90 shadow-sm backdrop-blur-sm transition-colors group-hover/specimen:border-primary/60 group-hover/specimen:text-primary"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ampliar</span>
          </span>
        )}
      </div>

      {zoomable && (
        <ImageLightbox
          open={lightboxOpen}
          src={src}
          alt={alt}
          title={title || alt}
          scientificName={scientificName}
          subtitle={subtitle}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
};
