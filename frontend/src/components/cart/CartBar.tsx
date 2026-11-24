"use client";

import { usePathname } from "next/navigation";
import { useOrder } from "@/context/OrderContext";
import { useOrderPricing } from "@/lib/useOrderPricing";
import { useShell } from "@/components/shell/ShellContext";
import { money } from "@/components/ui/kit";

/**
 * Phone-only bar above the navigation that opens the cart. Hidden on
 * checkout and order screens, and on wide screens where the cart is a
 * sidebar.
 */
export default function CartBar() {
  const pathname = usePathname() || "/";
  const { totalItems } = useOrder();
  const { setCartOpen } = useShell();
  const { total } = useOrderPricing();

  const onMenu = pathname === "/" || pathname.startsWith("/order") || pathname.startsWith("/map");
  if (totalItems === 0 || !onMenu) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] z-40 px-3 pb-2 lg:hidden">
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="mx-auto flex h-14 w-full max-w-[560px] items-center gap-3 rounded-[var(--radius-m)] bg-hivis px-4 text-ink shadow-[0_6px_20px_rgba(29,33,37,0.25)]"
      >
        <span
          key={totalItems}
          className="animate-bump inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-ink px-2 font-display text-[16px] font-bold tabular text-hivis"
        >
          {totalItems}
        </span>
        <span className="text-[16px] font-semibold">View order</span>
        <span className="ml-auto font-display text-[20px] font-extrabold tabular">{money(total)}</span>
      </button>
    </div>
  );
}
