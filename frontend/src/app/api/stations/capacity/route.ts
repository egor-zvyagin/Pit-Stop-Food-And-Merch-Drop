import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const stations = await db.getStations();

    if (stationId) {
      const matched = stations.find((s) => s.id === stationId);
      if (!matched) {
        return NextResponse.json(
          { success: false, error: `Station '${stationId}' not found` },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        station: matched,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      totalStations: stations.length,
      circuitSession: 'Track Session Active (Green Flag)',
      timestamp: new Date().toISOString(),
      stations,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to fetch stations: ${message}` },
      { status: 500 }
    );
  }
}
