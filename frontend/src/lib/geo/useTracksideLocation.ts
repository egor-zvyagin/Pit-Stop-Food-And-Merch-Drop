'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GeoPoint, TracksideLocationState } from '@/lib/geo/types';
import { ALBERT_PARK_CENTER, GRANDSTAND_PRESETS } from '@/data/albertParkGeo';
import { PIT_STOPS } from '@/data/pitStopConstantData';
import { haversineDistanceMeters, computePedestrianRoute } from '@/lib/geo/geoEngine';

export interface UseTracksideLocationOptions {
  autoStart?: boolean;
  enableSimulationDefault?: boolean;
  defaultPresetId?: string;
}

export interface UseTracksideLocationResult extends TracksideLocationState {
  state: TracksideLocationState;
  requestLiveGps: () => void;
  enableSimulatedTrackside: (presetId?: string) => void;
  setSimulatedPosition: (point: GeoPoint) => void;
  disableSimulation: () => void;
  startWalkSimulation: (targetPodId: string) => void;
  stopWalkSimulation: () => void;
  isSimulatingWalk: boolean;
}

function calculateBearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Hook providing live GPS geolocation with Albert Park 2.5 km geofence classification,
 * simulated spectator preset positions, and animated pedestrian walk simulation along
 * calibrated trackside pathways.
 */
