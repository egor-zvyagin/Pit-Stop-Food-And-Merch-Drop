"use client";

import React from "react";
import { PIT_STOPS, PitStopId } from "@/data/pitStopConstantData";
import type { GeoPoint, PedestrianRoute } from "@/lib/geo/types";
import type { StationRecord } from "@/lib/types";

export interface OfflineCircuitMapProps {
  selectedPitStopId?: PitStopId | null;
  onSelectPitStop?: (id: PitStopId) => void;
  userPosition?: GeoPoint | null;
  route?: PedestrianRoute | null;
  stations?: StationRecord[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
  badgeLabel?: string;
  height?: number | string;
}

export default function OfflineCircuitMapFallback({
  selectedPitStopId = null,
  onSelectPitStop = () => {},
  userPosition = null,
  route = null,
  stations,
  isExpanded = false,
  onToggleExpand,
  className = "",
  badgeLabel,
  height,
}: OfflineCircuitMapProps) {
  // Approximate SVG pixel locations on Albert Park track outline
  const podPositions: Record<string, { x: number; y: number; label: string; lat: number; lng: number }> = {
    M1: { x: 195, y: 168, label: "M1", lat: -37.8496, lng: 144.9690 }, // Main Straight
    M2: { x: 315, y: 110, label: "M2", lat: -37.8442, lng: 144.9746 }, // Turn 9 Lakeside
    M3: { x: 175, y: 48, label: "M3", lat: -37.8415, lng: 144.9648 },  // Turn 4 Lakeside Dr
    M4: { x: 82, y: 145, label: "M4", lat: -37.8534, lng: 144.9718 },  // Turn 14 GA Village
  };

  const projectCoordsToSvg = (lat: number, lng: number): { x: number; y: number } => {
    const minLat = -37.858;
    const maxLat = -37.838;
    const minLng = 144.960;
    const maxLng = 144.980;

    const clampedLng = Math.max(minLng, Math.min(maxLng, lng));
    const clampedLat = Math.max(minLat, Math.min(maxLat, lat));

    const x = ((clampedLng - minLng) / (maxLng - minLng)) * 340 + 30;
    const y = ((maxLat - clampedLat) / (maxLat - minLat)) * 140 + 30;

    return { x: Math.round(x), y: Math.round(y) };
  };

  const getStatusColor = (podId: string) => {
    const station = stations?.find((s) => s.id === podId);
    if (station) {
      if (station.status === "FASTEST" || station.status === "LOW QUEUE") return "#3ccf7f";
      if (station.status === "MODERATE") return "#ffb020";
      if (station.status === "HEAVY TRAFFIC") return "#ff5a4e";
    }
    const defaultPod = PIT_STOPS.find((p) => p.id === podId);
    if (defaultPod) {
      if (defaultPod.variant === "fastest" || defaultPod.variant === "lowQueue") return "#3ccf7f";
      if (defaultPod.variant === "heavyTraffic") return "#ff5a4e";
    }
    return "#3ccf7f";
  };

  const getQueueTime = (podId: string) => {
    const station = stations?.find((s) => s.id === podId);
    if (station?.queueTimeMins !== undefined) {
      return `${station.queueTimeMins}m`;
    }
    const defaultPod = PIT_STOPS.find((p) => p.id === podId);
    if (defaultPod?.distance) {
      const match = defaultPod.distance.match(/(\d+)\s*min/);
      if (match) return `${match[1]}m`;
    }
    return podId === "M2" ? "2m" : podId === "M1" ? "1m" : "5m";
  };

  const userSvg = userPosition ? projectCoordsToSvg(userPosition.lat, userPosition.lng) : null;
  const targetPodPos = selectedPitStopId ? podPositions[selectedPitStopId] : null;

  // Midpoint for route pill
  const routeMidpoint = React.useMemo(() => {
    if (!userSvg || !targetPodPos) return null;
    if (route?.coordinates && route.coordinates.length > 1) {
      const midIdx = Math.floor(route.coordinates.length / 2);
      const [lng, lat] = route.coordinates[midIdx];
      return projectCoordsToSvg(lat, lng);
    }
    return {
      x: Math.round((userSvg.x + targetPodPos.x) / 2),
      y: Math.round((userSvg.y + targetPodPos.y) / 2),
    };
  }, [userSvg, targetPodPos, route]);

  return (
    <div
      className={`relative w-full ${
        height ? "" : isExpanded ? "h-[480px]" : "h-[320px] max-h-full"
      } bg-[#0c1017] rounded-xl overflow-hidden border border-[var(--color-border)] select-none transition-all duration-300 ${className}`}
      style={height ? { height } : undefined}
    >
      {/* Albert Park Lake and Circuit SVG representation */}
      <svg
        viewBox="0 0 400 200"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="trackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffd100" />
            <stop offset="100%" stopColor="#ffe36b" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Albert Park Lake */}
        <path
          d="M 120 70 Q 180 50 260 70 Q 300 100 270 140 Q 210 160 140 140 Q 100 110 120 70 Z"
          fill="#132338"
          stroke="#1d3557"
          strokeWidth="1.5"
        />
        <text
          x="185"
          y="112"
          fill="#2a4d7d"
          fontSize="9"
          fontWeight="bold"
          letterSpacing="1"
        >
          ALBERT PARK LAKE
        </text>

        {/* F1 Albert Park Circuit Outer Casing */}
        <path
          d="M 70 140 L 90 90 L 150 45 L 250 35 L 320 70 L 330 115 L 290 155 L 200 170 L 100 165 Z"
          fill="none"
          stroke="#384353"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* F1 Red Racing Line */}
        <path
          d="M 70 140 L 90 90 L 150 45 L 250 35 L 320 70 L 330 115 L 290 155 L 200 170 L 100 165 Z"
          fill="none"
          stroke="#ffd100"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="5 3"
        />

