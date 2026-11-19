import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { VerifyTicketSchema } from '@/lib/validation/schemas';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

const rateLimiter = createRateLimiter('standard');

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/auth/verify-ticket', method: 'POST' });

  // Rate Limiting
  const limit = rateLimiter.consume();
  if (!limit.allowed && limit.response) {
    logger.log({ status: 429, error: 'Rate limit exceeded' });
    return limit.response;
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      logger.log({ status: 400, error: 'Invalid JSON request body' });
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parsed = VerifyTicketSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      logger.log({ status: 400, error: errorMsg });
      return NextResponse.json(
        { success: false, error: errorMsg, details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { ticketCode } = parsed.data;
    const ticket = await db.getTicket(ticketCode);

    if (!ticket) {
      logger.log({ status: 404, error: 'Ticket reference not found' });
      return NextResponse.json(
        { success: false, error: 'Invalid or expired Australian Grand Prix ticket reference' },
        { status: 404 }
      );
    }

    logger.log({ status: 200, dbOp: 'getTicket' });
    return NextResponse.json({
      success: true,
      data: ticket,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Internal ticket verification error: ${message}` },
      { status: 500 }
    );
  }
}
