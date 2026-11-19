import { NextResponse } from 'next/server';
import { db, OrderRecord } from '@/lib/db/client';
import { validateVendorAuth } from '@/lib/auth/vendorAuth';
import { UpdateOrderStatusSchema } from '@/lib/validation/schemas';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

const rateLimiter = createRateLimiter('vendor');

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Order ID is required' },
      { status: 400 }
    );
  }

  // Lookup by ID or fallback to 4-digit PIN
  const order = (await db.getOrderById(id)) || (await db.getOrderByPin(id));

  if (!order) {
    return NextResponse.json(
      { success: false, error: `Order '${id}' not found` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      orderId: order.orderId,
      pinCode: order.pinCode,
      status: order.status,
      paymentStatus: order.paymentStatus || 'PENDING',
      station: {
        id: order.pickupStationId,
        name: order.pickupStationName,
        lockerNumber: order.counterNumber,
        walkTimeMins: order.walkTimeMins,
      },
      raceAlert: {
        active: true,
        condition: 'Track Session Active (Green Flag)',
        window: 'Optimal express pickup window open',
      },
      qrPayload: order.qrPayload,
      signatureBase64: order.signatureBase64,
      items: order.items,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      serviceFee: order.serviceFee,
      total: order.total,
      loyaltyPointsEarned: order.loyaltyPointsEarned,
      updatedAt: order.updatedAt,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: `/api/orders/${params?.id}/status`, method: 'PATCH' });

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

    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      // empty json body
    }

    const parsed = UpdateOrderStatusSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      logger.log({ status: 400, error: errorMsg });
      return NextResponse.json(
        { success: false, error: errorMsg, details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { status: targetStatus, pinCode: bodyPin } = parsed.data;

    // Verify order exists before updating
    const existing = (await db.getOrderById(id)) || (await db.getOrderByPin(id));
    if (!existing) {
      logger.log({ status: 404, error: `Order '${id}' not found` });
      return NextResponse.json(
        { success: false, error: `Order '${id}' not found` },
        { status: 404 }
      );
    }

    // Check X-Vendor-Pin authentication header
    const auth = validateVendorAuth(request);

    // If not authenticated with vendor PIN, check if this is a legitimate fan self-collection
    if (!auth.authenticated) {
      const clientPin =
        request.headers.get('x-order-pin') ||
        bodyPin ||
        '';

      const isFanSelfCollection =
        targetStatus === 'COMPLETED' &&
        (existing.status === 'READY_FOR_PICKUP' ||
          existing.status === 'COMPLETED' ||
          (clientPin && clientPin === existing.pinCode));

      if (!isFanSelfCollection) {
        logger.log({ status: 401, error: auth.error });
        return NextResponse.json(
          {
            success: false,
            error: auth.error || 'Unauthorized: Invalid or missing X-Vendor-Pin header',
          },
          { status: 401 }
        );
      }
    }

    // When status transitions to COMPLETED, auto-award loyalty points idempotently
    if (targetStatus === 'COMPLETED' && existing.status !== 'COMPLETED') {
      const pointsToAward =
        existing.loyaltyPointsEarned || Math.round(existing.total * 2);
      await db.awardTicketPoints(
        existing.ticketCode,
        pointsToAward,
        existing.orderId
      );
    }

    const updated = await db.updateOrderStatus(existing.orderId, targetStatus as OrderRecord['status']);
    logger.log({ status: 200, dbOp: 'updateOrderStatus' });

    return NextResponse.json({
      success: true,
      message: `Order status updated to ${targetStatus}`,
      order: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to update order status: ${message}` },
      { status: 500 }
    );
  }
}
