"use client";

import { Crosshair, Footprints, LoaderCircle, MapPin, Square } from "lucide-react";
import type { GpsMode } from "@/lib/geo/types";

export interface TracksideLocationBarProps {
  mode: GpsMode;
  distanceToCircuitKm: number | null;
  activePresetId: string | null;
  isSimulatingWalk?: boolean;
  selectedPodId?: string | null;
  onRequestLiveGps: () => void;
  onEnableSimulation: (presetId?: string) => void;
  onDisableSimulation: () => void;
  onStartWalkSimulation: (targetPodId: string) => void;
  onStopWalkSimulation: () => void;
  onShowRealLocation?: () => void;
}

const PRESETS = [
  { id: "clark", label: "Clark stand", turn: "Turn 9" },
  { id: "fangio", label: "Fangio stand", turn: "Pit straight" },
  { id: "brabham", label: "Brabham stand", turn: "Turn 1" },
  { id: "albert-park-green", label: "GA village", turn: "Turn 14" },
];

const quiet =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-m)] border border-line-strong bg-surface px-3 text-[14px] font-semibold text-ink hover:bg-sunk";
const dark =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-m)] bg-ink px-3 text-[14px] font-semibold text-white hover:bg-ink-2";

function Panel({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "caution" | "you" | "go" }) {
  const tones = {
    neutral: "border-line bg-surface",
    caution: "border-caution/30 bg-caution-soft",
    you: "border-you/25 bg-[#eef3fe]",
    go: "border-go/30 bg-go-soft",
  } as const;
  return <div className={`mt-3 space-y-3 rounded-[var(--radius-l)] border p-4 ${tones[tone]}`}>{children}</div>;
}

/**
 * Location controls under the circuit map. Real GPS gives walk times from
 * where the fan stands; the simulation places them in a grandstand so the
 * feature can be shown away from the circuit.
 */
export default function TracksideLocationBar({
  mode,
  distanceToCircuitKm,
  activePresetId,
  isSimulatingWalk = false,
  selectedPodId,
  onRequestLiveGps,
  onEnableSimulation,
  onDisableSimulation,
  onStartWalkSimulation,
  onStopWalkSimulation,
  onShowRealLocation,
}: TracksideLocationBarProps) {
  const targetPod = selectedPodId || "M1";

  if (mode === "locating") {
    return (
      <Panel>
        <p className="flex items-center gap-2 text-[15px] text-ink-2" role="status">
          <LoaderCircle size={18} className="animate-spin" aria-hidden /> Finding your location…
        </p>
      </Panel>
    );
  }

  if (mode === "simulated") {
    return (
      <Panel tone="you">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-ink">Simulated location</p>
          <button type="button" onClick={onRequestLiveGps} className="text-[14px] font-semibold underline underline-offset-2">
            Use my real location
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onEnableSimulation(preset.id)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-[var(--radius-m)] border px-3 py-2 text-left ${
                  active ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:bg-sunk"
                }`}
              >
                <MapPin size={16} className="shrink-0" aria-hidden />
                <span className="leading-tight">
                  <span className="block text-[14px] font-semibold">{preset.label}</span>
                  <span className={`block text-[12px] ${active ? "text-white/70" : "text-muted"}`}>{preset.turn}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => (isSimulatingWalk ? onStopWalkSimulation() : onStartWalkSimulation(targetPod))}
            className={`${isSimulatingWalk ? dark : quiet} flex-1`}
          >
            {isSimulatingWalk ? <Square size={16} aria-hidden /> : <Footprints size={16} aria-hidden />}
            {isSimulatingWalk ? `Walking to ${targetPod}… stop` : `Simulate the walk to ${targetPod}`}
          </button>
          <button type="button" onClick={onDisableSimulation} className={quiet}>
            Reset
          </button>
        </div>
      </Panel>
    );
  }

  if (mode === "denied" || mode === "unavailable") {
    return (
      <Panel tone="caution">
        <p className="text-[15px] text-ink">
          <span className="font-semibold">Location is off.</span> Times below use the walk from your stand. Allow location in your browser settings for exact times.
        </p>
        <button type="button" onClick={() => onEnableSimulation("clark")} className={quiet}>
          Simulate being at the track
        </button>
      </Panel>
    );
  }

  if (mode === "live_offsite") {
    const dist = distanceToCircuitKm !== null ? `${distanceToCircuitKm.toFixed(1)} km` : "a long way";
    return (
      <Panel tone="caution">
        <p className="text-[15px] text-ink">You are {dist} from Albert Park, so walk times use your stand instead.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onEnableSimulation("fangio")} className={quiet}>
            Simulate being at the track
          </button>
          {onShowRealLocation && (
            <button type="button" onClick={onShowRealLocation} className={quiet}>
              Show my real location
            </button>
          )}
        </div>
      </Panel>
    );
  }

  if (mode === "live_trackside") {
    return (
      <Panel tone="go">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-go">
            <span className="h-2.5 w-2.5 rounded-full bg-go" aria-hidden /> Using your location at the circuit
          </p>
          <button type="button" onClick={() => onEnableSimulation("clark")} className="text-[14px] font-semibold underline underline-offset-2">
            Simulate
          </button>
        </div>
      </Panel>
    );
  }

  // Idle: location not requested yet.
  return (
    <Panel>
      <p className="text-[15px] text-ink-2">Share your location to get walk times from exactly where you are.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRequestLiveGps} className={dark}>
          <Crosshair size={16} aria-hidden /> Use my location
        </button>
        <button type="button" onClick={() => onEnableSimulation("clark")} className={quiet}>
          Simulate being at the track
        </button>
      </div>
    </Panel>
  );
}
