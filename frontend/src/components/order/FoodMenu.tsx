"use client";

import { useMemo } from "react";
import { CATALOG_ITEMS } from "@/data/catalog";
import MenuCard from "@/components/order/MenuCard";

export default function FoodMenu() {
  const foodItems = useMemo(() => {
    return CATALOG_ITEMS.filter((item) => item.category === "food");
  }, []);

  return (
    <div className="space-y-3">
      {foodItems.map((item) => (
        <MenuCard key={item.id} item={item} />
      ))}
    </div>
  );
}