export function useTracksideLocation(
  options: UseTracksideLocationOptions = {}
): UseTracksideLocationResult {
  const { autoStart = false, enableSimulationDefault = false, defaultPresetId = 'fangio' } =
    options;

  const [state, setState] = useState<TracksideLocationState>(() => {
    if (enableSimulationDefault) {
      const preset =
        GRANDSTAND_PRESETS.find((p) => p.id === defaultPresetId) ||
        GRANDSTAND_PRESETS[0];
      const distM = haversineDistanceMeters(preset.position, ALBERT_PARK_CENTER);
      return {
        position: preset.position,
        rawGpsPosition: null,
        accuracyMeters: 5,
        heading: 65,
        mode: 'simulated',
        distanceToCircuitKm: Number((distM / 1000).toFixed(2)),
        activePresetId: preset.id,
        error: null,
      };
    }

    return {
      position: null,
      rawGpsPosition: null,
      accuracyMeters: null,
      heading: null,
      mode: 'idle',
      distanceToCircuitKm: null,
      activePresetId: null,
      error: null,
    };
  });

  const [isSimulatingWalk, setIsSimulatingWalk] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const walkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearLiveWatch = useCallback(() => {
    if (
      watchIdRef.current !== null &&
      typeof window !== 'undefined' &&
      'geolocation' in navigator
    ) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const stopWalkSimulation = useCallback(() => {
    if (walkIntervalRef.current) {
      clearInterval(walkIntervalRef.current);
      walkIntervalRef.current = null;
    }
    setIsSimulatingWalk(false);
  }, []);

  const handlePositionSuccess = useCallback(
    (pos: GeolocationPosition) => {
      const rawPos: GeoPoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      const accuracy = pos.coords.accuracy ?? null;
      const heading = Number.isFinite(pos.coords.heading) ? pos.coords.heading : null;
      const distMeters = haversineDistanceMeters(rawPos, ALBERT_PARK_CENTER);
      const distKm = Number((distMeters / 1000).toFixed(2));
      const isTrackside = distKm <= 2.5;

      setState((prev) => ({
        ...prev,
        position: rawPos,
        rawGpsPosition: rawPos,
        accuracyMeters: accuracy,
        heading: heading ?? prev.heading,
        mode: isTrackside ? 'live_trackside' : 'live_offsite',
        distanceToCircuitKm: distKm,
        activePresetId: null,
        error: null,
      }));
    },
    []
  );

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    setState((prev) => ({
      ...prev,
      mode: err.code === 1 ? 'denied' : 'unavailable',
      error: err.message || 'Unable to retrieve location',
    }));
  }, []);

  const requestLiveGps = useCallback(() => {
    stopWalkSimulation();
    clearLiveWatch();

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setState((prev) => ({
        ...prev,
        mode: 'unavailable',
        error: 'Geolocation is not supported by your browser',
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      mode: 'locating',
      error: null,
    }));

    try {
      const id = navigator.geolocation.watchPosition(
        handlePositionSuccess,
        handlePositionError,
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        }
      );
      watchIdRef.current = id;
    } catch (e: unknown) {
      const errMessage = e instanceof Error ? e.message : 'Failed to start geolocation watcher';
      setState((prev) => ({
        ...prev,
        mode: 'unavailable',
        error: errMessage,
      }));
    }
  }, [clearLiveWatch, handlePositionError, handlePositionSuccess, stopWalkSimulation]);

  const enableSimulatedTrackside = useCallback(
    (presetId?: string) => {
      stopWalkSimulation();
      clearLiveWatch();

      const preset =
        GRANDSTAND_PRESETS.find((p) => p.id === presetId) ||
        GRANDSTAND_PRESETS[0];

      const distMeters = haversineDistanceMeters(preset.position, ALBERT_PARK_CENTER);
      const distKm = Number((distMeters / 1000).toFixed(2));

      setState((prev) => ({
        ...prev,
        position: preset.position,
        accuracyMeters: 5,
        heading: 65,
        mode: 'simulated',
        distanceToCircuitKm: distKm,
        activePresetId: preset.id,
        error: null,
      }));
    },
    [clearLiveWatch, stopWalkSimulation]
  );

  const setSimulatedPosition = useCallback(
    (point: GeoPoint) => {
      stopWalkSimulation();
      const distMeters = haversineDistanceMeters(point, ALBERT_PARK_CENTER);
      const distKm = Number((distMeters / 1000).toFixed(2));

      setState((prev) => ({
        ...prev,
        position: point,
        accuracyMeters: 5,
        mode: 'simulated',
        distanceToCircuitKm: distKm,
        activePresetId: null,
        error: null,
      }));
    },
    [stopWalkSimulation]
  );

  const disableSimulation = useCallback(() => {
    stopWalkSimulation();

    setState((prev) => {
      if (prev.rawGpsPosition) {
        const distMeters = haversineDistanceMeters(
          prev.rawGpsPosition,
          ALBERT_PARK_CENTER
        );
        const distKm = Number((distMeters / 1000).toFixed(2));
        return {
          ...prev,
          position: prev.rawGpsPosition,
          mode: distKm <= 2.5 ? 'live_trackside' : 'live_offsite',
          distanceToCircuitKm: distKm,
          activePresetId: null,
          error: null,
        };
      }

      return {
        ...prev,
        position: null,
        accuracyMeters: null,
        heading: null,
        mode: 'idle',
        distanceToCircuitKm: null,
        activePresetId: null,
        error: null,
      };
    });
  }, [stopWalkSimulation]);

  const startWalkSimulation = useCallback(
    (targetPodId: string) => {
      stopWalkSimulation();

      const targetStop = PIT_STOPS.find((s) => s.id === targetPodId);
      if (!targetStop) return;

      const destination: GeoPoint = {
        lat: targetStop.latitude,
        lng: targetStop.longitude,
      };

      const origin: GeoPoint =
        stateRef.current.position || GRANDSTAND_PRESETS[0].position;

      const route = computePedestrianRoute(origin, destination);
      const waypoints = route.coordinates; // [lng, lat][]

      if (waypoints.length < 2) return;

      // Subdivide waypoints into granular steps (~10-15m apart) for realistic animated progression
      const steps: GeoPoint[] = [];
      for (let i = 0; i < waypoints.length - 1; i++) {
        const p1: GeoPoint = { lat: waypoints[i][1], lng: waypoints[i][0] };
        const p2: GeoPoint = { lat: waypoints[i + 1][1], lng: waypoints[i + 1][0] };
        const segDist = haversineDistanceMeters(p1, p2);
        const numSub = Math.max(1, Math.round(segDist / 12));

        for (let s = 0; s < numSub; s++) {
          const t = s / numSub;
          steps.push({
            lat: p1.lat + (p2.lat - p1.lat) * t,
            lng: p1.lng + (p2.lng - p1.lng) * t,
          });
        }
      }
      steps.push({
        lat: waypoints[waypoints.length - 1][1],
        lng: waypoints[waypoints.length - 1][0],
      });

      let currentStepIdx = 0;
      setIsSimulatingWalk(true);

      walkIntervalRef.current = setInterval(() => {
        currentStepIdx++;
        if (currentStepIdx >= steps.length) {
          stopWalkSimulation();
          return;
        }

        const nextPt = steps[currentStepIdx];
        const prevPt = steps[currentStepIdx - 1];
        const heading = calculateBearingDegrees(prevPt, nextPt);
        const distM = haversineDistanceMeters(nextPt, ALBERT_PARK_CENTER);
        const distKm = Number((distM / 1000).toFixed(2));

        setState((prev) => ({
          ...prev,
          position: nextPt,
          heading,
          accuracyMeters: 4,
          mode: 'simulated',
          distanceToCircuitKm: distKm,
          activePresetId: null,
        }));
      }, 600);
    },
    [stopWalkSimulation]
  );

  // Auto-start watch if requested
  useEffect(() => {
    if (autoStart) {
      // Starts a GPS watch (an external system); its updates set state later.
      requestLiveGps();
    }

    return () => {
      clearLiveWatch();
      stopWalkSimulation();
    };
  }, [autoStart, clearLiveWatch, requestLiveGps, stopWalkSimulation]);

  return {
    ...state,
    state,
    requestLiveGps,
    enableSimulatedTrackside,
    setSimulatedPosition,
    disableSimulation,
    startWalkSimulation,
    stopWalkSimulation,
    isSimulatingWalk,
  };
}
