"use client";

import { useMemo } from "react";
import { useLiveCatalog } from "@/lib/useLiveCatalog";
import MenuCard from "@/components/order/MenuCard";

export default function FoodMenu() {
  const catalog = useLiveCatalog();
  const foodItems = useMemo(() => {
    return catalog.filter((item) => item.category === "food");
  }, [catalog]);

  return (
    <div className="space-y-3">
      {foodItems.map((item) => (
        <MenuCard key={item.id} item={item} />
      ))}
    </div>
  );
}
