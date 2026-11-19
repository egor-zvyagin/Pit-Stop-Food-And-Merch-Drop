import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

const rateLimiter = createRateLimiter('standard');

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/stations/capacity', method: 'GET' });

  // Rate Limiting
  const limit = rateLimiter.consume();
  if (!limit.allowed && limit.response) {
    logger.log({ status: 429, error: 'Rate limit exceeded' });
    return limit.response;
  }

  try {
    let stationId: string | null = null;
    try {
      const { searchParams } = new URL(request.url);
      stationId = searchParams.get('stationId');
    } catch {
      stationId = null;
    }

    const [stations, circuitState] = await Promise.all([
      db.getStations(),
      db.getCircuitState(),
    ]);

    const multiplier = circuitState.queueMultiplier || 1.0;

    // Dynamically adjust station capacity and queue based on circuit surge multiplier
    const adjustedStations = stations.map((s) => ({
      ...s,
      queueTimeMins: Math.max(1, Math.round(s.queueTimeMins * multiplier)),
      capacityPercent: Math.min(100, Math.round(s.capacityPercent * multiplier)),
    }));

    if (stationId) {
      const matched = adjustedStations.find((s) => s.id === stationId);
      if (!matched) {
        logger.log({ status: 404, error: `Station '${stationId}' not found` });
        return NextResponse.json(
          { success: false, error: `Station '${stationId}' not found` },
          { status: 404 }
        );
      }
      logger.log({ status: 200, dbOp: 'getStation' });
      return NextResponse.json({
        success: true,
        station: matched,
        circuitSession: circuitState.message,
        circuitFlag: circuitState.flag,
        circuitState,
        timestamp: new Date().toISOString(),
      });
    }

    logger.log({ status: 200, dbOp: 'getStations' });
    return NextResponse.json({
      success: true,
      totalStations: adjustedStations.length,
      circuitSession: circuitState.message,
      circuitFlag: circuitState.flag,
      circuitState,
      timestamp: new Date().toISOString(),
      stations: adjustedStations,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to fetch stations: ${message}` },
      { status: 500 }
    );
  }
}
