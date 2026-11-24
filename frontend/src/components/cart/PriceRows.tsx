"use client";

import { money } from "@/components/ui/kit";
import { useLiveData } from "@/context/LiveDataContext";
import type { PricingBreakdown } from "@/lib/types";

/** Subtotal, race-flag discount, voucher, service fee and total. */
export default function PriceRows({
  pricing,
  voucherCode,
  showPoints = false,
}: {
  pricing: PricingBreakdown;
  voucherCode?: string;
  showPoints?: boolean;
}) {
  const { flagCopy, circuit } = useLiveData();

  return (
    <dl className="space-y-1.5 text-[15px]">
      <div className="flex justify-between">
        <dt className="text-muted">Subtotal</dt>
        <dd className="tabular">{money(pricing.subtotal)}</dd>
      </div>
      {pricing.dynamicYieldDiscount > 0 && (
        <div className="flex justify-between text-go">
          <dt>
            {flagCopy.name} discount ({circuit.offPeakDiscountPct}%)
          </dt>
          <dd className="tabular">−{money(pricing.dynamicYieldDiscount)}</dd>
        </div>
      )}
      {pricing.voucherDiscount > 0 && (
        <div className="flex justify-between text-go">
          <dt>
            {pricing.freeItemApplied ? `Free ${pricing.freeItemApplied.name.toLowerCase()}` : "Voucher"}
            {voucherCode ? ` (${voucherCode})` : ""}
          </dt>
          <dd className="tabular">−{money(pricing.voucherDiscount)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-muted">Service fee</dt>
        <dd className="tabular">{money(pricing.serviceFee)}</dd>
      </div>
      <div className="flex items-baseline justify-between border-t border-line pt-2">
        <dt className="text-[16px] font-semibold">Total</dt>
        <dd className="font-display text-[26px] font-extrabold leading-none tabular">{money(pricing.total)}</dd>
      </div>
      {showPoints && pricing.loyaltyPointsEarned > 0 && (
        <p className="text-right text-[13px] text-muted">Earns {pricing.loyaltyPointsEarned} reward points</p>
      )}
    </dl>
  );
}
