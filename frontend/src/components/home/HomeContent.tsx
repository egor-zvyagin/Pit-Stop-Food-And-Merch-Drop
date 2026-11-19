"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@iconify/react";
import Card from "@/components/ui/Card";
import Typography from "@/components/ui/Typography";
import { PIT_STOPS, PitStop } from "@/data/pitStopConstantData";
import SelectedPitStopCard from "./SelectedPitStopCard";
import TracksideLocationBar from "./TracksideLocationBar";
import CircuitFlagBanner from "./CircuitFlagBanner";
import { useOrder } from "@/components/order/OrderProvider";
import PitStopInfo from "../pitstop/PitStopInfo";
import { useTracksideLocation } from "@/lib/geo/useTracksideLocation";
import { rankStationsByTotalTime } from "@/lib/geo/geoEngine";
import type { RankedPitStop } from "@/lib/geo/types";
import type { StationRecord } from "@/lib/types";

const PitStopMap = dynamic(() => import("@/components/PitStopMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] w-full flex flex-col items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl animate-pulse">
      <span className="text-xs text-[var(--color-text-muted)] font-display tracking-wider">
        LOADING ALBERT PARK TRACK MAP...
      </span>
    </div>
  ),
});

export default function HomeContent() {
  // Shared selected pit stop
  const {
    selectedPitStop,
    selectedPitStopId,
    setSelectedPitStopId,
  } = useOrder();

  // Live station capacity
  const [liveStations, setLiveStations] = useState<StationRecord[]>([]);

  useEffect(() => {
    let active = true;
    const fetchCapacities = async () => {
      try {
        const res = await fetch("/api/stations/capacity");
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && Array.isArray(json.stations) && active) {
          setLiveStations(json.stations);
        }
      } catch {
        // Fallback to static PIT_STOPS
      }
    };

    fetchCapacities();
    const interval = setInterval(fetchCapacities, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Merge live station capacity into PIT_STOPS with graceful fallback
  const stations = useMemo(() => {
    return PIT_STOPS.map((stop) => {
      const live = liveStations.find((s) => s.id === stop.id);
      if (!live) return stop;

      let variant = stop.variant;
      if (live.status === "FASTEST") variant = "fastest";
      else if (live.status === "LOW QUEUE") variant = "lowQueue";
      else if (live.status === "HEAVY TRAFFIC") variant = "heavyTraffic";

      return {
        ...stop,
        status: live.status || stop.status,
        variant,
        queueWaitMinutes: live.queueTimeMins ?? 3,
      };
    });
  }, [liveStations]);

  // Trackside geolocation hook
  const {
    position,
    mode,
    distanceToCircuitKm,
    activePresetId,
    requestLiveGps,
    enableSimulatedTrackside,
    disableSimulation,
    startWalkSimulation,
    stopWalkSimulation,
    isSimulatingWalk,
  } = useTracksideLocation();

  // Rank stations by walk time + queue time
  const rankedStations = useMemo(() => {
    return rankStationsByTotalTime(position, stations as unknown as PitStop[]);
  }, [position, stations]);

  const rankedById = useMemo(() => {
    const map = new Map<string, RankedPitStop>();
    for (const r of rankedStations) {
      map.set(r.id, r);
    }
    return map;
  }, [rankedStations]);

  const fastestPodId = rankedStations.length > 0 ? rankedStations[0].id : null;

  const isLocationActive =
    mode === "live_trackside" ||
    mode === "simulated" ||
    mode === "live_offsite" ||
    position !== null;

  const getDistanceDisplay = (stopId: string, fallback: string): string => {
    if (!isLocationActive) return fallback;
    const ranked = rankedById.get(stopId);
    if (!ranked) return fallback;
    const meters = ranked.distanceMeters;
    const minutes = ranked.walkMinutes;
    const distStr =
      meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
    return `${distStr} • ${minutes} min walk`;
  };

  const currentSelectedStop = selectedPitStop
    ? stations.find((s) => s.id === selectedPitStop.id) || selectedPitStop
    : null;

  return (
    <div className="w-full">
      {/*  Heading */}
      <section
        className="
          border-b
          border-[var(--color-border)]
          bg-[var(--color-surface)]
          px-5
          pb-[14px]
          pt-4
        "
      >
        <Typography
          variant="meta"
          className="
            block
            tracking-[0.88px]
            !text-[var(--color-text-muted)]
          "
        >
          RACE DAY · GRANDSTAND A
        </Typography>

        <Typography
          variant="screenTitle"
          className="
            mt-[2px]
            block
            text-[30px]
            leading-[31.5px]
          "
        >
          TRACK MAP
        </Typography>

        <Typography
          variant="body"
          className="
            mt-1
            block
            !text-[var(--color-text-muted)]
          "
        >
          Tap a pit stop to see wait times and order from that location.
        </Typography>
      </section>

      {/* Circuit Flag Banner */}
      <div className="px-4 pt-3">
        <CircuitFlagBanner />
      </div>

      {/* Map */}
      <div id="pit-stop-map" className="px-4 pt-4">
        <div className="overflow-hidden rounded-xl">
          <PitStopMap
            selectedPitStopId={selectedPitStopId}
            onSelectPitStop={setSelectedPitStopId}
          />
        </div>
      </div>

      {/* Trackside Location Bar */}
      <TracksideLocationBar
        mode={mode}
        distanceToCircuitKm={distanceToCircuitKm}
        activePresetId={activePresetId}
        isSimulatingWalk={isSimulatingWalk}
        selectedPodId={selectedPitStopId}
        onRequestLiveGps={requestLiveGps}
        onEnableSimulation={enableSimulatedTrackside}
        onDisableSimulation={disableSimulation}
        onStartWalkSimulation={startWalkSimulation}
        onStopWalkSimulation={stopWalkSimulation}
      />

      {/* Legend */}
      <div className="flex items-center gap-[14px] px-4 pt-[10px]">
        <LegendItem
          color="bg-[var(--color-status-success)]"
          label="Low queue"
        />

        <LegendItem
          color="bg-[var(--color-status-danger)]"
          label="Heavy traffic"
        />

        <LegendItem
          color="bg-[var(--color-status-info)]"
          label="Your location"
        />
      </div>

      {/* Pit Stop selection */}
      <div className="px-4 pt-[14px]">
        {currentSelectedStop ? (
          <SelectedPitStopCard
            stop={currentSelectedStop}
            distanceDisplay={getDistanceDisplay(
              currentSelectedStop.id,
              currentSelectedStop.distance
            )}
            isFastestTotal={currentSelectedStop.id === fastestPodId}
            onViewMap={() => {
              document.getElementById("pit-stop-map")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }}
          />
        ) : (
          <Card className="!rounded-[14px] !px-4 !py-5">
            <div className="flex flex-col items-center text-center">
              <div
                className="
                  flex
                  h-12
                  w-12
                  items-center
                  justify-center
                  rounded-full
                  border
                  border-[var(--color-border)]
                  bg-[var(--color-page-background)]
                "
              >
                <Icon
                  icon="bx:map-alt"
                  width="24"
                  height="24"
                  className="text-[var(--color-text-muted)]"
                />
              </div>

              <Typography
                variant="cardHeading"
                className="
                  mt-[10px]
                  block
                  text-[17px]
                  leading-[25.5px]
                "
              >
                SELECT A PIT STOP
              </Typography>

              <Typography
                variant="body"
                className="
                  mt-1
                  block
                  text-center
                  !text-[var(--color-text-muted)]
                "
              >
                Tap any marker on the map to see live queue times and order options.
              </Typography>
            </div>
          </Card>
        )}
      </div>

      {/* All pit stops */}
      <section
        className="
          px-4
          pb-[calc(var(--bottom-nav-height)+16px)]
          pt-[14px]
        "
      >
        <Typography
          variant="meta"
          className="
            block
            tracking-[0.66px]
            !text-[var(--color-text-muted)]
          "
        >
          ALL PIT STOPS
        </Typography>

        <div className="mt-2 flex flex-col gap-2">
          {stations.map((stop) => {
            const isSelected = selectedPitStopId === stop.id;
            const isFastestTotal = stop.id === fastestPodId;
            const distanceDisplay = getDistanceDisplay(stop.id, stop.distance);

            return (
              <button
                key={stop.id}
                type="button"
                onClick={() => setSelectedPitStopId(stop.id)}
                aria-pressed={isSelected}
                className="w-full text-left"
              >
                <Card
                  selected={isSelected}
                  className="
                    !rounded-[10px]
                    !px-[14px]
                    !py-3
                  "
                >
                  <PitStopInfo
                    stop={stop}
                    selected={isSelected}
                    distanceDisplay={distanceDisplay}
                    isFastestTotal={isFastestTotal}
                  />
                </Card>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

type LegendItemProps = {
  color: string;
  label: string;
};

function LegendItem({ color, label }: LegendItemProps) {
  return (
    <div className="flex items-center gap-1">
      <span
        className={`
          h-2
          w-2
          rounded-[4px]
          ${color}
        `}
      />

      <Typography
        variant="body"
        className="
          text-[11px]
          leading-[16.5px]
          !text-[var(--color-text-muted)]
        "
      >
        {label}
      </Typography>
    </div>
  );
}
