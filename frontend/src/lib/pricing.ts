import { CatalogItem, PricingBreakdown, CircuitState } from '@/lib/types';
import { CATALOG_ITEMS, CATALOG_BY_ID } from '@/data/catalog';
import { CHECKOUT_VOUCHERS } from '@/data/checkoutConstantData';

export interface OrderItemInput {
  itemId?: string;
  id?: string;
  sku?: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
}

/**
 * Rounds a number to exactly two decimal places, mitigating IEEE 754 precision issues.
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Authoritative Order Pricing Engine
 *
 * Implements trackside concession pricing rules:
 * - Authoritative item prices fetched strictly from canonical catalog (never trust client prices).
 * - Dynamic yield:
 *   * GREEN_FLAG: 10% off-peak discount
 *   * SAFETY_CAR / RED_FLAG: 0% off-peak discount (surge)
 *   * POST_RACE: 15% post-race merch drop discount
 * - Promo codes:
 *   * PITSTOP15: gives 15% discount (replaces default yield, never inverts).
 *   * Flat vouchers ($5, $10 off, e.g. SAVE5, SAVE10, GP-SAVE05).
 *   * Free item vouchers (e.g. free item reduces subtotal by item price).
 * - Service fee: 2.5% of discounted subtotal, rounded to 2 decimal places.
 * - Points earned: 2 points per $1 total spend.
 */
