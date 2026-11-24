import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

// Always run on request: these responses are live data and must never be
// frozen into the build.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ticketCode = 'GP-3820-X', rewardId, voucherCode } = body;
    const targetReward = rewardId || voucherCode;

    if (!targetReward) {
      return NextResponse.json(
        { success: false, error: 'rewardId or voucherCode is required' },
        { status: 400 }
      );
    }

    const result = await db.redeemReward(ticketCode, targetReward);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Reward redeemed successfully',
      voucher: result.voucher,
      remainingPoints: result.remainingPoints,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to redeem reward: ${message}` },
      { status: 500 }
    );
  }
}
