import { NextResponse } from 'next/server';
import { db, OrderRecord } from '@/lib/db/client';
import { validateVendorAuth } from '@/lib/auth/vendorAuth';
import { isVendorRequest, resolveOrderAccess } from '@/lib/auth/orderAccess';
import { UpdateOrderStatusSchema } from '@/lib/validation/schemas';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

// Always run on request: these responses are live data and must never be
// frozen into the build.
export const dynamic = 'force-dynamic';

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

  // Looking an order up by its 4-digit PIN is a kiosk feature. Offered to the
  // public it would let anyone walk all 10,000 PINs and list every order.
  const vendor = isVendorRequest(request);
  const order = (await db.getOrderById(id)) || (vendor ? await db.getOrderByPin(id) : undefined);

  if (!order) {
    return NextResponse.json(
      { success: false, error: `Order '${id}' not found` },
      { status: 404 }
    );
  }

  const access = resolveOrderAccess(request, order);
  const circuit = await db.getCircuitState();

  // What anyone holding the order ID may see: enough to follow progress.
  const publicView = {
    orderId: order.orderId,
    status: order.status,
    station: {
      id: order.pickupStationId,
      name: order.pickupStationName,
      lockerNumber: order.counterNumber,
      walkTimeMins: order.walkTimeMins,
    },
    raceAlert: {
      active: circuit.flag !== 'GREEN_FLAG',
      flag: circuit.flag,
      condition: circuit.message,
    },
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity })),
    updatedAt: order.updatedAt,
  };

  if (access === 'public') {
    return NextResponse.json({ success: true, access, data: publicView });
  }

  // The order's owner (collection PIN) or staff (vendor PIN) get the rest.
  return NextResponse.json({
    success: true,
    access,
    data: {
      ...publicView,
      pinCode: order.pinCode,
      paymentStatus: order.paymentStatus || 'PENDING',
      qrPayload: order.qrPayload,
      signatureBase64: order.signatureBase64,
      items: order.items,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      serviceFee: order.serviceFee,
      total: order.total,
      loyaltyPointsEarned: order.loyaltyPointsEarned,
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

    // Check X-Vendor-Pin authentication header
    const auth = validateVendorAuth(request);

    // Verify order exists before updating. Only staff may address an order by
    // its PIN; everyone else must name the order ID.
    const existing =
      (await db.getOrderById(id)) || (auth.authenticated ? await db.getOrderByPin(id) : undefined);
    if (!existing) {
      logger.log({ status: 404, error: `Order '${id}' not found` });
      return NextResponse.json(
        { success: false, error: `Order '${id}' not found` },
        { status: 404 }
      );
    }

    // Without the staff PIN, the only change allowed is a fan collecting their
    // own order, proven by that order's collection PIN.
    if (!auth.authenticated) {
      const isFanSelfCollection =
        targetStatus === 'COMPLETED' &&
        resolveOrderAccess(request, existing, bodyPin) === 'owner';

      if (!isFanSelfCollection) {
        logger.log({ status: 401, error: auth.error });
        return NextResponse.json(
          {
            success: false,
            error: auth.misconfigured
              ? auth.error
              : 'Unauthorized: a valid staff PIN, or this order\'s collection PIN, is required',
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
