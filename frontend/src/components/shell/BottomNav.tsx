"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrder } from "@/context/OrderContext";
import { NAV_ITEMS, isActivePath } from "./navItems";

/** Phone navigation. Wide screens use the links in the header instead. */
export default function BottomNav() {
  const pathname = usePathname() || "/";
  const { activeOrder } = useOrder();
  const orderLive = Boolean(activeOrder && activeOrder.status !== "completed");

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface safe-bottom lg:hidden"
    >
      <div className="mx-auto grid h-[var(--bottom-nav-height)] max-w-[560px] grid-cols-4">
        {NAV_ITEMS.map(({ label, href, icon: Glyph }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 text-[12px] ${
                active ? "font-semibold text-ink" : "text-muted"
              }`}
            >
              {active && <span aria-hidden className="absolute inset-x-6 top-0 h-[3px] rounded-b bg-hivis" />}
              <span className="relative">
                <Glyph size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                {href === "/collect" && orderLive && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-go" aria-label="Order in progress" />
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
