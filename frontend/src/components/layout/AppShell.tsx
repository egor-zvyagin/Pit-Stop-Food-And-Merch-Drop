"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/shell/Header";
import FlagStrip from "@/components/shell/FlagStrip";
import BottomNav from "@/components/shell/BottomNav";
import PodPicker from "@/components/shell/PodPicker";
import AccountSheet from "@/components/shell/AccountSheet";
import { ShellProvider, useShell } from "@/components/shell/ShellContext";
import { LiveDataProvider } from "@/context/LiveDataContext";
import CartBar from "@/components/cart/CartBar";
import CartPanel from "@/components/cart/CartPanel";
import { Sheet } from "@/components/ui/kit";

function CartSheet() {
  const { cartOpen, setCartOpen } = useShell();
  return (
    <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Your order" side="right">
      <CartPanel onNavigate={() => setCartOpen(false)} />
    </Sheet>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";

  // The staff terminal is a full-screen kiosk with its own chrome.
  if (pathname.startsWith("/vendor")) {
    return (
      <LiveDataProvider>
        <main className="min-h-screen w-full">{children}</main>
      </LiveDataProvider>
    );
  }

  return (
    <LiveDataProvider>
      <ShellProvider>
        <a
          href="#content"
          className="sr-only z-[90] rounded bg-ink px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <Header />
        <FlagStrip />
        <main
          id="content"
          className="min-h-[calc(100dvh-var(--app-header-height))] pb-[calc(var(--bottom-nav-height)+var(--cart-bar-height)+32px)] lg:pb-16"
        >
          {children}
        </main>
        <CartBar />
        <BottomNav />
        <CartSheet />
        <PodPicker />
        <AccountSheet />
      </ShellProvider>
    </LiveDataProvider>
  );
}
