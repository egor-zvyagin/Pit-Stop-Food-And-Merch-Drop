import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { withoutOrderSecrets } from '@/lib/auth/orderAccess';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

// Always run on request: these responses are live data and must never be
// frozen into the build.
export const dynamic = 'force-dynamic';

const rateLimiter = createRateLimiter('standard');

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/orders/history', method: 'GET' });

  // Rate Limiting
  const limit = rateLimiter.consume(request);
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

    // A ticket code is printed on the ticket and is easy to guess, so the
    // history never includes collection PINs or signed passes.
    const orders = (await db.getOrdersByTicket(ticketCode)).map(withoutOrderSecrets);

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
