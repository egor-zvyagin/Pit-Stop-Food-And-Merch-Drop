"use client";

import { WifiOff } from "lucide-react";
import { useLiveData } from "@/context/LiveDataContext";

const TONE = {
  go: "bg-go text-white",
  caution: "bg-hivis text-ink",
  stop: "bg-stop text-white",
  finish: "bg-ink text-white",
} as const;

/** A chequered square, used for the chequered flag only. */
function Chequer() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 shrink-0 rounded-[2px]"
      style={{
        backgroundImage:
          "conic-gradient(#fff 0 25%, #1d2125 0 50%, #fff 0 75%, #1d2125 0)",
        backgroundSize: "6px 6px",
      }}
    />
  );
}

/**
 * Race control, as it affects ordering. The flag drives queue times and
 * pricing, so it sits directly under the header on every fan screen.
 */
export default function FlagStrip() {
  const { flag, flagCopy, circuit, online } = useLiveData();
  const discount = circuit.offPeakDiscountPct;

  return (
    <div className={`${TONE[flagCopy.tone]}`} role="status" aria-live="polite">
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2 text-[14px] lg:px-6">
        {flag === "POST_RACE" ? (
          <Chequer />
        ) : (
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-current opacity-90" />
        )}
        <span className="font-semibold">{flagCopy.name}</span>
        <span className="hidden min-w-0 truncate opacity-90 sm:inline">{flagCopy.headline}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {!online && (
            <span className="inline-flex items-center gap-1 font-semibold">
              <WifiOff size={14} aria-hidden /> Offline
            </span>
          )}
          <span className="font-semibold">{discount > 0 ? `${discount}% off orders` : "Standard prices"}</span>
        </span>
      </div>
    </div>
  );
}
