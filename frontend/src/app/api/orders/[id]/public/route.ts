import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { PublicOrderTracking } from '@/lib/types';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

// Always run on request: these responses are live data and must never be
// frozen into the build.
export const dynamic = 'force-dynamic';

const rateLimiter = createRateLimiter('standard');

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: `/api/orders/${params?.id}/public`, method: 'GET' });

  // Rate Limiting
  const limit = rateLimiter.consume();
  if (!limit.allowed && limit.response) {
    logger.log({ status: 429, error: 'Rate limit exceeded' });
    return limit.response;
  }

  try {
    const { id } = params;

    if (!id) {
      logger.log({ status: 400, error: 'Order ID is required' });
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      );
    }

    const order = (await db.getOrderById(id)) || (await db.getOrderByPin(id));

    if (!order) {
      logger.log({ status: 404, error: `Order '${id}' not found` });
      return NextResponse.json(
        { success: false, error: `Order '${id}' not found` },
        { status: 404 }
      );
    }

    // Zero-Secret Contract: Strictly strip qrPayload, signatureBase64, and pinCode
    const publicTracking: PublicOrderTracking = {
      orderId: order.orderId,
      status: order.status,
      pickupStationId: order.pickupStationId,
      pickupStationName: order.pickupStationName,
      counterNumber: order.counterNumber,
      walkTimeMins: order.walkTimeMins,
      isGroupOrder: Boolean(order.isGroupOrder),
      ...(order.seatNote ? { seatNote: order.seatNote } : {}),
      items: order.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    logger.log({ status: 200, dbOp: 'getOrderById-public' });
    return NextResponse.json({
      success: true,
      data: publicTracking,
      order: publicTracking,
      ...publicTracking,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to fetch public order tracker: ${message}` },
      { status: 500 }
    );
  }
}
