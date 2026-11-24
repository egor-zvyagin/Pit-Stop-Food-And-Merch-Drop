"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import Logo from "@/components/brand/Logo";
import { useOrder } from "@/context/OrderContext";
import { useShell } from "./ShellContext";
import { NAV_ITEMS, isActivePath } from "./navItems";

function initials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Header() {
  const pathname = usePathname() || "/";
  const { totalItems, ticketProfile } = useOrder();
  const { setCartOpen, setAccountOpen } = useShell();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex h-[var(--app-header-height)] max-w-[1200px] items-center gap-6 px-4 lg:px-6">
        <Link href="/" aria-label="Pit Stop menu" className="shrink-0 rounded-[var(--radius-s)]">
          <Logo size={30} />
        </Link>

        <nav aria-label="Main" className="hidden h-full items-stretch gap-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center px-3 text-[15px] font-medium ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {item.label}
                {active && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-hivis" />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Your order, ${totalItems} ${totalItems === 1 ? "item" : "items"}`}
            className="relative inline-flex h-10 items-center gap-2 rounded-full px-3 text-ink hover:bg-sunk"
          >
            <ShoppingBag size={20} aria-hidden />
            <span className="hidden text-[15px] font-medium sm:inline">Order</span>
            {totalItems > 0 && (
              <span
                key={totalItems}
                className="animate-bump inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-hivis px-1.5 font-display text-[13px] font-bold tabular text-ink"
              >
                {totalItems}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-label="Your ticket and settings"
            className="inline-flex h-10 items-center gap-2 rounded-full py-1 pl-1 pr-1 hover:bg-sunk sm:pr-3"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
              {initials(ticketProfile?.holderName)}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[14px] font-medium text-ink">{ticketProfile?.holderName ?? "Add ticket"}</span>
              <span className="block text-[12px] text-muted">{ticketProfile?.viewingArea.grandstand ?? ""}</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
