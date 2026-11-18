"use client";

import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import SettingsPopUp from "@/components/SettingsPopUp";
import NavBar from "@/components/NavBar";

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();
  const isVendor = pathname?.startsWith("/vendor");

  // Full-screen kiosk mode for staff vendor terminal (/vendor)
  if (isVendor) {
    return (
      <main className="min-h-screen w-full bg-[var(--color-page-background)] text-pitstop-text">
        {children}
      </main>
    );
  }

  // Consumer mobile layout (max 430px wide, centered)
  return (
    <main className="min-h-screen w-full bg-[var(--color-page-background)]">
      <div className="mx-auto w-full max-w-[430px] relative min-h-screen flex flex-col">
        <AppHeader onSettingsClick={() => setSettingsOpen(true)} />

        <div className="flex-1">{children}</div>

        <SettingsPopUp
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />

        <NavBar />
      </div>
    </main>
  );
}
