"use client";

import { useEffect, useState } from "react";
import { CATALOG_ITEMS } from "@/data/catalog";
import type { CatalogItem } from "@/lib/types";

const REFRESH_MS = 20_000;

type LiveStockFields = Pick<CatalogItem, "id" | "stock" | "availableUnits" | "inStock" | "isLimitedDrop">;

/**
 * The menu with live stock levels.
 *
 * Names, prices and photos come from the bundled catalogue, so the menu
 * renders at once and still works offline. Stock comes from /api/inventory
 * and is refreshed while the page is open, so "ONLY 2 LEFT" and "SOLD OUT"
 * reflect the table rather than the numbers the app was built with.
 */
export function useLiveCatalog(): CatalogItem[] {
  const [items, setItems] = useState<CatalogItem[]>(CATALOG_ITEMS);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" });
        if (!res.ok) return;
        const body: { inventory?: LiveStockFields[] } = await res.json();
        if (cancelled || !Array.isArray(body.inventory)) return;

        const live = new Map(body.inventory.map((entry) => [entry.id, entry]));
        setItems(
          CATALOG_ITEMS.map((item) => {
            const stock = live.get(item.id);
            return stock
              ? {
                  ...item,
                  stock: stock.stock,
                  availableUnits: stock.availableUnits,
                  inStock: stock.inStock,
                  isLimitedDrop: stock.isLimitedDrop,
                }
              : item;
          })
        );
      } catch {
        // Offline: keep showing the last known levels.
      }
    }

    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return items;
}
