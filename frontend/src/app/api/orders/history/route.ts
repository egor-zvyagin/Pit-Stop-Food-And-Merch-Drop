import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

const rateLimiter = createRateLimiter('standard');

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/orders/history', method: 'GET' });

  // Rate Limiting
  const limit = rateLimiter.consume();
  if (!limit.allowed && limit.response) {
    logger.log({ status: 429, error: 'Rate limit exceeded' });
    return limit.response;
  }

  try {
    let ticketCode = 'GP-3820-X';
    try {
      const url = new URL(request.url);
      const queryTicket = url.searchParams.get('ticketCode');
      if (queryTicket && queryTicket.trim()) {
        ticketCode = queryTicket.trim();
      }
    } catch {
      ticketCode = 'GP-3820-X';
    }

    const orders = await db.getOrdersByTicket(ticketCode);

    logger.log({ status: 200, dbOp: 'getOrdersByTicket' });
    return NextResponse.json({
      success: true,
      ticketCode,
      count: orders.length,
      orders,
      data: orders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to fetch order history: ${message}` },
      { status: 500 }
    );
  }
}
