"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { PIT_STOPS, PitStop, PitStopId } from "@/data/pitStopConstantData";
import type { CircuitFlag, CircuitState, StationRecord } from "@/lib/types";

const POLL_MS = 10_000;

export const DEFAULT_CIRCUIT: CircuitState = {
  flag: "GREEN_FLAG",
  queueMultiplier: 1,
  offPeakDiscountPct: 10,
  message: "Normal racing conditions.",
  updatedAt: new Date(0).toISOString(),
  updatedBy: "system",
};

/** A pickup pod with its latest queue time. */
export type LivePod = PitStop & {
  queueMins: number;
  /** Walk plus queue, the number fans compare. */
  totalMins: number;
  isFastest: boolean;
};

export type FlagCopy = {
  name: string;
  /** What the flag means for someone ordering food. */
  headline: string;
  tone: "go" | "caution" | "stop" | "finish";
};

export const FLAG_COPY: Record<CircuitFlag, FlagCopy> = {
  GREEN_FLAG: {
    name: "Green flag",
    headline: "Racing is on. Order now and skip the lap-break rush.",
    tone: "go",
  },
  SAFETY_CAR: {
    name: "Safety car",
    headline: "Safety car out. Queues are building at every pod.",
    tone: "caution",
  },
  RED_FLAG: {
    name: "Red flag",
    headline: "Session stopped. Expect the longest queues of the day.",
    tone: "stop",
  },
  POST_RACE: {
    name: "Chequered flag",
    headline: "Race over. Merch and food are discounted until close.",
    tone: "finish",
  },
};

type LiveData = {
  circuit: CircuitState;
  flag: CircuitFlag;
  flagCopy: FlagCopy;
  pods: LivePod[];
  podById: (id: string | null | undefined) => LivePod | undefined;
  fastestPodId: PitStopId;
  /** False when the last refresh failed or the browser reports no network. */
  online: boolean;
  lastUpdated: string | null;
};

const LiveDataContext = createContext<LiveData | undefined>(undefined);

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const [circuit, setCircuit] = useState<CircuitState>(DEFAULT_CIRCUIT);
  const [stations, setStations] = useState<StationRecord[]>([]);
  const [online, setOnline] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/stations/capacity", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (cancelled) return;
        if (json.circuitState?.flag) setCircuit(json.circuitState as CircuitState);
        if (Array.isArray(json.stations)) setStations(json.stations as StationRecord[]);
        setOnline(true);
        setLastUpdated(new Date().toISOString());
      } catch {
        if (!cancelled) setOnline(false);
      }
    }

    const goOnline = () => {
      setOnline(true);
      void refresh();
    };
    const goOffline = () => setOnline(false);

    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const value = useMemo<LiveData>(() => {
    const flag = (circuit.flag in FLAG_COPY ? circuit.flag : "GREEN_FLAG") as CircuitFlag;
    const base = PIT_STOPS.map((stop) => {
      const live = stations.find((s) => s.id === stop.id);
      const queueMins = live?.queueTimeMins ?? Math.round(stop.queueMins * (circuit.queueMultiplier || 1));
      return { ...stop, queueMins, totalMins: stop.walkMins + queueMins, isFastest: false };
    });
    const fastest = base.reduce((best, p) => (p.totalMins < best.totalMins ? p : best), base[0]);
    const pods = base.map((p) => ({ ...p, isFastest: p.id === fastest.id }));
    return {
      circuit,
      flag,
      flagCopy: FLAG_COPY[flag],
      pods,
      podById: (id) => pods.find((p) => p.id === id),
      fastestPodId: fastest.id,
      online,
      lastUpdated,
    };
  }, [circuit, stations, online, lastUpdated]);

  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

export function useLiveData(): LiveData {
  const ctx = useContext(LiveDataContext);
  if (!ctx) throw new Error("useLiveData must be used inside LiveDataProvider");
  return ctx;
}
