"use client";

import { ButtonHTMLAttributes, ReactNode, useEffect, useId, useRef } from "react";
import { Minus, Plus, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

export function money(value: number): string {
  return AUD.format(value);
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonTone = "primary" | "dark" | "quiet" | "danger";

const TONE: Record<ButtonTone, string> = {
  // Hi-vis yellow is reserved for the single next step on a screen.
  primary: "bg-hivis text-ink hover:bg-hivis-deep disabled:bg-line disabled:text-muted",
  dark: "bg-ink text-white hover:bg-ink-2 disabled:bg-line disabled:text-muted",
  quiet: "bg-surface text-ink border border-line-strong hover:bg-sunk disabled:text-muted",
  danger: "bg-surface text-stop border border-stop/40 hover:bg-stop-soft",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  size?: "m" | "l";
  block?: boolean;
};

export function Button({ tone = "primary", size = "m", block, className = "", ...rest }: ButtonProps) {
  const sizing = size === "l" ? "h-14 px-5 text-[17px]" : "h-11 px-4 text-[15px]";
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-m)] font-semibold transition-colors disabled:cursor-not-allowed ${sizing} ${TONE[tone]} ${block ? "w-full" : ""} ${className}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Quantity stepper                                                    */
/* ------------------------------------------------------------------ */

export function Stepper({
  value,
  onIncrease,
  onDecrease,
  label,
  max = 20,
  size = "m",
}: {
  value: number;
  onIncrease: () => void;
  onDecrease: () => void;
  label: string;
  max?: number;
  size?: "s" | "m";
}) {
  const box = size === "s" ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className="inline-flex items-center rounded-full border border-line-strong bg-surface">
      <button
        type="button"
        onClick={onDecrease}
        aria-label={`Remove one ${label}`}
        className={`${box} inline-flex items-center justify-center rounded-full text-ink hover:bg-sunk`}
      >
        <Minus size={16} strokeWidth={2.5} aria-hidden />
      </button>
      <span className="min-w-[2ch] text-center font-display text-[18px] font-bold tabular" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={value >= max}
        aria-label={`Add one ${label}`}
        className={`${box} inline-flex items-center justify-center rounded-full text-ink hover:bg-sunk disabled:text-line-strong`}
      >
        <Plus size={16} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sheet: bottom sheet on phones, side drawer from 1024px              */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  side = "bottom",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "bottom" becomes a centred dialog on wide screens; "right" a drawer. */
  side?: "bottom" | "right";
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel) {
        const focusable = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      returnFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const placement =
    side === "right"
      ? "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[var(--radius-l)] animate-sheet-up lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[440px] lg:rounded-none lg:animate-sheet-right"
      : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[var(--radius-l)] animate-sheet-up md:inset-auto md:left-1/2 md:top-1/2 md:w-[520px] md:max-h-[86dvh] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-l)] md:animate-fade-in";

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`absolute flex flex-col bg-surface shadow-[0_-8px_40px_rgba(29,33,37,0.25)] outline-none ${placement}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          <h2 id={titleId} className="font-display text-[22px] font-extrabold leading-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-sunk"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t border-line bg-surface px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-ink" : "bg-line-strong"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/** A status pill whose colour carries meaning: go, caution, stop or neutral. */
export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "go" | "caution" | "stop" | "neutral" | "hivis";
  children: ReactNode;
}) {
  const tones = {
    go: "bg-go-soft text-go",
    caution: "bg-caution-soft text-caution",
    stop: "bg-stop-soft text-stop",
    neutral: "bg-sunk text-ink-2",
    hivis: "bg-hivis text-ink",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
  action,
}: {
  tone?: "go" | "caution" | "stop" | "neutral";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    go: "border-go/30 bg-go-soft",
    caution: "border-caution/30 bg-caution-soft",
    stop: "border-stop/30 bg-stop-soft",
    neutral: "border-line bg-sunk",
  } as const;
  return (
    <div role={tone === "stop" ? "alert" : "status"} className={`rounded-[var(--radius-m)] border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-[14px] leading-snug text-ink-2">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
