"use client";

import { useMemo } from "react";
import { useLiveCatalog } from "@/lib/useLiveCatalog";
import MenuCard from "@/components/order/MenuCard";

export default function MerchDrop() {
  const catalog = useLiveCatalog();
  const merchItems = useMemo(() => {
    return catalog.filter((item) => item.category === "merch");
  }, [catalog]);

  return (
    <div className="space-y-3">
      {merchItems.map((item) => (
        <MenuCard key={item.id} item={item} />
      ))}
    </div>
  );
}
