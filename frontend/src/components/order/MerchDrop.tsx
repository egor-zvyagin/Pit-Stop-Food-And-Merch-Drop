"use client";

import { useMemo } from "react";
import { CATALOG_ITEMS } from "@/data/catalog";
import MenuCard from "@/components/order/MenuCard";

export default function MerchDrop() {
  const merchItems = useMemo(() => {
    return CATALOG_ITEMS.filter((item) => item.category === "merch");
  }, []);

  return (
    <div className="space-y-3">
      {merchItems.map((item) => (
        <MenuCard key={item.id} item={item} />
      ))}
    </div>
  );
}
