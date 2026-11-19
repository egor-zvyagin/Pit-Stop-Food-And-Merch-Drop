"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";

interface ShareTrackerButtonProps {
  orderId: string;
  className?: string;
  variant?: "primary" | "secondary" | "subtle";
}

export default function ShareTrackerButton({
  orderId,
  className = "",
  variant = "secondary",
}: ShareTrackerButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (!orderId) return;
    const shareUrl = typeof window !== "undefined"
      ? `${window.location.origin}/track/${encodeURIComponent(orderId)}`
      : `/track/${encodeURIComponent(orderId)}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Track Order ${orderId} - F1 Albert Park Pit Stop`,
          text: `Track live concession locker status for order ${orderId}:`,
          url: shareUrl,
        });
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return; // user cancelled share sheet
        }
      }
    }

    // Clipboard fallback
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // fallback prompt
      window.prompt("Copy tracking link:", shareUrl);
    }
  }

  const baseStyles =
    "relative flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display font-bold text-xs tracking-wider uppercase transition-all min-h-tap cursor-pointer";

  const variantStyles =
    variant === "primary"
      ? "bg-[var(--color-brand-primary)] hover:bg-red-700 text-white shadow-card"
      : variant === "subtle"
      ? "bg-transparent border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
      : "bg-[var(--color-surface)] border border-[var(--color-border)] text-neutral-900 hover:bg-neutral-100 shadow-sm";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleShare}
        className={`${baseStyles} ${variantStyles} ${className}`}
        aria-label="Share live tracker link"
      >
        <Icon icon="ph:share-network-bold" width={16} height={16} className="text-[var(--color-brand-primary)]" />
        <span>Share Live Tracker</span>
      </button>

      {/* Toast Notification */}
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <Icon icon="ph:check-bold" width={14} height={14} />
          <span>Tracking Link Copied!</span>
        </div>
      )}
    </div>
  );
}
