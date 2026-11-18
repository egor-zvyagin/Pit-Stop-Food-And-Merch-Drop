import { describe, it, expect } from 'vitest';
import { calculateOrderPricing, round2 } from '@/lib/pricing';

describe('Authoritative Pricing Engine (calculateOrderPricing)', () => {
  it('calculates correct subtotal from canonical catalog prices', () => {
    const items = [
      { itemId: 'apex-burger', quantity: 2 }, // 2 * $16.50 = $33.00
      { itemId: 'craft-lager', quantity: 1 },  // 1 * $36.00 = $36.00
    ];

    const pricing = calculateOrderPricing(items);
    expect(pricing.subtotal).toBe(69.0);
  });

  it('applies 10% off-peak Green Flag dynamic yield discount by default', () => {
    const items = [
      { itemId: 'apex-burger', quantity: 2 }, // $33.00
      { itemId: 'craft-lager', quantity: 1 },  // $36.00 -> subtotal $69.00
    ];

    const pricing = calculateOrderPricing(items, undefined, 'GREEN_FLAG');
    expect(pricing.subtotal).toBe(69.0);
    // 10% of 69.00 is $6.90
    expect(pricing.dynamicYieldDiscount).toBe(6.9);
    expect(pricing.voucherDiscount).toBe(0);

    const discountedSubtotal = 69.0 - 6.9; // 62.10
    expect(discountedSubtotal).toBe(62.1);
    // 2.5% service fee on 62.10 = 1.5525 -> rounded to 1.55
    expect(pricing.serviceFee).toBe(1.55);
    // Total = 62.10 + 1.55 = 63.65
    expect(pricing.total).toBe(63.65);
    // Loyalty points = Math.round(63.65 * 2) = 127 points
    expect(pricing.loyaltyPointsEarned).toBe(127);
  });

  it('does not apply 10% dynamic yield discount when circuit condition is SAFETY_CAR', () => {
    const items = [{ itemId: 'apex-burger', quantity: 2 }]; // $33.00
    const pricing = calculateOrderPricing(items, undefined, 'SAFETY_CAR');

    expect(pricing.dynamicYieldDiscount).toBe(0);
    expect(pricing.subtotal).toBe(33.0);
    // 2.5% service fee on $33.00 = $0.825 -> rounded to 0.83
    expect(pricing.serviceFee).toBe(0.83);
    expect(pricing.total).toBe(33.83);
  });

  it('applies 15% PITSTOP15 voucher replacing default 10% dynamic yield', () => {
    const items = [
      { itemId: 'apex-burger', quantity: 2 }, // $33.00
      { itemId: 'craft-lager', quantity: 1 },  // $36.00 -> subtotal $69.00
    ];

    const pricing = calculateOrderPricing(items, 'PITSTOP15', 'GREEN_FLAG');
    expect(pricing.subtotal).toBe(69.0);
    expect(pricing.dynamicYieldDiscount).toBe(0); // Replaced by voucher
    // 15% of $69.00 is $10.35
    expect(pricing.voucherDiscount).toBe(10.35);

    const discountedSubtotal = 69.0 - 10.35; // 58.65
    expect(discountedSubtotal).toBe(58.65);
    // 2.5% service fee on 58.65 = 1.46625 -> rounded to 1.47
    expect(pricing.serviceFee).toBe(1.47);
    // Total = 58.65 + 1.47 = 60.12
    expect(pricing.total).toBe(60.12);
    expect(pricing.loyaltyPointsEarned).toBe(Math.round(60.12 * 2));
    expect(pricing.effectiveDiscountRate).toContain('15% OFF (PITSTOP15 Promotional)');
  });

  it('applies flat dollar voucher discounts (e.g. SAVE5, SAVE10)', () => {
    const items = [{ itemId: 'loaded-fries', quantity: 2 }]; // 2 * $12.00 = $24.00

    const pricing5 = calculateOrderPricing(items, 'SAVE5', 'GREEN_FLAG');
    // Subtotal 24.00, dynamic yield 10% = 2.40
    expect(pricing5.subtotal).toBe(24.0);
    expect(pricing5.dynamicYieldDiscount).toBe(2.4);
    // Flat voucher = $5.00
    expect(pricing5.voucherDiscount).toBe(5.0);

    const discounted = 24.0 - (2.4 + 5.0); // 16.60
    expect(discounted).toBe(16.6);
    expect(pricing5.serviceFee).toBe(round2(16.6 * 0.025)); // 0.42
    expect(pricing5.total).toBe(round2(16.6 + 0.42)); // 17.02
  });

  it('applies free item vouchers correctly (e.g. FREE-BURGER)', () => {
    const items = [
      { itemId: 'apex-burger', quantity: 1 }, // $16.50
      { itemId: 'loaded-fries', quantity: 1 }, // $12.00
    ]; // Subtotal = $28.50

    const pricing = calculateOrderPricing(items, 'FREE-BURGER', 'GREEN_FLAG');
    expect(pricing.subtotal).toBe(28.5);
    expect(pricing.freeItemApplied).toBeDefined();
    expect(pricing.freeItemApplied?.itemId).toBe('apex-burger');
    expect(pricing.freeItemApplied?.originalPrice).toBe(16.5);
    expect(pricing.voucherDiscount).toBe(16.5);
  });

  it('prevents discounts from inverting total or exceeding subtotal', () => {
    const items = [{ itemId: 'still-water', quantity: 1 }]; // $4.50
    // Voucher is $10, which exceeds subtotal ($4.50)
    const pricing = calculateOrderPricing(items, 'SAVE10', 'GREEN_FLAG');

    expect(pricing.subtotal).toBe(4.5);
    expect(pricing.total).toBeGreaterThanOrEqual(0);
    expect(pricing.dynamicYieldDiscount + pricing.voucherDiscount).toBeLessThanOrEqual(pricing.subtotal);
  });

  it('calculates 2.5% service fee with exact 2-decimal rounding', () => {
    // Test multiple fractional scenarios
    expect(round2(10.555)).toBe(10.56);
    expect(round2(10.554)).toBe(10.55);

    const singleItem = [{ itemId: 'still-water', quantity: 1 }]; // $4.50
    const pricing = calculateOrderPricing(singleItem, undefined, 'SAFETY_CAR');
    // 2.5% of $4.50 = 0.1125 -> rounds to 0.11
    expect(pricing.serviceFee).toBe(0.11);
    expect(pricing.total).toBe(4.61);
  });

  it('calculates loyalty points at 2 points per $1 spent', () => {
    const items = [{ itemId: 'loaded-fries', quantity: 1 }]; // $12.00
    const pricing = calculateOrderPricing(items, undefined, 'SAFETY_CAR');
    // Subtotal $12.00, fee = $0.30, total = $12.30
    // Points = Math.round(12.30 * 2) = 25
    expect(pricing.total).toBe(12.3);
    expect(pricing.loyaltyPointsEarned).toBe(25);
  });

  it('resists price-tampering: passing altered unitPrice in cart item is overridden by authoritative catalog price', () => {
    const tamperedCart = [
      {
        itemId: 'apex-burger',
        quantity: 2,
        unitPrice: 0.01, // Malicious user tries to set price to 1 cent instead of $16.50
      },
      {
        itemId: 'craft-lager',
        quantity: 1,
        unitPrice: 0.00, // Malicious user tries to get beer for free instead of $36.00
      },
    ];

    const pricing = calculateOrderPricing(tamperedCart, undefined, 'SAFETY_CAR');
    // Authoritative catalog must enforce: 2 * 16.50 + 1 * 36.00 = $69.00
    expect(pricing.subtotal).toBe(69.0);
    expect(pricing.subtotal).not.toBe(0.02);
    expect(pricing.total).toBe(round2(69.0 + round2(69.0 * 0.025)));
  });
});
