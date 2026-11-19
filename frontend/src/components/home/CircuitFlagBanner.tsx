"use client";

import { useEffect, useState, useRef } from "react";
import type { CircuitFlag, CircuitState } from "@/lib/types";

const FLAG_CONFIG: Record<
  CircuitFlag,
  { bg: string; border: string; text: string; icon: string; label: string; pricingMsg: string }
> = {
  GREEN_FLAG: {
    bg: "bg-emerald-950/60",
    border: "border-emerald-500",
    text: "text-emerald-400",
    icon: "🟢",
    label: "GREEN FLAG",
    pricingMsg: "🔥 10% Green Flag Discount — Active!",
  },
  SAFETY_CAR: {
    bg: "bg-amber-950/60",
    border: "border-amber-500",
    text: "text-amber-400",
    icon: "🟡",
    label: "SAFETY CAR",
    pricingMsg: "⚠️ Safety Car — Standard Pricing Active",
  },
  RED_FLAG: {
    bg: "bg-red-950/60",
    border: "border-red-500",
    text: "text-red-400",
    icon: "🔴",
    label: "RED FLAG",
    pricingMsg: "🚩 Red Flag — Surge Pricing Active",
  },
  POST_RACE: {
    bg: "bg-sky-950/60",
    border: "border-sky-500",
    text: "text-sky-400",
    icon: "🏁",
    label: "POST RACE",
    pricingMsg: "🏁 Post Race — All Items 15% Off!",
  },
};

const POLL_INTERVAL_MS = 10_000;

interface CircuitFlagBannerProps {
  /** If provided, renders a compact 1-line variant (for order/checkout headers) */
  compact?: boolean;
  /** Called whenever a fresh CircuitState is fetched — lets parents read it */
  onStateChange?: (state: CircuitState) => void;
}

export default function CircuitFlagBanner({ compact, onStateChange }: CircuitFlagBannerProps) {
  const [state, setState] = useState<CircuitState | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/circuit/status");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.success && json.data) {
          setState(json.data as CircuitState);
          onStateChangeRef.current?.(json.data as CircuitState);
        }
      } catch {
        // offline resilience — keep last known state
      }
    }

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

    // Pause when tab is hidden
    const handleVisibility = () => {
      if (!document.hidden) {
        fetchStatus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  if (!state) return null;

  const flag = (state.flag in FLAG_CONFIG ? state.flag : "GREEN_FLAG") as CircuitFlag;
  const cfg = FLAG_CONFIG[flag];

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${cfg.bg} ${cfg.border}`}
        role="status"
        aria-live="polite"
      >
        <span className="text-[14px] leading-none">{cfg.icon}</span>
        <span className={`font-display font-black text-[11px] tracking-widest uppercase ${cfg.text}`}>
          {cfg.label}
        </span>
        <span className="ml-auto text-[11px] font-medium text-white/70">
          {cfg.pricingMsg}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 ${cfg.bg} ${cfg.border}`}
      role="status"
      aria-live="polite"
    >
      <span className="text-2xl leading-none shrink-0">{cfg.icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`font-display font-black text-[13px] tracking-widest uppercase ${cfg.text}`}>
          {cfg.label}
        </div>
        <div className="text-[12px] text-white/80 mt-0.5">{cfg.pricingMsg}</div>
        {state.message && (
          <div className="text-[11px] text-white/50 mt-0.5 italic">{state.message}</div>
        )}
      </div>
    </div>
  );
}
