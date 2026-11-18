"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";

import Card from "@/components/ui/Card";
import Typography from "@/components/ui/Typography";
import { ORDER_ITEMS } from "@/data/orderConstantData";
import { CATALOG_ITEMS } from "@/data/catalog";
import type { ActiveOrder } from "@/context/OrderContext";

type CollectItemsCardProps = {
  order: ActiveOrder;
  title?: "YOUR ITEMS" | "ITEMS TO COLLECT";
  showTotal?: boolean;
};

const ITEM_IMAGE_MAP: Record<string, string> = {
  burger: "/images/burger.jpg",
  "apex-burger": "/images/burger.jpg",
  fries: "/images/loaded-fries.jpg",
  "loaded-fries": "/images/loaded-fries.jpg",
  cap: "/images/cap.jpg",
  "gp-cap-2026": "/images/cap.jpg",
  tee: "/images/tee.jpg",
  "ferrari-tee": "/images/tee.jpg",
  "cold-brew": "/images/beer.jpg",
  "craft-lager": "/images/beer.jpg",
  "pitlane-pizza": "/images/pizza.jpg",
  pizza: "/images/pizza.jpg",
  "red-bull": "/images/redbull.jpg",
  "still-water": "/images/water.jpg",
  water: "/images/water.jpg",
  "hi-fi-earplugs": "/images/earplugs.jpg",
  earplugs: "/images/earplugs.jpg",
};

function CollectItemLine({
  orderItem,
}: {
  orderItem: ActiveOrder["items"][number];
}) {
  const catItem = CATALOG_ITEMS.find((c) => c.id === orderItem.itemId);
  const ordItem = ORDER_ITEMS.find((c) => c.id === orderItem.itemId);
  const name = orderItem.name || catItem?.name || ordItem?.name || orderItem.itemId.toUpperCase();
  const initialImage = orderItem.image || catItem?.image || ITEM_IMAGE_MAP[orderItem.itemId] || "/images/burger.jpg";
  const [imgSrc, setImgSrc] = useState(initialImage);
  const [imgError, setImgError] = useState(false);

  const itemTotal = orderItem.unitPrice * orderItem.quantity;
  const isFree = orderItem.isFree || itemTotal === 0;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-[var(--color-border)] bg-neutral-900">
          {!imgError ? (
            <Image
              src={imgSrc}
              alt={name}
              fill
              sizes="32px"
              onError={() => {
                if (imgSrc !== "/images/burger.jpg") {
                  setImgSrc("/images/burger.jpg");
                } else {
                  setImgError(true);
                }
              }}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon icon={ordItem?.icon || "mdi:food"} width="16" height="16" />
            </div>
          )}
        </div>

        <Typography
          variant="body"
          className="truncate !text-[13px] !leading-[19.5px] font-medium text-white"
        >
          {orderItem.quantity}× {name}
        </Typography>
      </div>

      <Typography
        variant="price"
        className={`
          shrink-0
          !text-[15px]
          font-display
          font-black
          ${isFree ? "!text-[var(--color-status-success)]" : "!text-[var(--color-status-warning)]"}
        `}
      >
        {isFree ? "FREE" : `$${itemTotal.toFixed(2)}`}
      </Typography>
    </div>
  );
}

export default function CollectItemsCard({
  order,
  title = "YOUR ITEMS",
  showTotal = false,
}: CollectItemsCardProps) {
  return (
    <Card className="!rounded-[14px] !px-4 !py-[14px]">
      <Typography
        variant="meta"
        className="tracking-[0.66px] !text-[var(--color-text-muted)] font-bold uppercase text-[11px]"
      >
        {title}
      </Typography>

      <div className="mt-[10px] flex flex-col gap-[10px]">
        {order.items.map((orderItem) => (
          <CollectItemLine key={orderItem.itemId} orderItem={orderItem} />
        ))}
      </div>

      {showTotal && (
        <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
          <Typography variant="body" className="!text-[13px] font-bold text-[var(--color-text-muted)]">
            TOTAL PAID
          </Typography>
          <Typography variant="price" className="!text-[18px] font-display font-black text-[var(--color-status-warning)]">
            ${order.totalPaid.toFixed(2)}
          </Typography>
        </div>
      )}
    </Card>
  );
}
