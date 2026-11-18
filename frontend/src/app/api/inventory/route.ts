import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET() {
  try {
    const items = await db.getItems();

    const inventory = items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      originalPrice: item.originalPrice,
      inStock: true,
      availableUnits: item.category === 'food' ? 65 : 28,
      prepTime: item.prepTime,
      tag: item.tag,
      image: item.image,
      popular: item.popular,
    }));

    return NextResponse.json({
      success: true,
      count: inventory.length,
      timestamp: new Date().toISOString(),
      circuitStatus: 'GREEN_FLAG',
      inventory,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to fetch inventory: ${message}` },
      { status: 500 }
    );
  }
}