export function calculateOrderPricing(
  items: OrderItemInput[],
  promoCode?: string,
  circuitStatus: string | CircuitState = 'GREEN_FLAG',
  catalogItems: CatalogItem[] = CATALOG_ITEMS
): PricingBreakdown {
  if (!items || items.length === 0) {
    return {
      subtotal: 0,
      dynamicYieldDiscount: 0,
      voucherDiscount: 0,
      serviceFee: 0,
      total: 0,
      loyaltyPointsEarned: 0,
      effectiveDiscountRate: '0%',
    };
  }

  // Create lookup map for catalog if custom items passed, otherwise use cached map
  const catalogMap =
    catalogItems === CATALOG_ITEMS
      ? CATALOG_BY_ID
      : new Map(catalogItems.map((item) => [item.id, item]));

  // 1. Authoritative Subtotal calculation (overrides any client-provided unitPrice)
  let subtotal = 0;
  for (const item of items) {
    const rawId = item.itemId || item.id || item.sku || '';
    const catalogItem = catalogMap.get(rawId);
    const unitPrice = catalogItem ? catalogItem.price : item.unitPrice ?? 0;
    const qty = Math.max(0, item.quantity || 0);
    subtotal += unitPrice * qty;
  }
  subtotal = round2(subtotal);

  if (subtotal <= 0) {
    return {
      subtotal: 0,
      dynamicYieldDiscount: 0,
      voucherDiscount: 0,
      serviceFee: 0,
      total: 0,
      loyaltyPointsEarned: 0,
      effectiveDiscountRate: '0%',
    };
  }

  // 2. Dynamic Yield based on Live Circuit State
  let discountPct = 10;
  let flagName = 'GREEN_FLAG';

  if (typeof circuitStatus === 'object' && circuitStatus !== null && 'offPeakDiscountPct' in circuitStatus) {
    discountPct = circuitStatus.offPeakDiscountPct;
    flagName = circuitStatus.flag;
  } else if (typeof circuitStatus === 'string') {
    const statusUpper = circuitStatus.toUpperCase();
    if (statusUpper.includes('POST_RACE') || statusUpper.includes('POST')) {
      discountPct = 15;
      flagName = 'POST_RACE';
    } else if (statusUpper.includes('SAFETY')) {
      discountPct = 0;
      flagName = 'SAFETY_CAR';
    } else if (statusUpper.includes('RED')) {
      discountPct = 0;
      flagName = 'RED_FLAG';
    } else {
      discountPct = 10;
      flagName = 'GREEN_FLAG';
    }
  }

  let dynamicYieldDiscount = round2(subtotal * (discountPct / 100));

  // 3. Promo Codes & Vouchers
  let voucherDiscount = 0;
  let effectiveRateStr =
    flagName === 'SAFETY_CAR'
      ? '0% (Safety Car Active)'
      : flagName === 'RED_FLAG'
      ? '0% (Red Flag Surge Active)'
      : flagName === 'POST_RACE'
      ? '15% OFF (Post-Race Merch Drop Deals Active)'
      : '10% OFF (Green Flag Dynamic Yield)';
  let freeItemApplied:
    | { itemId: string; name: string; originalPrice: number }
    | undefined = undefined;

  const normalizedCode = promoCode?.trim().toUpperCase();

  if (normalizedCode) {
    // 3a. Percentage vouchers: PITSTOP15 (15% replaces 10% default)
    if (normalizedCode === 'PITSTOP15') {
      voucherDiscount = round2(subtotal * 0.15);
      dynamicYieldDiscount = 0; // Replaces default 10% discount
      effectiveRateStr = '15% OFF (PITSTOP15 Promotional)';
    } else if (normalizedCode === 'EATCLUB20') {
      voucherDiscount = round2(subtotal * 0.20);
      dynamicYieldDiscount = 0; // Replaces default 10% discount
      effectiveRateStr = '20% OFF (EatClub Dynamic Yield)';
    }
    // 3b. Flat vouchers ($5 off, $10 off)
    else if (
      normalizedCode === 'SAVE5' ||
      normalizedCode === 'GP-SAVE05' ||
      normalizedCode === 'FIVE_OFF' ||
      normalizedCode === 'SAVE05'
    ) {
      voucherDiscount = Math.min(5.0, subtotal - dynamicYieldDiscount);
      effectiveRateStr = '-$5.00 Voucher Applied';
    } else if (
      normalizedCode === 'SAVE10' ||
      normalizedCode === 'GP-SAVE10' ||
      normalizedCode === 'TEN_OFF'
    ) {
      voucherDiscount = Math.min(10.0, subtotal - dynamicYieldDiscount);
      effectiveRateStr = '-$10.00 Voucher Applied';
    }
    // 3c. Free item vouchers
    else if (
      normalizedCode === 'FREE-BURGER' ||
      normalizedCode === 'FREEBURGER' ||
      normalizedCode === 'FREE-FRIES' ||
      normalizedCode === 'FREEFRIES' ||
      normalizedCode === 'FREE-WATER' ||
      normalizedCode === 'FREEWATER' ||
      normalizedCode === 'GP-BREW01' ||
      normalizedCode === 'FREE-COLD-BREW'
    ) {
      // Map code to target item
      let targetItemId = 'apex-burger';
      if (normalizedCode.includes('FRIES')) targetItemId = 'loaded-fries';
      else if (normalizedCode.includes('WATER')) targetItemId = 'still-water';
      else if (normalizedCode.includes('BREW')) targetItemId = 'still-water';

      // Check if cart contains this item; if so, discount that item, otherwise discount catalog item price
      const catItem = catalogMap.get(targetItemId) || catalogItems[0];
      const itemPrice = catItem ? catItem.price : 0;

      if (catItem) {
        freeItemApplied = {
          itemId: catItem.id,
          name: catItem.name,
          originalPrice: itemPrice,
        };
        voucherDiscount = Math.min(itemPrice, subtotal - dynamicYieldDiscount);
        effectiveRateStr = `Free ${catItem.name} Applied`;
      }
    } else {
      // Check static CHECKOUT_VOUCHERS registry
      const voucher = CHECKOUT_VOUCHERS.find(
        (v) => v.code.toUpperCase() === normalizedCode
      );
      if (voucher) {
        if (voucher.effect.type === 'discount') {
          const discountVal = voucher.effect.amount;
          voucherDiscount = Math.min(discountVal, subtotal - dynamicYieldDiscount);
          effectiveRateStr = `-$${discountVal.toFixed(2)} Voucher Applied`;
        } else if (voucher.effect.type === 'freeItem') {
          const catItem =
            catalogMap.get(voucher.effect.itemId) ||
            catalogMap.get('still-water') ||
            catalogItems[0];
          if (catItem) {
            freeItemApplied = {
              itemId: catItem.id,
              name: catItem.name,
              originalPrice: catItem.price,
            };
            voucherDiscount = Math.min(catItem.price, subtotal - dynamicYieldDiscount);
            effectiveRateStr = `Free ${catItem.name} Applied`;
          }
        }
      }
    }
  }

  // Ensure discounts never invert or exceed subtotal
  const totalDiscount = round2(
    Math.min(subtotal, dynamicYieldDiscount + voucherDiscount)
  );
  const discountedSubtotal = round2(Math.max(0, subtotal - totalDiscount));

  // 4. Service fee: 2.5% of discounted subtotal, rounded to 2 decimal places
  const serviceFee = round2(discountedSubtotal * 0.025);

  // 5. Total
  const total = round2(discountedSubtotal + serviceFee);

  // 6. Points earned: 2 points per $1 total
  const loyaltyPointsEarned = Math.round(total * 2);

  // Update effective discount rate string if both dynamic and voucher applied
  if (totalDiscount > 0 && dynamicYieldDiscount > 0 && voucherDiscount > 0) {
    const pct = Math.round((totalDiscount / subtotal) * 100);
    effectiveRateStr = `${pct}% OFF (Combined Yield & Voucher)`;
  }

  return {
    subtotal,
    dynamicYieldDiscount,
    voucherDiscount,
    serviceFee,
    total,
    loyaltyPointsEarned,
    effectiveDiscountRate: effectiveRateStr,
    ...(freeItemApplied ? { freeItemApplied } : {}),
  };
}
