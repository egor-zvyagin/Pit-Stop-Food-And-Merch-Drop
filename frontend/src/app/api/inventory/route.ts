import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

// Always run on request: these responses are live data and must never be
// frozen into the build.
export const dynamic = 'force-dynamic';

const rateLimiter = createRateLimiter('standard');

export async function GET() {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/inventory', method: 'GET' });

  // Rate Limiting
  const limit = rateLimiter.consume();
  if (!limit.allowed && limit.response) {
    logger.log({ status: 429, error: 'Rate limit exceeded' });
    return limit.response;
  }

  try {
    const [items, circuitState] = await Promise.all([
      db.getItems(),
      db.getCircuitState(),
    ]);

    const inventory = items.map((item) => {
      const stock = item.stock ?? item.availableUnits ?? (item.category === 'food' ? 65 : 28);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        subCategory: item.subCategory,
        price: item.price,
        originalPrice: item.originalPrice,
        inStock: item.inStock !== false && stock > 0,
        availableUnits: stock,
        stock,
        isLimitedDrop: item.isLimitedDrop ?? false,
        prepTime: item.prepTime,
        tag: item.tag,
        image: item.image,
        popular: ['apex-burger', 'pitlane-pizza', 'craft-lager', 'gp-cap-2026'].includes(item.id),
        description: item.description,
        isAlcoholic: item.isAlcoholic ?? false,
      };
    });

    logger.log({ status: 200, dbOp: 'getItems+getCircuitState' });
    return NextResponse.json({
      success: true,
      count: inventory.length,
      timestamp: new Date().toISOString(),
      circuitStatus: circuitState.flag,
      circuitState,
      inventory,
      items: inventory,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to fetch inventory: ${message}` },
      { status: 500 }
    );
  }
}
