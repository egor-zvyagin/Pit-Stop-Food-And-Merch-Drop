"use client";

import Typography from "@/components/ui/Typography";
import { ORDER_ITEMS } from "@/data/orderConstantData";
import { CATALOG_ITEMS } from "@/data/catalog";
import CheckoutItemRow, { CheckoutItemRowItem } from "./CheckoutItemRow";

type CheckoutItemsProps = {
  quantities: Record<string, number>;
  freeItemId?: string | null;
};

export default function CheckoutItems({
  quantities,
  freeItemId,
}: CheckoutItemsProps) {
  // Find all items in cart across CATALOG_ITEMS and legacy ORDER_ITEMS
  const selectedEntries = Object.entries(quantities).filter(
    ([, qty]) => (qty ?? 0) > 0
  );

  const selectedItems = selectedEntries.map(([id, qty]) => {
    const catItem = CATALOG_ITEMS.find((c) => c.id === id);
    const ordItem = ORDER_ITEMS.find((o) => o.id === id);

    const item: CheckoutItemRowItem = {
      id,
      name: catItem?.name || ordItem?.name || id.toUpperCase(),
      price: catItem?.price ?? ordItem?.price ?? 0,
      category: catItem?.category || ordItem?.category || "food",
      description: catItem?.description || ordItem?.description || "",
      icon: ordItem?.icon || "noto:hamburger",
      imageBackground: ordItem?.imageBackground || "#fff3e0",
      image: catItem?.image || "/images/burger.jpg",
    };

    return { item, quantity: qty };
  });

  // Complimentary voucher item
  let freeItemObj: CheckoutItemRowItem | undefined;
  if (freeItemId) {
    const catFree = CATALOG_ITEMS.find((c) => c.id === freeItemId);
    const ordFree = ORDER_ITEMS.find((o) => o.id === freeItemId);
    freeItemObj = {
      id: freeItemId,
      name: catFree?.name || ordFree?.name || freeItemId.toUpperCase(),
      price: catFree?.price ?? ordFree?.price ?? 0,
      category: catFree?.category || ordFree?.category || "food",
      description: catFree?.description || ordFree?.description || "",
      icon: ordFree?.icon || "noto:hamburger",
      imageBackground: ordFree?.imageBackground || "#fff3e0",
      image: catFree?.image || "/images/burger.jpg",
    };
  }

  return (
    <section className="overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Heading */}
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <Typography
          variant="meta"
          className="tracking-[0.66px] !text-[var(--color-text-muted)] font-bold text-xs"
        >
          YOUR ITEMS
        </Typography>
      </div>

      {/* Selected Order items */}
      {selectedItems.map(({ item, quantity }, index) => {
        const hasBorder = index < selectedItems.length - 1 || freeItemObj !== undefined;

        return (
          <CheckoutItemRow
            key={item.id}
            item={item}
            quantity={quantity}
            hasBorder={hasBorder}
          />
        );
      })}

      {/* Complimentary voucher item */}
      {freeItemObj && (
        <CheckoutItemRow
          item={freeItemObj}
          quantity={1}
          isFree
        />
      )}
    </section>
  );
}
