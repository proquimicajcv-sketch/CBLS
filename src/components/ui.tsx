import React, { useState, type ComponentProps } from 'react';
import { Minus, Plus, ImageOff } from 'lucide-react';

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

export const SpecimenImage = ({
  src,
  alt,
  scientificName,
  className = '',
}: {
  src?: string;
  alt: string;
  scientificName: string;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-surface-elevated via-surface to-background p-4 text-center ${className}`}
      >
        <ImageOff className="h-8 w-8 text-muted/60 mb-2" />
        <span className="font-mono text-xs text-secondary">Imagen por URL</span>
        <span className="mt-0.5 text-xs italic text-muted max-w-[90%] truncate">{scientificName || alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
};
