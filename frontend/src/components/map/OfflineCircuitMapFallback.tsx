"use client";

import React from "react";
import { PIT_STOPS, PitStopId } from "@/data/pitStopConstantData";

type OfflineCircuitMapProps = {
  selectedPitStopId: PitStopId | null;
  onSelectPitStop: (id: PitStopId) => void;
};

export default function OfflineCircuitMapFallback({
  selectedPitStopId,
  onSelectPitStop,
}: OfflineCircuitMapProps) {
  // Approximate SVG pixel locations on Albert Park track outline
  const podPositions: Record<string, { x: number; y: number; label: string }> = {
    M1: { x: 195, y: 165, label: "M1" }, // Main Straight
    M2: { x: 310, y: 110, label: "M2" }, // Turn 9 Lakeside
    M3: { x: 260, y: 50, label: "M3" },  // Clarke Chicane
    M4: { x: 85, y: 140, label: "M4" },  // Albert Park Green
  };

  return (
    <div className="relative w-full h-[200px] bg-[#0c1017] rounded-xl overflow-hidden border border-[var(--color-border)] select-none">
      {/* Albert Park Lake and Circuit SVG representation */}
      <svg
        viewBox="0 0 400 200"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Albert Park Lake */}
        <path
          d="M 120 70 Q 180 50 260 70 Q 300 100 270 140 Q 210 160 140 140 Q 100 110 120 70 Z"
          fill="#132338"
          stroke="#1d3557"
          strokeWidth="1.5"
        />
        <text x="185" y="112" fill="#2a4d7d" fontSize="9" fontWeight="bold" letterSpacing="1">
          ALBERT PARK LAKE
        </text>

        {/* F1 Albert Park Circuit Outline */}
        <path
          d="M 70 140 L 90 90 L 150 45 L 250 35 L 320 70 L 330 115 L 290 155 L 200 170 L 100 165 Z"
          fill="none"
          stroke="#384353"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Track center line */}
        <path
          d="M 70 140 L 90 90 L 150 45 L 250 35 L 320 70 L 330 115 L 290 155 L 200 170 L 100 165 Z"
          fill="none"
          stroke="#e10600"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 2"
        />

        {/* Start / Finish Straight */}
        <line x1="180" y1="170" x2="220" y2="170" stroke="#ffffff" strokeWidth="3" strokeDasharray="2 2" />
        <text x="175" y="185" fill="#8892b0" fontSize="7" fontWeight="bold">
          START / FINISH
        </text>
      </svg>

      {/* Pod markers */}
      {PIT_STOPS.map((stop) => {
        const pos = podPositions[stop.id] || { x: 200, y: 100, label: stop.id };
        const isSelected = selectedPitStopId === stop.id;

        return (
          <button
            key={stop.id}
            type="button"
            onClick={() => onSelectPitStop(stop.id)}
            style={{
              position: "absolute",
              left: `${(pos.x / 400) * 100}%`,
              top: `${(pos.y / 200) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
            className={`flex items-center justify-center rounded-full transition-all duration-200 shadow-md ${
              isSelected
                ? "w-8 h-8 bg-[var(--color-brand-primary)] text-white ring-4 ring-red-500/30 font-black scale-110 z-10"
                : "w-6 h-6 bg-[var(--color-surface)] border border-[var(--color-border)] text-white hover:scale-105"
            }`}
            aria-label={`Select Pod ${stop.id}`}
          >
            <span className={isSelected ? "text-xs font-bold" : "text-[10px] font-semibold"}>
              {stop.id}
            </span>
          </button>
        );
      })}

      {/* Offline Mode Indicator Badge */}
      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-gray-400 border border-white/10 flex items-center gap-1.5 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span>Albert Park Track Map</span>
      </div>
    </div>
  );
}
