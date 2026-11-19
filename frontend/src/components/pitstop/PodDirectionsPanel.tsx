"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@iconify/react";
import Card from "@/components/ui/Card";
import Typography from "@/components/ui/Typography";
import { CALIBRATED_PODS } from "@/data/albertParkGeo";
import { PIT_STOPS, type PitStopId } from "@/data/pitStopConstantData";

const PitStopMap = dynamic(() => import("@/components/PitStopMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[180px] w-full flex flex-col items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl animate-pulse">
      <span className="text-xs text-[var(--color-text-muted)] font-display tracking-wider">
        LOADING CIRCUIT MAP...
      </span>
    </div>
  ),
});

export interface PodDirectionsPanelProps {
  podId: string;
  podName?: string;
  lockerNumber?: string;
  walkTimeMins?: number;
  latitude?: number;
  longitude?: number;
  initialExpanded?: boolean;
}

export default function PodDirectionsPanel({
  podId,
  podName,
  lockerNumber,
  walkTimeMins,
  latitude,
  longitude,
  initialExpanded = true,
}: PodDirectionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  // Resolve coordinates
  const calibrated = CALIBRATED_PODS[podId as keyof typeof CALIBRATED_PODS];
  const staticStop = PIT_STOPS.find((s) => s.id === podId);
  const lat = latitude ?? calibrated?.lat ?? staticStop?.latitude ?? -37.8442;
  const lng = longitude ?? calibrated?.lng ?? staticStop?.longitude ?? 144.9746;
  const name = podName ?? calibrated?.name ?? staticStop?.name ?? `PIT STOP ${podId}`;
  const etaMins = walkTimeMins ?? 2;

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;

  return (
    <Card className="!rounded-[14px] !p-0 overflow-hidden shadow-card border border-[var(--color-border)]">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="w-full px-4 py-3.5 flex items-center justify-between text-left bg-[var(--color-surface)] hover:bg-[var(--color-border)]/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-[var(--color-brand-primary)]/15 border border-[var(--color-brand-primary)]/40 flex items-center justify-center shrink-0">
            <Icon
              icon="ph:navigation-arrow-fill"
              width="16"
              height="16"
              className="text-[var(--color-brand-primary)]"
            />
          </div>
          <div>
            <Typography
              variant="sectionHeader"
              className="!text-[14px] !leading-[18px] font-display font-black tracking-wider uppercase block text-[var(--color-text-primary)]"
            >
              Directions to Pod {podId}
            </Typography>
            <span className="text-[11px] text-[var(--color-text-muted)] font-medium">
              Live Walk ETA: ~{etaMins} min • {name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-display font-bold text-[10px] tracking-wider uppercase">
            ~{etaMins}m walk
          </span>
          <Icon
            icon="ph:caret-down-bold"
            width="16"
            height="16"
            className={`text-[var(--color-text-muted)] transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 pt-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] space-y-3">
          {/* Compact Route Map */}
          <div className="h-[180px] w-full rounded-xl overflow-hidden border border-[var(--color-border)] relative">
            <PitStopMap
              selectedPitStopId={podId as PitStopId}
              onSelectPitStop={() => {}}
            />
          </div>

          {/* Route & Locker Wayfinding Details */}
          <div className="flex items-center justify-between bg-[var(--color-page-background)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <Icon
                icon="ph:door-bold"
                width="16"
                height="16"
                className="text-[var(--color-brand-primary)]"
              />
              <div>
                <span className="text-[var(--color-text-muted)] block text-[10px] uppercase font-bold">
                  Target Locker
                </span>
                <span className="font-display font-black text-sm text-[var(--color-text-primary)]">
                  {lockerNumber || "#04"}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[var(--color-text-muted)] block text-[10px] uppercase font-bold">
                Concession Station
              </span>
              <span className="font-display font-bold text-xs text-[var(--color-text-primary)]">
                {name}
              </span>
            </div>
          </div>

          {/* Open in Google Maps Button */}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-page-background)] hover:bg-[var(--color-border)]/50 text-[var(--color-text-primary)] font-display font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <Icon
              icon="ph:arrow-square-out-bold"
              width="16"
              height="16"
              className="text-[var(--color-brand-primary)]"
            />
            <span>Open in Google Maps</span>
          </a>
        </div>
      )}
    </Card>
  );
}
