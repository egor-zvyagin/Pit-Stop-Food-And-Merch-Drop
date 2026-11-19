"use client";

import React from "react";
import { Icon } from "@iconify/react";
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
  // Preset display metadata
  const PRESET_CHIPS = [
    { id: "clark", label: "Clark", turn: "T9" },
    { id: "fangio", label: "Fangio", turn: "Straight" },
    { id: "brabham", label: "Brabham", turn: "T1" },
    { id: "albert-park-green", label: "GA Village", turn: "T14" },
  ];

  const targetPod = selectedPodId || "M1";

  // 1. Idle mode
  if (mode === "idle") {
    return (
      <div className="mt-3 px-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onRequestLiveGps}
              className="flex-1 h-10 px-3 rounded-lg bg-[var(--color-brand-primary)] text-white font-display font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <Icon icon="ph:crosshair-bold" width="15" height="15" />
              <span>Enable Live GPS</span>
            </button>

            <button
              type="button"
              onClick={() => onEnableSimulation("fangio")}
              className="flex-1 h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-page-background)] hover:bg-[var(--color-border)]/40 text-[var(--color-text-primary)] font-display font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all"
            >
              <Icon icon="ph:flask-bold" width="15" height="15" className="text-amber-400" />
              <span>Simulate Trackside</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Live Offsite (outside Albert Park geofence)
  if (mode === "live_offsite") {
    const distText =
      distanceToCircuitKm !== null ? distanceToCircuitKm.toFixed(1) : "X.X";

    return (
      <div className="mt-3 px-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 shadow-sm space-y-2.5">
          <div className="flex items-start gap-2 text-amber-300 text-xs font-medium">
            <Icon
              icon="ph:info-bold"
              width="16"
              height="16"
              className="shrink-0 mt-0.5 text-amber-400"
            />
            <span>
              You are {distText} km from Albert Park — circuit view active
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
            <button
              type="button"
              onClick={() => onEnableSimulation("fangio")}
              className="flex-1 h-9 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-display font-bold text-[11px] tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all"
            >
              <Icon icon="ph:map-pin-line-bold" width="14" height="14" />
              <span>Simulate Trackside GPS</span>
            </button>

            <button
              type="button"
              onClick={onShowRealLocation || onRequestLiveGps}
              className="h-9 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)]/40 text-[var(--color-text-primary)] font-display font-bold text-[11px] tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all"
            >
              <Icon icon="ph:crosshair-simple" width="14" height="14" />
              <span>Show My Real Location</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Denied or Unavailable
  if (mode === "denied" || mode === "unavailable") {
    return (
      <div className="mt-3 px-4">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 shadow-sm space-y-2.5">
          <div className="flex items-start gap-2 text-rose-300 text-xs">
            <Icon
              icon="ph:warning-circle-fill"
              width="16"
              height="16"
              className="shrink-0 mt-0.5 text-rose-400"
            />
            <div>
              <span className="font-bold block">GPS Permission Denied</span>
              <span className="text-[11px] text-rose-300/80">
                Browser location is disabled. Use simulation to experience live trackside walking times.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onEnableSimulation("clark")}
            className="w-full h-9 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-display font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all"
          >
            <Icon icon="ph:flask-bold" width="14" height="14" />
            <span>Simulate Trackside GPS</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Locating spinner
  if (mode === "locating") {
    return (
      <div className="mt-3 px-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 flex items-center justify-center gap-2">
          <Icon
            icon="ph:spinner"
            width="18"
            height="18"
            className="animate-spin text-[var(--color-brand-primary)]"
          />
          <span className="text-xs font-display font-bold uppercase text-[var(--color-text-muted)] tracking-wider">
            Locating trackside position...
          </span>
        </div>
      </div>
    );
  }

  // 5. Simulated mode
  if (mode === "simulated") {
    return (
      <div className="mt-3 px-4">
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 shadow-sm space-y-2.5">
          {/* Header row with simulation badge and real GPS toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="font-display font-bold text-[11px] text-blue-300 tracking-wider uppercase">
                Trackside Simulation Active
              </span>
            </div>

            <button
              type="button"
              onClick={onRequestLiveGps}
              className="text-[10px] font-display font-bold uppercase text-blue-300 hover:text-white underline decoration-blue-400/50 flex items-center gap-1"
            >
              <Icon icon="ph:satellite-bold" width="12" height="12" />
              <span>Use Real GPS</span>
            </button>
          </div>

          {/* Grandstand Preset Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {PRESET_CHIPS.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onEnableSimulation(preset.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-display font-bold tracking-wide uppercase whitespace-nowrap transition-all flex items-center gap-1 shrink-0 ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm ring-1 ring-white/20"
                      : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white hover:border-blue-400/40"
                  }`}
                >
                  <Icon icon="ph:map-pin-bold" width="11" height="11" />
                  <span>{preset.label}</span>
                  <span className="text-[10px] opacity-70">({preset.turn})</span>
                </button>
              );
            })}
          </div>

          {/* Walk to Pod Step Simulation & Step Button */}
          <div className="flex items-center gap-2 pt-1 border-t border-blue-500/20">
            <button
              type="button"
              onClick={() => {
                if (isSimulatingWalk) {
                  onStopWalkSimulation();
                } else {
                  onStartWalkSimulation(targetPod);
                }
              }}
              className={`flex-1 h-9 px-3 rounded-lg font-display font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                isSimulatingWalk
                  ? "bg-amber-600 text-white animate-pulse"
                  : "bg-[var(--color-surface)] border border-blue-400/40 text-blue-200 hover:bg-blue-500/20"
              }`}
            >
              <Icon
                icon={isSimulatingWalk ? "ph:stop-circle-bold" : "ph:person-simple-walk-bold"}
                width="16"
                height="16"
              />
              <span>
                {isSimulatingWalk ? "Walking to Pod..." : `Walk to Pod ${targetPod}`}
              </span>
            </button>

            <button
              type="button"
              onClick={onDisableSimulation}
              className="h-9 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)]/50 text-[var(--color-text-muted)] text-[11px] font-display font-bold uppercase transition-all"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6. Live Trackside (inside Albert Park geofence)
  return (
    <div className="mt-3 px-4">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="font-display font-bold tracking-wider uppercase text-emerald-200">
            Live GPS Active • Circuit Trackside
          </span>
        </div>

        <button
          type="button"
          onClick={() => onEnableSimulation("fangio")}
          className="text-[11px] font-display font-bold uppercase text-emerald-400 hover:text-white underline decoration-emerald-500/40 flex items-center gap-1"
        >
          <Icon icon="ph:flask-bold" width="13" height="13" />
          <span>Simulate</span>
        </button>
      </div>
    </div>
  );
}
