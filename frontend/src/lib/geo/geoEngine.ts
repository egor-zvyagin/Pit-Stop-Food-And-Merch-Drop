/**
 * Geospatial calculation engine, pedestrian routing, and station ranking
 * for Albert Park Grand Prix Circuit.
 */

import type { Feature, Polygon } from 'geojson';
import type { GeoPoint, PedestrianRoute, RankedPitStop } from '@/lib/geo/types';
import type { PitStop } from '@/data/pitStopConstantData';
import { ALBERT_PARK_CENTER } from '@/data/albertParkGeo';

/**
 * Calculates the great-circle distance between two points in meters using the Haversine formula.
 */
export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000; // Earth radius in meters
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLng = Math.sin(dLng / 2);

  const h =
    sinHalfDLat * sinHalfDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfDLng * sinHalfDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

/**
 * Checks whether a given position falls within the Albert Park geofence boundary (default: 2.5 km radius).
 */
export function isWithinAlbertParkGeofence(
  pos: GeoPoint,
  radiusKm: number = 2.5
): boolean {
  const distanceMeters = haversineDistanceMeters(pos, ALBERT_PARK_CENTER);
  return distanceMeters <= radiusKm * 1000;
}

/**
 * 16-node undirected walkway graph wrapping the Albert Park Lake perimeter.
 * Guarantees that pedestrian navigation routes follow walkable banks and perimeter paths,
 * preventing straight-line trajectories that would cut across the lake body.
 */
export interface WalkwayNode {
  id: string;
  lat: number;
  lng: number;
  name: string;
}

export const WALKWAY_NODES: WalkwayNode[] = [
  { id: 'NW_TIP', lat: -37.8412, lng: 144.9660, name: 'North-West Lakeside' },
  { id: 'N_SHORE', lat: -37.8405, lng: 144.9680, name: 'North Shore Path' },
  { id: 'NE_TIP', lat: -37.8418, lng: 144.9705, name: 'North-East Lakeside' },
  { id: 'E_BANK_1', lat: -37.8432, lng: 144.9728, name: 'East Bank - Golf Course' },
  { id: 'E_BANK_2', lat: -37.8442, lng: 144.9746, name: 'East Bank - Pod M2 / Clark' },
  { id: 'E_BANK_3', lat: -37.8460, lng: 144.9748, name: 'East Bank - Mid' },
  { id: 'E_BANK_4', lat: -37.8480, lng: 144.9745, name: 'East Bank - South-Mid' },
  { id: 'E_BANK_5', lat: -37.8502, lng: 144.9738, name: 'East Bank - Turn 12' },
  { id: 'SE_TIP', lat: -37.8520, lng: 144.9730, name: 'South-East Lakeside' },
  { id: 'S_SHORE', lat: -37.8534, lng: 144.9718, name: 'South Shore - Pod M4 / GA' },
  { id: 'SW_TIP', lat: -37.8524, lng: 144.9702, name: 'South-West Lakeside' },
  { id: 'W_BANK_1', lat: -37.8510, lng: 144.9692, name: 'West Bank - South Straight' },
  { id: 'W_BANK_2', lat: -37.8496, lng: 144.9690, name: 'West Bank - Pod M1 / Pit Exit' },
  { id: 'W_BANK_3', lat: -37.8475, lng: 144.9675, name: 'West Bank - Paddock North' },
  { id: 'W_BANK_4', lat: -37.8450, lng: 144.9660, name: 'West Bank - Main Straight North' },
  { id: 'W_BANK_5', lat: -37.8415, lng: 144.9648, name: 'West Bank - Pod M3 / Turn 4' },
];

interface GraphEdge {
  to: string;
  weight: number;
}

// Build adjacency map for undirected perimeter ring graph
const adjacencyMap = new Map<string, GraphEdge[]>();

WALKWAY_NODES.forEach((node) => adjacencyMap.set(node.id, []));

