"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useOrder } from "@/context/OrderContext";
import { useLiveData } from "@/context/LiveDataContext";
import { useOrderPricing } from "@/lib/useOrderPricing";
import { useShell } from "@/components/shell/ShellContext";
import CartLines from "./CartLines";
import PriceRows from "./PriceRows";
import { money } from "@/components/ui/kit";

export function PickupLine({ onChange }: { onChange?: () => void }) {
  const { selectedPitStopId } = useOrder();
  const { podById } = useLiveData();
  const pod = podById(selectedPitStopId);
  if (!pod) return null;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-m)] bg-sunk px-3 py-2.5">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-s)] bg-ink font-display text-[17px] font-bold text-hivis">
        {pod.id}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[15px] font-semibold">Collect at {pod.label}</p>
        <p className="text-[13px] text-muted">
          {pod.walkMins} min walk, about {pod.queueMins} min queue
        </p>
      </div>
      {onChange && (
        <button type="button" onClick={onChange} className="text-[14px] font-semibold underline underline-offset-2">
          Change
        </button>
      )}
    </div>
  );
}

/** Cart contents and totals. Used in the cart sheet and the desktop sidebar. */
export default function CartPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { totalItems } = useOrder();
  const { setPodPickerOpen } = useShell();
  const pricing = useOrderPricing();

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-sunk text-muted">
          <ShoppingBag size={26} aria-hidden />
        </span>
        <p className="text-[17px] font-semibold">Your order is empty</p>
        <p className="mt-1 max-w-[28ch] text-[15px] text-muted">
          Add something from the menu and it will be waiting in a locker when you get there.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 py-4">
      <PickupLine onChange={() => setPodPickerOpen(true)} />
      <CartLines />
      <PriceRows pricing={pricing} showPoints />
      <Link
        href="/checkout"
        onClick={onNavigate}
        className="flex h-14 w-full items-center justify-between rounded-[var(--radius-m)] bg-hivis px-5 text-[17px] font-semibold text-ink hover:bg-hivis-deep"
      >
        <span>Go to checkout</span>
        <span className="font-display text-[20px] font-extrabold tabular">
          {money(pricing.total)}
        </span>
      </Link>
    </div>
  );
}
