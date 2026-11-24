"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Map, { Marker, Source, Layer, MapRef } from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// The worker file is copied to public/maplibre by scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import type { Feature, LineString } from "geojson";
import {
  Maximize2,
  Minimize2,
  Navigation,
  RotateCcw,
  Layers,
  Plus,
  Minus,
} from "lucide-react";

import OfflineCircuitMapFallback from "./map/OfflineCircuitMapFallback";
import { ALBERT_PARK_COORDINATES } from "@/data/mapConstantData";
import { PIT_STOPS, PitStopId } from "@/data/pitStopConstantData";
import {
  ALBERT_PARK_CIRCUIT_GEOJSON,
} from "@/data/albertParkGeo";
import {
  computePedestrianRoute,
  createAccuracyCircleGeoJSON,
} from "@/lib/geo/geoEngine";
import { useTracksideLocation } from "@/lib/geo/useTracksideLocation";
import type { GeoPoint, PedestrianRoute } from "@/lib/geo/types";
import type { StationRecord } from "@/lib/types";

// Zero-key OpenFreeMap vector style URLs
export const VECTOR_STYLES = {
  positron: {
    id: "positron",
    name: "Light (Positron)",
    url: "https://tiles.openfreemap.org/styles/positron",
  },
  liberty: {
    id: "liberty",
    name: "Street (Liberty)",
    url: "https://tiles.openfreemap.org/styles/liberty",
  },
  dark: {
    id: "dark",
    name: "Dark",
    url: "https://tiles.openfreemap.org/styles/dark",
  },
} as const;

export type VectorStyleKey = keyof typeof VECTOR_STYLES;

// Dedicated Start/Finish line GeoJSON Feature
const START_FINISH_LINE_GEOJSON: Feature<LineString> = {
  type: "Feature",
  properties: {
    name: "Start / Finish Line",
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [144.96845, -37.84968],
      [144.96885, -37.84984],
    ],
  },
};

export interface PitStopMapProps {
  selectedPitStopId?: PitStopId | null;
  onSelectPitStop?: (id: PitStopId) => void;
  userPosition?: GeoPoint | null;
  route?: PedestrianRoute | null;
  stations?: StationRecord[];
  isCompact?: boolean;
  height?: number | string;
  className?: string;
  simulatedMode?: boolean;
  onSimulatedPositionChange?: (pos: GeoPoint) => void;
  onRequestLiveGps?: () => void;
  accuracyMeters?: number | null;
}

/**
 * Robust React Error Boundary fallback for WebGL/rendering exceptions.
 */
class MapErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("MapLibre caught runtime error, rendering offline fallback:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default function PitStopMap(props: PitStopMapProps) {
  const {
    selectedPitStopId = null,
    onSelectPitStop,
    userPosition,
    route,
    stations,
    height,
    className = "",
    simulatedMode,
    onSimulatedPositionChange,
    onRequestLiveGps,
    accuracyMeters,
  } = props;

  const [hasMapError, setHasMapError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeStyleKey, setActiveStyleKey] = useState<VectorStyleKey>("positron");
  const [showStyleMenu, setShowStyleMenu] = useState(false);

  const mapRef = useRef<MapRef | null>(null);

  // Hook into internal trackside location as fallback if parent does not supply positions
  const internalLocation = useTracksideLocation();

  // Position resolution
  const userPos = userPosition !== undefined ? userPosition : internalLocation.position;
  const isSimulated =
    simulatedMode !== undefined ? simulatedMode : internalLocation.mode === "simulated";
  const handleSetSimulated = onSimulatedPositionChange || internalLocation.setSimulatedPosition;
  const handleRequestLive = onRequestLiveGps || internalLocation.requestLiveGps;
  const activeAccuracy =
    accuracyMeters !== undefined && accuracyMeters !== null
      ? accuracyMeters
      : internalLocation.accuracyMeters || 10;

  // Validate WebGL capability and network connectivity on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const canvas = document.createElement("canvas");
        const hasWebGL = !!(
          window.WebGLRenderingContext &&
          (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
        );
        if (!hasWebGL) {
          // WebGL support is only known in the browser, after hydration.
          setHasMapError(true);
        }
      } catch {
        setHasMapError(true);
      }

      if (!navigator.onLine) {
        setHasMapError(true);
      }

      const handleOnline = () => setHasMapError(false);
      const handleOffline = () => setHasMapError(true);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  // Compute pedestrian walking route if not provided explicitly by parent
  const activeRoute: PedestrianRoute | null = useMemo(() => {
    if (route) return route;
    if (!userPos || !selectedPitStopId) return null;
    const targetPod = PIT_STOPS.find((p) => p.id === selectedPitStopId);
    if (!targetPod) return null;

    try {
      return computePedestrianRoute(userPos, {
        lat: targetPod.latitude,
        lng: targetPod.longitude,
      });
    } catch {
      return null;
    }
  }, [route, userPos, selectedPitStopId]);

  // Midpoint coordinate along route for floating ETA badge
  const routeMidpoint = useMemo(() => {
    if (!activeRoute?.coordinates || activeRoute.coordinates.length < 2) return null;
    const midIdx = Math.floor(activeRoute.coordinates.length / 2);
    const [lng, lat] = activeRoute.coordinates[midIdx];
    return { lat, lng };
  }, [activeRoute]);

  // Accuracy circle GeoJSON
  const accuracyCircleGeoJSON = useMemo(() => {
    if (!userPos) return null;
    try {
      return createAccuracyCircleGeoJSON(userPos, activeAccuracy);
    } catch {
      return null;
    }
  }, [userPos, activeAccuracy]);

  // Route LineString GeoJSON
  const routeLineGeoJSON: Feature<LineString> | null = useMemo(() => {
    if (!activeRoute?.coordinates || activeRoute.coordinates.length === 0) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: activeRoute.coordinates,
      },
    };
  }, [activeRoute]);

  // Pod status colors
  const getStatusColor = useCallback(
    (podId: string) => {
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
    },
    [stations]
  );

  const getQueueTime = useCallback(
    (podId: string) => {
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
    },
    [stations]
  );

  // Camera Actions
  const handleRecenter = useCallback(() => {
    mapRef.current?.flyTo({
      center: [ALBERT_PARK_COORDINATES.longitude, ALBERT_PARK_COORDINATES.latitude],
      zoom: ALBERT_PARK_COORDINATES.zoom,
      pitch: ALBERT_PARK_COORDINATES.pitch,
      bearing: ALBERT_PARK_COORDINATES.bearing,
      duration: 1200,
    });
  }, []);

  const handleLocateMe = useCallback(() => {
    if (userPos) {
      mapRef.current?.flyTo({
        center: [userPos.lng, userPos.lat],
        zoom: 16,
        duration: 1000,
      });
    } else {
      handleRequestLive();
    }
  }, [userPos, handleRequestLive]);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
    setTimeout(() => {
      mapRef.current?.resize();
    }, 320);
  }, []);

  // Offline or WebGL error fallback
  const fallbackComponent = (
    <OfflineCircuitMapFallback
      selectedPitStopId={selectedPitStopId}
      onSelectPitStop={onSelectPitStop}
      userPosition={userPos}
      route={activeRoute}
      stations={stations}
      isExpanded={isExpanded}
      onToggleExpand={handleToggleExpand}
      className={className}
    />
  );

  if (hasMapError) {
    return fallbackComponent;
  }

  return (
    <MapErrorBoundary fallback={fallbackComponent}>
      <div
        className={`relative w-full ${
          height ? "" : isExpanded ? "h-[480px]" : "h-[320px] max-h-full"
        } rounded-xl overflow-hidden border border-[var(--color-border)] select-none transition-all duration-300 ${className}`}
        style={height ? { height } : undefined}
      >
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={{
            longitude: ALBERT_PARK_COORDINATES.longitude,
            latitude: ALBERT_PARK_COORDINATES.latitude,
            zoom: ALBERT_PARK_COORDINATES.zoom,
            pitch: ALBERT_PARK_COORDINATES.pitch,
            bearing: ALBERT_PARK_COORDINATES.bearing,
          }}
          mapStyle={VECTOR_STYLES[activeStyleKey].url}
          style={{ width: "100%", height: "100%" }}
          onError={(e) => {
            console.warn("MapLibre vector tile error, falling back:", e);
            setHasMapError(true);
          }}
          onClick={(e) => {
            if (isSimulated && e.lngLat) {
              handleSetSimulated({
                lat: e.lngLat.lat,
                lng: e.lngLat.lng,
              });
            }
          }}
          cursor={isSimulated ? "crosshair" : undefined}
          attributionControl={false}
        >
          {/* 1. Albert Park Grand Prix Circuit: Outer Casing + Red Racing Line */}
          <Source id="circuit-source" type="geojson" data={ALBERT_PARK_CIRCUIT_GEOJSON}>
            <Layer
              id="circuit-outer-casing"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#1E2530",
                "line-width": 7,
                "line-opacity": 0.88,
              }}
            />
            <Layer
              id="circuit-racing-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#ffd100",
                "line-width": 3,
                "line-dasharray": [3, 2],
              }}
            />
          </Source>

          {/* 2. Start / Finish Line */}
          <Source id="start-finish-source" type="geojson" data={START_FINISH_LINE_GEOJSON}>
            <Layer
              id="start-finish-line"
              type="line"
              layout={{ "line-cap": "butt", "line-join": "miter" }}
              paint={{
                "line-color": "#FFFFFF",
                "line-width": 4,
                "line-dasharray": [1, 1],
              }}
            />
          </Source>

          {/* 3. GPS Accuracy Radius Circle Polygon */}
          {accuracyCircleGeoJSON && (
            <Source id="accuracy-radius-source" type="geojson" data={accuracyCircleGeoJSON}>
              <Layer
                id="accuracy-radius-fill"
                type="fill"
                paint={{
                  "fill-color": "#2F80FF",
                  "fill-opacity": 0.15,
                }}
              />
              <Layer
                id="accuracy-radius-outline"
                type="line"
                paint={{
                  "line-color": "#2F80FF",
                  "line-width": 1.5,
                  "line-opacity": 0.5,
                }}
              />
            </Source>
          )}

          {/* 4. Pedestrian Route Line (Animated / Dashed) */}
          {routeLineGeoJSON && (
            <Source id="route-line-source" type="geojson" data={routeLineGeoJSON}>
              <Layer
                id="route-line-casing"
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{
                  "line-color": "#2F80FF",
                  "line-width": 6,
                  "line-opacity": 0.35,
                }}
              />
              <Layer
                id="route-line-dashed"
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{
                  "line-color": "#2F80FF",
                  "line-width": 3.5,
                  "line-dasharray": [2, 2],
                }}
              />
            </Source>
          )}

          {/* 5. Midpoint Floating Route ETA Pill */}
          {routeMidpoint && activeRoute && (
            <Marker
              longitude={routeMidpoint.lng}
              latitude={routeMidpoint.lat}
              anchor="center"
            >
              <div className="bg-black/90 text-white border border-[#2F80FF]/70 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-xl backdrop-blur-md pointer-events-none whitespace-nowrap z-20">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2F80FF] animate-ping" />
                <span>
                  {activeRoute.distanceMeters}m • {activeRoute.walkMinutes} min walk
                </span>
              </div>
            </Marker>
          )}

          {/* 6. User Location GPS Pulsing Blue Beacon */}
          {userPos && (
            <Marker
              longitude={userPos.lng}
              latitude={userPos.lat}
              anchor="center"
            >
              <div className="relative flex items-center justify-center">
                <span className="absolute w-8 h-8 rounded-full bg-[#2F80FF] opacity-35 animate-ping pointer-events-none" />
                <span className="absolute w-5 h-5 rounded-full bg-[#2F80FF]/40 pointer-events-none" />
                <span className="relative w-3.5 h-3.5 rounded-full bg-[#2F80FF] border-2 border-white shadow-md" />
              </div>
            </Marker>
          )}

          {/* 7. Interactive Markers: M1-M4 with Status Color & Queue Pill */}
          {PIT_STOPS.map((stop) => {
            const isSelected = selectedPitStopId === stop.id;
            const statusColor = getStatusColor(stop.id);
            const queueTime = getQueueTime(stop.id);

            return (
              <Marker
                key={stop.id}
                longitude={stop.longitude}
                latitude={stop.latitude}
                anchor="center"
              >
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPitStop?.(stop.id);
                    }}
                    aria-label={`Select Pod ${stop.id}`}
                    aria-pressed={isSelected}
                    className={`flex items-center justify-center rounded-full transition-all duration-200 shadow-md ${
                      isSelected
                        ? "w-8 h-8 bg-[#ffd100] text-[#1d2125] ring-4 ring-[#ffd100]/40 font-black scale-110 z-30"
                        : "w-7 h-7 bg-[var(--color-surface)] border-2 text-[var(--color-text-primary)] hover:scale-105 z-10"
                    }`}
                    style={{
                      borderColor: isSelected ? undefined : statusColor,
                    }}
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

                  {/* Queue Pill */}
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
              </Marker>
            );
          })}
        </Map>

        {/* Top-Right Floating Control Bar */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 z-20">
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md p-1 rounded-lg border border-white/10 shadow-lg">
            {/* Style Switcher Toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStyleMenu((prev) => !prev)}
                className={`p-1.5 rounded-md transition-colors ${
                  showStyleMenu
                    ? "bg-white/20 text-white"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
                title="Switch Vector Style"
                aria-label="Switch Vector Style"
              >
                <Layers className="w-4 h-4" />
              </button>

              {showStyleMenu && (
                <div className="absolute top-full right-0 mt-1.5 w-36 bg-[#0c1017]/95 backdrop-blur-md rounded-lg border border-white/20 shadow-2xl py-1 text-xs z-30">
                  {(Object.keys(VECTOR_STYLES) as VectorStyleKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setActiveStyleKey(key);
                        setShowStyleMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors ${
                        activeStyleKey === key
                          ? "text-[#ffd100] font-bold bg-white/5"
                          : "text-white/80 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <span>{VECTOR_STYLES[key].name}</span>
                      {activeStyleKey === key && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ffd100]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Locate Me */}
            <button
              type="button"
              onClick={handleLocateMe}
              className="p-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title={userPos ? "Fly to My Location" : "Locate Me"}
              aria-label="Locate Me"
            >
              <Navigation className="w-4 h-4" />
            </button>

            {/* Recenter Circuit */}
            <button
              type="button"
              onClick={handleRecenter}
              className="p-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Recenter Albert Park Circuit"
              aria-label="Recenter Circuit"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Expand / Collapse */}
            <button
              type="button"
              onClick={handleToggleExpand}
              className="p-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title={isExpanded ? "Collapse Map" : "Expand Map"}
              aria-label={isExpanded ? "Collapse Map" : "Expand Map"}
            >
              {isExpanded ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Zoom +/- Floating Pill */}
          <div className="flex flex-col bg-black/60 backdrop-blur-md rounded-lg border border-white/10 shadow-lg overflow-hidden">
            <button
              type="button"
              onClick={() => mapRef.current?.zoomIn()}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors border-b border-white/10"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomOut()}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Indicator or Simulated Reposition Pill */}
        {isSimulated && (
          <div className="absolute bottom-2 left-2 bg-black/85 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-medium text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 shadow-md pointer-events-none z-20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Simulated GPS: Tap anywhere on map to reposition</span>
          </div>
        )}
      </div>
    </MapErrorBoundary>
  );
}