for (let i = 0; i < WALKWAY_NODES.length; i++) {
  const current = WALKWAY_NODES[i];
  const next = WALKWAY_NODES[(i + 1) % WALKWAY_NODES.length];
  const prev = WALKWAY_NODES[(i - 1 + WALKWAY_NODES.length) % WALKWAY_NODES.length];

  const distToNext = haversineDistanceMeters(current, next);
  const distToPrev = haversineDistanceMeters(current, prev);

  adjacencyMap.get(current.id)?.push({ to: next.id, weight: distToNext });
  adjacencyMap.get(current.id)?.push({ to: prev.id, weight: distToPrev });
}

function findNearestWalkwayNode(point: GeoPoint): WalkwayNode {
  let nearest = WALKWAY_NODES[0];
  let minDistance = Infinity;

  for (const node of WALKWAY_NODES) {
    const dist = haversineDistanceMeters(point, node);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = node;
    }
  }

  return nearest;
}

function dijkstraShortestPath(
  startId: string,
  endId: string
): { pathNodeIds: string[]; graphDistanceMeters: number } {
  if (startId === endId) {
    return { pathNodeIds: [startId], graphDistanceMeters: 0 };
  }

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set<string>();

  WALKWAY_NODES.forEach((node) => {
    distances.set(node.id, Infinity);
    previous.set(node.id, null);
    unvisited.add(node.id);
  });

  distances.set(startId, 0);

  while (unvisited.size > 0) {
    let currentId: string | null = null;
    let minDistance = Infinity;

    unvisited.forEach((id) => {
      const d = distances.get(id)!;
      if (d < minDistance) {
        minDistance = d;
        currentId = id;
      }
    });

    if (!currentId || currentId === endId || minDistance === Infinity) {
      break;
    }

    unvisited.delete(currentId);

    const edges = adjacencyMap.get(currentId) || [];
    for (const edge of edges) {
      if (!unvisited.has(edge.to)) continue;

      const alt = distances.get(currentId)! + edge.weight;
      if (alt < distances.get(edge.to)!) {
        distances.set(edge.to, alt);
        previous.set(edge.to, currentId);
      }
    }
  }

  const pathNodeIds: string[] = [];
  let curr: string | null = endId;
  while (curr) {
    pathNodeIds.unshift(curr);
    curr = previous.get(curr) || null;
  }

  return {
    pathNodeIds,
    graphDistanceMeters: distances.get(endId) || 0,
  };
}

/**
 * Computes a realistic pedestrian route around Albert Park Lake perimeter paths.
 * Uses Dijkstra on the walkway graph to ensure routes never cut across water.
 * Computes walkMinutes = Math.max(1, Math.ceil(distanceMeters / 80)).
 */
export function computePedestrianRoute(
  from: GeoPoint,
  to: GeoPoint
): PedestrianRoute {
  const directDistance = haversineDistanceMeters(from, to);

  // If points are essentially at the same location (< 8m)
  if (directDistance < 8) {
    return {
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      distanceMeters: Math.round(directDistance),
      walkMinutes: 1,
      waypoints: ['Direct'],
    };
  }

  const startNode = findNearestWalkwayNode(from);
  const endNode = findNearestWalkwayNode(to);

  // If both from & to map to the exact same bank node and direct line is short (< 150m),
  // walk directly without detour
  if (startNode.id === endNode.id && directDistance < 150) {
    return {
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      distanceMeters: Math.round(directDistance),
      walkMinutes: Math.max(1, Math.ceil(directDistance / 80)),
      waypoints: [startNode.name],
    };
  }

  const { pathNodeIds } = dijkstraShortestPath(startNode.id, endNode.id);
  const nodeMap = new Map(WALKWAY_NODES.map((n) => [n.id, n]));

  // Assemble full coordinates GeoJSON LineString [lng, lat]
  const rawCoords: [number, number][] = [[from.lng, from.lat]];

  for (const id of pathNodeIds) {
    const node = nodeMap.get(id);
    if (node) {
      rawCoords.push([node.lng, node.lat]);
    }
  }

  rawCoords.push([to.lng, to.lat]);

  // Remove consecutive redundant points (< 2m apart)
  const coordinates: [number, number][] = [];
  for (let i = 0; i < rawCoords.length; i++) {
    if (i === 0) {
      coordinates.push(rawCoords[i]);
    } else {
      const prev = coordinates[coordinates.length - 1];
      const curr = rawCoords[i];
      const d = haversineDistanceMeters(
        { lat: prev[1], lng: prev[0] },
        { lat: curr[1], lng: curr[0] }
      );
      if (d >= 2) {
        coordinates.push(curr);
      }
    }
  }

  // Calculate actual traversed distance
  let totalMeters = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalMeters += haversineDistanceMeters(
      { lat: coordinates[i][1], lng: coordinates[i][0] },
      { lat: coordinates[i + 1][1], lng: coordinates[i + 1][0] }
    );
  }

  const distanceMeters = Math.round(totalMeters);
  const walkMinutes = Math.max(1, Math.ceil(distanceMeters / 80));
  const waypoints = pathNodeIds.map((id) => nodeMap.get(id)?.name || id);

  return {
    coordinates,
    distanceMeters,
    walkMinutes,
    waypoints,
  };
}

