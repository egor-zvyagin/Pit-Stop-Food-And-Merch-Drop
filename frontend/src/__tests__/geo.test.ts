import { describe, it, expect } from 'vitest';
import {
  ALBERT_PARK_CENTER,
  ALBERT_PARK_BBOX,
  CALIBRATED_PODS,
  GRANDSTAND_PRESETS,
  ALBERT_PARK_CIRCUIT_GEOJSON,
} from '@/data/albertParkGeo';
import { PIT_STOPS, PitStop } from '@/data/pitStopConstantData';
import { ALBERT_PARK_CORDINATES, DEMO_LOCATION } from '@/data/mapConstantData';
import {
  haversineDistanceMeters,
  isWithinAlbertParkGeofence,
  computePedestrianRoute,
  createAccuracyCircleGeoJSON,
  rankStationsByTotalTime,
  WALKWAY_NODES,
} from '@/lib/geo/geoEngine';
import type { GeoPoint } from '@/lib/geo/types';

describe('Albert Park Circuit Geospatial Data', () => {
  it('defines valid center point and bounding box', () => {
    expect(ALBERT_PARK_CENTER.lat).toBeCloseTo(-37.8465, 4);
    expect(ALBERT_PARK_CENTER.lng).toBeCloseTo(144.9695, 4);

    expect(ALBERT_PARK_BBOX[0][0]).toBeLessThan(ALBERT_PARK_BBOX[1][0]); // minLng < maxLng
    expect(ALBERT_PARK_BBOX[0][1]).toBeLessThan(ALBERT_PARK_BBOX[1][1]); // minLat < maxLat
  });

  it('calibrates all 4 pods on trackside paths', () => {
    expect(CALIBRATED_PODS.M1.lat).toBe(-37.8496);
    expect(CALIBRATED_PODS.M1.lng).toBe(144.9690);

    expect(CALIBRATED_PODS.M2.lat).toBe(-37.8442);
    expect(CALIBRATED_PODS.M2.lng).toBe(144.9746);

    expect(CALIBRATED_PODS.M3.lat).toBe(-37.8415);
    expect(CALIBRATED_PODS.M3.lng).toBe(144.9648);

    expect(CALIBRATED_PODS.M4.lat).toBe(-37.8534);
    expect(CALIBRATED_PODS.M4.lng).toBe(144.9718);

    // All pods must fall within geofence
    for (const pod of Object.values(CALIBRATED_PODS)) {
      expect(isWithinAlbertParkGeofence(pod)).toBe(true);
    }
  });

  it('exports accurate Grandstand Presets', () => {
    expect(GRANDSTAND_PRESETS.length).toBe(4);
    const ids = GRANDSTAND_PRESETS.map((p) => p.id);
    expect(ids).toContain('fangio');
    expect(ids).toContain('clark');
    expect(ids).toContain('brabham');
    expect(ids).toContain('albert-park-green');

    for (const preset of GRANDSTAND_PRESETS) {
      expect(isWithinAlbertParkGeofence(preset.position)).toBe(true);
      expect(preset.nearestGate).toBeDefined();
    }
  });

  it('accurately traces the 5.278 km Grand Prix circuit GeoJSON', () => {
    expect(ALBERT_PARK_CIRCUIT_GEOJSON.type).toBe('Feature');
    expect(ALBERT_PARK_CIRCUIT_GEOJSON.geometry.type).toBe('LineString');
    const coords = ALBERT_PARK_CIRCUIT_GEOJSON.geometry.coordinates;
    expect(coords.length).toBeGreaterThan(100);

    // Closed loop
    expect(coords[0][0]).toBeCloseTo(coords[coords.length - 1][0], 5);
    expect(coords[0][1]).toBeCloseTo(coords[coords.length - 1][1], 5);

    // Track length ~5278m (within 1% tolerance)
    let totalLen = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      totalLen += haversineDistanceMeters(
        { lat: coords[i][1], lng: coords[i][0] },
        { lat: coords[i + 1][1], lng: coords[i + 1][0] }
      );
    }
    expect(totalLen).toBeGreaterThan(5200);
    expect(totalLen).toBeLessThan(5350);
  });

  it('synchronizes PIT_STOPS coordinates with calibrated pod locations', () => {
    const m1 = PIT_STOPS.find((s) => s.id === 'M1')!;
    const m2 = PIT_STOPS.find((s) => s.id === 'M2')!;
    const m3 = PIT_STOPS.find((s) => s.id === 'M3')!;
    const m4 = PIT_STOPS.find((s) => s.id === 'M4')!;

    expect(m1.latitude).toBe(CALIBRATED_PODS.M1.lat);
    expect(m1.longitude).toBe(CALIBRATED_PODS.M1.lng);

    expect(m2.latitude).toBe(CALIBRATED_PODS.M2.lat);
    expect(m2.longitude).toBe(CALIBRATED_PODS.M2.lng);

    expect(m3.latitude).toBe(CALIBRATED_PODS.M3.lat);
    expect(m3.longitude).toBe(CALIBRATED_PODS.M3.lng);

    expect(m4.latitude).toBe(CALIBRATED_PODS.M4.lat);
    expect(m4.longitude).toBe(CALIBRATED_PODS.M4.lng);
  });

  it('synchronizes mapConstantData with calibrated circuit center', () => {
    expect(ALBERT_PARK_CORDINATES.latitude).toBe(ALBERT_PARK_CENTER.lat);
    expect(ALBERT_PARK_CORDINATES.longitude).toBe(ALBERT_PARK_CENTER.lng);
    expect(DEMO_LOCATION.latitude).toBeDefined();
    expect(DEMO_LOCATION.longitude).toBeDefined();
  });
});

