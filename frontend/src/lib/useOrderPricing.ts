"use client";

import { useMemo } from "react";
import { calculateOrderPricing } from "@/lib/pricing";
import { useOrder } from "@/context/OrderContext";
import { useLiveData } from "@/context/LiveDataContext";
import type { PricingBreakdown } from "@/lib/types";

/**
 * Prices the current cart with the same engine the server uses, at the
 * current race flag, so the total a fan sees is the total they are charged.
 */
export function useOrderPricing(voucherCode?: string): PricingBreakdown & { voucherValid: boolean } {
  const { cartLines } = useOrder();
  const { circuit } = useLiveData();

  return useMemo(() => {
    const items = cartLines.map((line) => ({ itemId: line.itemId, quantity: line.quantity }));
    const pricing = calculateOrderPricing(items, voucherCode || undefined, circuit);
    const voucherValid = Boolean(voucherCode) && (pricing.voucherDiscount > 0 || Boolean(pricing.freeItemApplied));
    return { ...pricing, voucherValid };
  }, [cartLines, voucherCode, circuit]);
}
