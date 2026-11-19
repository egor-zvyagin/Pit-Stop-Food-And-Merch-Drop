/**
 * Canonical geospatial and pedestrian routing types for Pit Stop v2.1.
 */

import type { PitStop } from '@/data/pitStopConstantData';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type GpsMode =
  | 'idle'
  | 'locating'
  | 'live_trackside'
  | 'live_offsite'
  | 'simulated'
  | 'denied'
  | 'unavailable';

export interface TracksideLocationState {
  position: GeoPoint | null;
  rawGpsPosition: GeoPoint | null;
  accuracyMeters: number | null;
  heading: number | null;
  mode: GpsMode;
  distanceToCircuitKm: number | null;
  activePresetId: string | null;
  error: string | null;
}

export interface PedestrianRoute {
  coordinates: [number, number][]; // [lng, lat] GeoJSON coordinates format
  distanceMeters: number;
  walkMinutes: number;
  waypoints: string[];
}

export type RankedPitStop = PitStop & {
  distanceMeters: number;
  walkMinutes: number;
  queueWaitMinutes: number;
  totalMinutes: number;
  isRecommendedFastest: boolean;
  route: PedestrianRoute;
};

export interface GrandstandPreset {
  id: string;
  name: string;
  turnLabel: string;
  position: GeoPoint;
  nearestGate: string;
}