describe('Geospatial Engine & Pedestrian Routing', () => {
  // ==========================================================================
  // haversineDistanceMeters against known landmarks
  // ==========================================================================
  describe('haversineDistanceMeters against known landmarks', () => {
    it('computes 0 meters for identical coordinates', () => {
      expect(haversineDistanceMeters(ALBERT_PARK_CENTER, ALBERT_PARK_CENTER)).toBe(0);
    });

    it('verifies Pit Straight to Turn 1 Apex distance within 2% tolerance of survey (~790m)', () => {
      const pitStraight: GeoPoint = { lat: -37.8498, lng: 144.9682 };
      const turn1Apex: GeoPoint = { lat: -37.8436, lng: 144.9638 };
      const distance = haversineDistanceMeters(pitStraight, turn1Apex);

      const expectedMeters = 790;
      const tolerance = expectedMeters * 0.02; // 2% tolerance
      expect(distance).toBeGreaterThanOrEqual(expectedMeters - tolerance);
      expect(distance).toBeLessThanOrEqual(expectedMeters + tolerance);
    });

    it('verifies Albert Park Lake North-to-South shore distance within 2% tolerance (~1473m)', () => {
      const northShore: GeoPoint = { lat: -37.8405, lng: 144.9680 };
      const southShore: GeoPoint = { lat: -37.8534, lng: 144.9718 };
      const distance = haversineDistanceMeters(northShore, southShore);

      const expectedMeters = 1473;
      const tolerance = expectedMeters * 0.02;
      expect(distance).toBeGreaterThanOrEqual(expectedMeters - tolerance);
      expect(distance).toBeLessThanOrEqual(expectedMeters + tolerance);
    });

    it('verifies Albert Park Center to Melbourne Town Hall (CBD) within 2% tolerance (~3490m)', () => {
      const melbCBD: GeoPoint = { lat: -37.8152, lng: 144.9666 };
      const distance = haversineDistanceMeters(ALBERT_PARK_CENTER, melbCBD);

      const expectedMeters = 3490;
      const tolerance = expectedMeters * 0.02;
      expect(distance).toBeGreaterThanOrEqual(expectedMeters - tolerance);
      expect(distance).toBeLessThanOrEqual(expectedMeters + tolerance);
    });

    it('verifies Albert Park Center to Sydney Opera House distance within 2% tolerance (~716.4 km)', () => {
      const sydneyOperaHouse: GeoPoint = { lat: -33.8568, lng: 151.2153 };
      const distance = haversineDistanceMeters(ALBERT_PARK_CENTER, sydneyOperaHouse);

      const expectedMeters = 716416;
      const tolerance = expectedMeters * 0.02;
      expect(distance).toBeGreaterThanOrEqual(expectedMeters - tolerance);
      expect(distance).toBeLessThanOrEqual(expectedMeters + tolerance);
    });
  });

  // ==========================================================================
  // isWithinAlbertParkGeofence
  // ==========================================================================
  describe('isWithinAlbertParkGeofence', () => {
    it('returns true for locations inside Albert Park Circuit boundary', () => {
      expect(isWithinAlbertParkGeofence(ALBERT_PARK_CENTER)).toBe(true);
      expect(isWithinAlbertParkGeofence(CALIBRATED_PODS.M1)).toBe(true);
      expect(isWithinAlbertParkGeofence(CALIBRATED_PODS.M2)).toBe(true);
      expect(isWithinAlbertParkGeofence(CALIBRATED_PODS.M3)).toBe(true);
      expect(isWithinAlbertParkGeofence(CALIBRATED_PODS.M4)).toBe(true);

      for (const preset of GRANDSTAND_PRESETS) {
        expect(isWithinAlbertParkGeofence(preset.position)).toBe(true);
      }
    });

    it('returns false for Melbourne CBD and North Melbourne (~3.5km to 5.6km away)', () => {
      // Melbourne CBD (Flinders St Station ~3.2km away)
      const flindersSt: GeoPoint = { lat: -37.8180, lng: 144.9671 };
      expect(isWithinAlbertParkGeofence(flindersSt)).toBe(false);

      // Melbourne Town Hall (~3.5km away)
      const melbTownHall: GeoPoint = { lat: -37.8152, lng: 144.9666 };
      expect(isWithinAlbertParkGeofence(melbTownHall)).toBe(false);

      // North Melbourne (~5.6km away)
      const northMelbourne: GeoPoint = { lat: -37.8000, lng: 144.9450 };
      expect(isWithinAlbertParkGeofence(northMelbourne)).toBe(false);

      // Custom radius override
      expect(isWithinAlbertParkGeofence(flindersSt, 5.0)).toBe(true);
      expect(isWithinAlbertParkGeofence(flindersSt, 2.5)).toBe(false);
    });

    it('returns false for Sydney Opera House (~716 km away)', () => {
      const sydneyOpera: GeoPoint = { lat: -33.8568, lng: 151.2153 };
      expect(isWithinAlbertParkGeofence(sydneyOpera)).toBe(false);
      expect(isWithinAlbertParkGeofence(sydneyOpera, 10.0)).toBe(false);
    });
  });

  it('defines 16 walkway nodes around the lake perimeter', () => {
    expect(WALKWAY_NODES.length).toBe(16);
    for (const node of WALKWAY_NODES) {
      expect(isWithinAlbertParkGeofence(node)).toBe(true);
      expect(node.name).toBeDefined();
    }
  });

  // ==========================================================================
  // computePedestrianRoute across opposite sides of Albert Park Lake
  // ==========================================================================
  describe('computePedestrianRoute across opposite sides of Albert Park Lake', () => {
    it('computes pedestrian route across opposite sides of Albert Park Lake (M3 to M2)', () => {
      const m3: GeoPoint = { lat: CALIBRATED_PODS.M3.lat, lng: CALIBRATED_PODS.M3.lng };
      const m2: GeoPoint = { lat: CALIBRATED_PODS.M2.lat, lng: CALIBRATED_PODS.M2.lng };

      const directHaversine = haversineDistanceMeters(m3, m2);
      const route = computePedestrianRoute(m3, m2);

      // 1. Assert route has >= 3 coordinates
      expect(route.coordinates.length).toBeGreaterThanOrEqual(3);

      // 2. Assert route distance > straight-line Haversine (navigating around the lake)
      expect(route.distanceMeters).toBeGreaterThan(directHaversine);

      // 3. Assert route avoids lake center: all coordinates remain on walkable perimeter
      for (const [lng, lat] of route.coordinates) {
        const distToLakeCenter = haversineDistanceMeters({ lat, lng }, ALBERT_PARK_CENTER);
        expect(distToLakeCenter).toBeGreaterThanOrEqual(400);
      }

      // 4. Assert realistic walking pace
      expect(route.walkMinutes).toBe(Math.max(1, Math.ceil(route.distanceMeters / 80)));
      expect(route.waypoints.length).toBeGreaterThanOrEqual(2);
      expect(route.waypoints).toContain('East Bank - Pod M2 / Clark');
    });

    it('computes pedestrian route from South Shore to West Bank (M4 to M3)', () => {
      const m4: GeoPoint = { lat: CALIBRATED_PODS.M4.lat, lng: CALIBRATED_PODS.M4.lng };
      const m3: GeoPoint = { lat: CALIBRATED_PODS.M3.lat, lng: CALIBRATED_PODS.M3.lng };

      const directHaversine = haversineDistanceMeters(m4, m3);
      const route = computePedestrianRoute(m4, m3);

      expect(route.coordinates.length).toBeGreaterThanOrEqual(3);
      expect(route.distanceMeters).toBeGreaterThan(directHaversine);

      // Verify intermediate waypoints follow bank nodes
      expect(route.waypoints).toContain('South Shore - Pod M4 / GA');
      expect(route.waypoints).toContain('West Bank - Pod M3 / Turn 4');

      // Assert none of the points penetrate the lake center
      for (const [lng, lat] of route.coordinates) {
        const distToCenter = haversineDistanceMeters({ lat, lng }, ALBERT_PARK_CENTER);
        expect(distToCenter).toBeGreaterThanOrEqual(200);
      }
    });

    it('computes pedestrian route from M1 (west bank) to M2 (east bank)', () => {
      const route = computePedestrianRoute(CALIBRATED_PODS.M1, CALIBRATED_PODS.M2);
      expect(route.coordinates.length).toBeGreaterThanOrEqual(3);
      expect(route.distanceMeters).toBeGreaterThan(haversineDistanceMeters(CALIBRATED_PODS.M1, CALIBRATED_PODS.M2));
      expect(route.walkMinutes).toBe(Math.max(1, Math.ceil(route.distanceMeters / 80)));
    });

    it('handles short direct walk between adjacent points cleanly (< 8m)', () => {
      const p1: GeoPoint = { lat: -37.84960, lng: 144.96900 };
      const p2: GeoPoint = { lat: -37.84962, lng: 144.96902 };

      const route = computePedestrianRoute(p1, p2);
      expect(route.coordinates.length).toBe(2);
      expect(route.walkMinutes).toBe(1);
      expect(route.waypoints).toEqual(['Direct']);
    });
  });

  // ==========================================================================
  // createAccuracyCircleGeoJSON
  // ==========================================================================
  describe('createAccuracyCircleGeoJSON', () => {
    it('produces a valid GeoJSON Feature<Polygon> with closed coordinates (first point === last point)', () => {
      const circle = createAccuracyCircleGeoJSON(ALBERT_PARK_CENTER, 35, 32);
      expect(circle.type).toBe('Feature');
      expect(circle.properties?.radiusMeters).toBe(35);
      expect(circle.geometry.type).toBe('Polygon');

      const ring = circle.geometry.coordinates[0];
      expect(ring.length).toBe(33); // 32 steps + 1 closing coordinate

      // First point === last point
      expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 6);
      expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 6);

      // Verify valid coordinates within Melbourne WGS84 range
      for (const coord of ring) {
        expect(coord.length).toBe(2);
        const [lng, lat] = coord;
        expect(lng).toBeGreaterThan(144.9);
        expect(lng).toBeLessThan(145.0);
        expect(lat).toBeGreaterThan(-37.9);
        expect(lat).toBeLessThan(-37.8);
      }
    });
  });

  // ==========================================================================
  // rankStationsByTotalTime
  // ==========================================================================
  describe('rankStationsByTotalTime', () => {
    it('verifies that a station further away with 2-min queue beats a closer station with a 15-min heavy traffic queue', () => {
      // User is located right next to Pod M3 (Turn 4 / Lakeside Dr)
      const userPos: GeoPoint = {
        lat: CALIBRATED_PODS.M3.lat,
        lng: CALIBRATED_PODS.M3.lng,
      };

      // M3 has 15-min heavy traffic queue (walk: 1 min + queue: 15 mins = 16 mins)
      // M2 is ~1014m away (13 min walk) with 2-min fastest queue (walk: 13 mins + queue: 2 mins = 15 mins)
      const ranked = rankStationsByTotalTime(userPos, PIT_STOPS);

      expect(ranked.length).toBe(PIT_STOPS.length);

      // M2 must beat M3
      expect(ranked[0].id).toBe('M2');
      expect(ranked[0].isRecommendedFastest).toBe(true);

      const m3Ranked = ranked.find((s) => s.id === 'M3')!;
      expect(m3Ranked.queueWaitMinutes).toBe(15);
      expect(m3Ranked.totalMinutes).toBe(16);

      const m2Ranked = ranked.find((s) => s.id === 'M2')!;
      expect(m2Ranked.queueWaitMinutes).toBe(2);
      expect(m2Ranked.totalMinutes).toBe(15);

      expect(m2Ranked.totalMinutes).toBeLessThan(m3Ranked.totalMinutes);

      // Verify that every subsequent station has totalMinutes >= preceding station
      for (let i = 0; i < ranked.length - 1; i++) {
        expect(ranked[i].totalMinutes).toBeLessThanOrEqual(ranked[i + 1].totalMinutes);
      }
    });

    it('correctly calculates totalMinutes as walkMinutes + queueWaitMinutes on arbitrary stations', () => {
      const userPos: GeoPoint = { lat: -37.8496, lng: 144.9690 }; // At M1

      const testStations: PitStop[] = [
        {
          id: 'M1',
          name: 'Close Busy Station',
          label: 'Close',
          area: 'Test',
          walkMins: 1,
          queueMins: 15,
          distance: '50m',
          status: 'HEAVY TRAFFIC',
          variant: 'heavyTraffic',
          latitude: -37.8496,
          longitude: 144.9690,
        },
        {
          id: 'M2',
          name: 'Far Empty Station',
          label: 'Far',
          area: 'Test',
          walkMins: 4,
          queueMins: 1,
          distance: '300m',
          status: 'FASTEST',
          variant: 'fastest',
          latitude: -37.8442,
          longitude: 144.9746,
        },
      ];

      const ranked = rankStationsByTotalTime(userPos, testStations);

      const closeStation = ranked.find((s) => s.id === 'M1')!;
      expect(closeStation.queueWaitMinutes).toBe(15);
      expect(closeStation.totalMinutes).toBe(closeStation.walkMinutes + 15);

      const farStation = ranked.find((s) => s.id === 'M2')!;
      expect(farStation.queueWaitMinutes).toBe(2);
      expect(farStation.totalMinutes).toBe(farStation.walkMinutes + 2);

      const expectedFastestId = closeStation.totalMinutes <= farStation.totalMinutes ? 'M1' : 'M2';
      expect(ranked[0].id).toBe(expectedFastestId);
      expect(ranked[0].isRecommendedFastest).toBe(true);
      expect(ranked[1].isRecommendedFastest).toBe(false);
    });

    it('ranks stations properly for Fangio Grandstand position', () => {
      const userPos = GRANDSTAND_PRESETS.find((p) => p.id === 'fangio')!.position;
      const ranked = rankStationsByTotalTime(userPos, PIT_STOPS);

      expect(ranked.length).toBe(PIT_STOPS.length);
      const fastestList = ranked.filter((r) => r.isRecommendedFastest);
      expect(fastestList.length).toBe(1);
      expect(fastestList[0].id).toBe(ranked[0].id);

      for (const r of ranked) {
        expect(r.route).toBeDefined();
        expect(r.route.coordinates.length).toBeGreaterThanOrEqual(2);
        expect(r.totalMinutes).toBe(r.walkMinutes + r.queueWaitMinutes);
      }
    });

    it('handles null userPos gracefully in rankStationsByTotalTime', () => {
      const ranked = rankStationsByTotalTime(null, PIT_STOPS);
      expect(ranked.length).toBe(4);
      expect(ranked[0].isRecommendedFastest).toBe(true);
      expect(ranked[0].totalMinutes).toBeGreaterThan(0);
    });
  });
});
