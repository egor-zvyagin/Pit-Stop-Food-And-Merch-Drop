"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useOrder } from "@/context/OrderContext";
import { useLiveData, LivePod } from "@/context/LiveDataContext";
import { useTracksideLocation } from "@/lib/geo/useTracksideLocation";
import { rankStationsByTotalTime } from "@/lib/geo/geoEngine";
import TracksideLocationBar from "@/components/home/TracksideLocationBar";
import { PodRow } from "@/components/shell/PodPicker";
import type { PitStop, PitStopId } from "@/data/pitStopConstantData";

const PitStopMap = dynamic(() => import("@/components/PitStopMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] w-full items-center justify-center rounded-[var(--radius-l)] bg-[#e3e6e1] lg:h-[520px]">
      <span className="text-[14px] text-muted">Loading the circuit map…</span>
    </div>
  ),
});

export default function MapScreen() {
  const { selectedPitStopId, setSelectedPitStopId } = useOrder();
  const { pods } = useLiveData();
  const location = useTracksideLocation();
  const located = location.position !== null;

  // With a location, walk times come from the fan's position on the
  // footpaths; without one, from the seeded walk from their stand.
  const ranked: LivePod[] = useMemo(() => {
    if (!located) return [...pods].sort((a, b) => a.totalMins - b.totalMins);
    const byId = new Map(
      rankStationsByTotalTime(
        location.position,
        pods.map((p) => ({ ...p, queueWaitMinutes: p.queueMins })) as unknown as PitStop[]
      ).map((r) => [r.id, r])
    );
    const withWalk = pods.map((p) => {
      const r = byId.get(p.id);
      const walkMins = r ? r.walkMinutes : p.walkMins;
      return { ...p, walkMins, totalMins: walkMins + p.queueMins };
    });
    const best = withWalk.reduce((a, b) => (b.totalMins < a.totalMins ? b : a), withWalk[0]);
    return withWalk.map((p) => ({ ...p, isFastest: p.id === best.id })).sort((a, b) => a.totalMins - b.totalMins);
  }, [pods, located, location.position]);

  const selected = ranked.find((p) => p.id === selectedPitStopId);

  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-5 lg:px-6">
      <h1 className="font-display text-[36px] font-extrabold leading-none lg:text-[44px]">Pickup map</h1>
      <p className="mt-2 max-w-[60ch] text-[15px] text-ink-2">
        Four locker pods sit around Albert Park. Pick the one with the shortest walk plus queue; times update every few seconds.
      </p>

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        <div>
          <div id="pit-stop-map" className="overflow-hidden rounded-[var(--radius-l)] border border-line">
            <PitStopMap selectedPitStopId={selectedPitStopId} onSelectPitStop={setSelectedPitStopId} />
          </div>
          <TracksideLocationBar
            mode={location.mode}
            distanceToCircuitKm={location.distanceToCircuitKm}
            activePresetId={location.activePresetId}
            isSimulatingWalk={location.isSimulatingWalk}
            selectedPodId={selectedPitStopId}
            onRequestLiveGps={location.requestLiveGps}
            onEnableSimulation={location.enableSimulatedTrackside}
            onDisableSimulation={location.disableSimulation}
            onStartWalkSimulation={location.startWalkSimulation}
            onStopWalkSimulation={location.stopWalkSimulation}
          />
        </div>

        <section aria-labelledby="pods-heading" className="mt-6 lg:mt-0">
          <h2 id="pods-heading" className="text-[18px] font-semibold">
            Pods, quickest first
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {located ? "Walk times from where you are now." : "Walk times from your stand. Share your location for exact times."}
          </p>
          <div className="mt-3 space-y-2">
            {ranked.map((pod) => (
              <PodRow
                key={pod.id}
                pod={pod}
                selected={pod.id === selectedPitStopId}
                onSelect={() => setSelectedPitStopId(pod.id as PitStopId)}
              />
            ))}
          </div>
          {selected && (
            <Link
              href="/"
              className="mt-4 flex h-14 items-center justify-center rounded-[var(--radius-m)] bg-hivis text-[17px] font-semibold text-ink hover:bg-hivis-deep"
            >
              Order for pickup at {selected.label}
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