        {/* Start / Finish Straight */}
        <line
          x1="180"
          y1="170"
          x2="220"
          y2="170"
          stroke="#ffffff"
          strokeWidth="3"
          strokeDasharray="2 2"
        />
        <text x="175" y="185" fill="#8892b0" fontSize="7" fontWeight="bold">
          START / FINISH
        </text>

        {/* Pedestrian route line to selected pod */}
        {userSvg && targetPodPos && (
          <g>
            {route?.coordinates && route.coordinates.length > 1 ? (
              <polyline
                points={route.coordinates
                  .map(([lng, lat]) => {
                    const pt = projectCoordsToSvg(lat, lng);
                    return `${pt.x},${pt.y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="#2F80FF"
                strokeWidth="3"
                strokeDasharray="6 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-pulse"
              />
            ) : (
              <line
                x1={userSvg.x}
                y1={userSvg.y}
                x2={targetPodPos.x}
                y2={targetPodPos.y}
                stroke="#2F80FF"
                strokeWidth="2.5"
                strokeDasharray="5 3"
                strokeLinecap="round"
                className="animate-pulse"
              />
            )}
          </g>
        )}

        {/* User GPS beacon dot in SVG */}
        {userSvg && (
          <g>
            <circle
              cx={userSvg.x}
              cy={userSvg.y}
              r="12"
              fill="#2F80FF"
              fillOpacity="0.25"
              className="animate-ping"
            />
            <circle
              cx={userSvg.x}
              cy={userSvg.y}
              r="7"
              fill="#2F80FF"
              fillOpacity="0.45"
            />
            <circle
              cx={userSvg.x}
              cy={userSvg.y}
              r="4.5"
              fill="#2F80FF"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>

      {/* Floating midpoint pill for route */}
      {routeMidpoint && (route || (userSvg && targetPodPos)) && (
        <div
          style={{
            position: "absolute",
            left: `${(routeMidpoint.x / 400) * 100}%`,
            top: `${(routeMidpoint.y / 200) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
          className="bg-black/90 text-white border border-[#2F80FF]/60 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-sm pointer-events-none z-10 whitespace-nowrap"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#2F80FF] animate-pulse" />
          <span>
            {route
              ? `${route.distanceMeters}m • ${route.walkMinutes} min walk`
              : "Walking Route"}
          </span>
        </div>
      )}

      {/* Pod markers */}
      {PIT_STOPS.map((stop) => {
        const pos = podPositions[stop.id] || {
          x: 200,
          y: 100,
          label: stop.id,
          lat: stop.latitude,
          lng: stop.longitude,
        };
        const isSelected = selectedPitStopId === stop.id;
        const statusColor = getStatusColor(stop.id);
        const queueTime = getQueueTime(stop.id);

        return (
          <div
            key={stop.id}
            style={{
              position: "absolute",
              left: `${(pos.x / 400) * 100}%`,
              top: `${(pos.y / 200) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
            className="flex flex-col items-center z-10"
          >
            <button
              type="button"
              onClick={() => onSelectPitStop(stop.id)}
              className={`flex items-center justify-center rounded-full transition-all duration-200 shadow-md ${
                isSelected
                  ? "w-8 h-8 bg-[#ffd100] text-[#1d2125] ring-4 ring-[#ffd100]/40 font-black scale-110 z-20"
                  : "w-7 h-7 bg-[var(--color-surface)] border-2 text-[var(--color-text-primary)] hover:scale-105"
              }`}
              style={{
                borderColor: isSelected ? undefined : statusColor,
              }}
              aria-label={`Select Pod ${stop.id}`}
            >
              <span
                className={
                  isSelected
                    ? "text-xs font-bold leading-none text-white"
                    : "text-[11px] font-bold leading-none text-[var(--color-text-primary)]"
                }
              >
                {stop.id}
              </span>
            </button>

            {/* Queue pill under marker */}
            <div
              className={`mt-1 whitespace-nowrap px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 shadow pointer-events-none transition-all ${
                isSelected
                  ? "bg-[#ffd100] text-[#1d2125] ring-2 ring-white/30"
                  : "bg-black/85 text-white border border-white/20"
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: statusColor }}
              />
              <span>
                {stop.id} · {queueTime}
              </span>
            </div>
          </div>
        );
      })}

      {/* Offline Mode Indicator Badge */}
      <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-medium text-amber-300 border border-amber-500/30 flex items-center gap-1.5 pointer-events-none shadow-md z-20">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span>{badgeLabel || "Simplified map, works offline"}</span>
      </div>

      {/* Expand/Collapse Toggle if onToggleExpand provided */}
      {onToggleExpand && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-white/90 backdrop-blur border border-white/40 text-[#1d2125] hover:bg-white shadow-sm text-[11px] font-medium z-20 transition-colors"
          aria-label={isExpanded ? "Collapse map" : "Expand map"}
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}
