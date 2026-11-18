import { NextResponse } from 'next/server';
import { db, OrderRecord } from '@/lib/db/client';
import { validateVendorAuth } from '@/lib/auth/vendorAuth';

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
  try {
    const { id } = params;

    // Check X-Vendor-Pin authentication header
    const auth = validateVendorAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error || 'Unauthorized: Invalid or missing X-Vendor-Pin header',
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as { status: OrderRecord['status'] };

    if (!id || !body.status) {
      return NextResponse.json(
        { success: false, error: 'Order ID and new status are required' },
        { status: 400 }
      );
    }

    const normalizedStatus =
      (body.status as string) === 'COLLECTED'
        ? ('COMPLETED' as OrderRecord['status'])
        : body.status;

    const validStatuses: OrderRecord['status'][] = [
      'RECEIVED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'COMPLETED',
    ];

    if (!validStatuses.includes(normalizedStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status '${body.status}'. Must be one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Verify order exists before updating
    const existing = (await db.getOrderById(id)) || (await db.getOrderByPin(id));
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Order '${id}' not found` },
        { status: 404 }
      );
    }

    // When status transitions to COMPLETED, auto-award loyalty points idempotently
    if (normalizedStatus === 'COMPLETED' && existing.status !== 'COMPLETED') {
      const pointsToAward =
        existing.loyaltyPointsEarned || Math.round(existing.total * 2);
      await db.awardTicketPoints(
        existing.ticketCode,
        pointsToAward,
        existing.orderId
      );
    }

    const updated = await db.updateOrderStatus(existing.orderId, normalizedStatus);

    return NextResponse.json({
      success: true,
      message: `Order status updated to ${body.status}`,
      order: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to update order status: ${message}` },
      { status: 500 }
    );
  }
}
