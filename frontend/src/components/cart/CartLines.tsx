"use client";

import Image from "next/image";
import { CATALOG_BY_ID } from "@/data/catalog";
import { useOrder } from "@/context/OrderContext";
import { money, Stepper } from "@/components/ui/kit";

/** The lines in the cart, each with a quantity stepper. */
export default function CartLines({ compact = false }: { compact?: boolean }) {
  const { cartLines, increaseQuantity, decreaseQuantity } = useOrder();

  return (
    <ul className="divide-y divide-line">
      {cartLines.map((line) => {
        const item = CATALOG_BY_ID.get(line.itemId);
        if (!item) return null;
        return (
          <li key={line.key} className="flex gap-3 py-3">
            {!compact && (
              <Image
                src={item.image}
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded-[var(--radius-s)] object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[15px] font-semibold">{item.name}</p>
                <p className="shrink-0 font-display text-[17px] font-bold tabular">{money(line.unitPrice * line.quantity)}</p>
              </div>
              {line.optionLabels.length > 0 && (
                <p className="mt-0.5 text-[13px] text-muted">{line.optionLabels.join(", ")}</p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[13px] text-muted tabular">{money(line.unitPrice)} each</span>
                <Stepper
                  size="s"
                  value={line.quantity}
                  label={item.name}
                  onIncrease={() => increaseQuantity(line.key)}
                  onDecrease={() => decreaseQuantity(line.key)}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
