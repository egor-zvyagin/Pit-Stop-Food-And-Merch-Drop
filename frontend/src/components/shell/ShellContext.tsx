"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

type ShellState = {
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  accountOpen: boolean;
  setAccountOpen: (open: boolean) => void;
  podPickerOpen: boolean;
  setPodPickerOpen: (open: boolean) => void;
};

const ShellContext = createContext<ShellState | undefined>(undefined);

/** UI state shared by the header, menu and cart: which sheet is open. */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [cartOpen, setCartOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [podPickerOpen, setPodPickerOpen] = useState(false);
  const value = useMemo(
    () => ({ cartOpen, setCartOpen, accountOpen, setAccountOpen, podPickerOpen, setPodPickerOpen }),
    [cartOpen, accountOpen, podPickerOpen]
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside ShellProvider");
  return ctx;
}