/**
 * Creates a GeoJSON Polygon representing a GPS accuracy circle around the given center point.
 */
export function createAccuracyCircleGeoJSON(
  center: GeoPoint,
  radiusMeters: number,
  steps: number = 64
): Feature<Polygon> {
  const coordinates: [number, number][] = [];
  const latRad = (center.lat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(latRad);

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(theta);
    const dy = radiusMeters * Math.sin(theta);
    const lng = center.lng + dx / metersPerDegLng;
    const lat = center.lat + dy / metersPerDegLat;
    coordinates.push([lng, lat]);
  }

  return {
    type: 'Feature',
    properties: {
      radiusMeters,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
}

function resolveStationQueueMinutes(station: PitStop): number {
  const rawAny = station as unknown as Record<string, unknown>;
  if (typeof rawAny.queueWaitMinutes === 'number') return rawAny.queueWaitMinutes;
  if (typeof rawAny.queueTimeMins === 'number') return rawAny.queueTimeMins;

  if (rawAny.variant === 'fastest' || rawAny.status === 'FASTEST') {
    return 2;
  }
  if (rawAny.variant === 'lowQueue' || rawAny.status === 'LOW QUEUE') {
    return 3;
  }
  if (rawAny.variant === 'heavyTraffic' || rawAny.status === 'HEAVY TRAFFIC') {
    return 15;
  }
  if (rawAny.status === 'MODERATE') {
    return 7;
  }
  return 4;
}

/**
 * Ranks pit stops by total time (walk minutes + queue wait minutes).
 * Flags the single minimum total time pod with isRecommendedFastest: true.
 * If userPos is null, defaults reference origin to Albert Park Center.
 */
export function rankStationsByTotalTime(
  userPos: GeoPoint | null,
  stations: readonly PitStop[] | PitStop[]
): RankedPitStop[] {
  const origin = userPos || ALBERT_PARK_CENTER;

  const rankedList: RankedPitStop[] = stations.map((station) => {
    const dest: GeoPoint = {
      lat: station.latitude,
      lng: station.longitude,
    };

    const route = computePedestrianRoute(origin, dest);
    const walkMinutes = route.walkMinutes;
    const queueWaitMinutes = resolveStationQueueMinutes(station);
    const totalMinutes = walkMinutes + queueWaitMinutes;

    return {
      ...station,
      distanceMeters: route.distanceMeters,
      walkMinutes,
      queueWaitMinutes,
      totalMinutes,
      isRecommendedFastest: false,
      route,
    };
  });

  // Sort ascending by totalMinutes
  rankedList.sort((a, b) => a.totalMinutes - b.totalMinutes);

  // Mark the fastest option
  if (rankedList.length > 0) {
    rankedList[0].isRecommendedFastest = true;
  }

  return rankedList;
}
