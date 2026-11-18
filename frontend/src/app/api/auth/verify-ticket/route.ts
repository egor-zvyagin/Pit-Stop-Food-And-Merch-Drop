import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export interface VerifyTicketRequest {
  ticketCode: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyTicketRequest;
    const { ticketCode } = body;

    if (!ticketCode) {
      return NextResponse.json(
        { success: false, error: 'Ticket code is required' },
        { status: 400 }
      );
    }

    const ticket = await db.getTicket(ticketCode);

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired Australian Grand Prix ticket reference' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: ticket,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Internal ticket verification error: ${message}` },
      { status: 500 }
    );
  }
}
