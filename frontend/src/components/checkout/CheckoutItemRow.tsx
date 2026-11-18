"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";

import Typography from "@/components/ui/Typography";

export type CheckoutItemRowItem = {
  id: string;
  name: string;
  price: number;
  category?: string;
  description?: string;
  icon?: string;
  imageBackground?: string;
  image?: string;
};

type CheckoutItemRowProps = {
  item: CheckoutItemRowItem;
  quantity: number;
  isFree?: boolean;
  hasBorder?: boolean;
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

export default function CheckoutItemRow({
  item,
  quantity,
  isFree = false,
  hasBorder = false,
}: CheckoutItemRowProps) {
  const itemTotal = item.price * quantity;
  const initialImage = item.image || ITEM_IMAGE_MAP[item.id] || "/images/burger.jpg";
  const [imgSrc, setImgSrc] = useState(initialImage);
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <div
      className={`
        flex
        items-center
        gap-3
        px-4
        py-3
        ${hasBorder ? "border-b border-[var(--color-border)]" : ""}
      `}
    >
      {/* Product Photography with Next.js <Image> */}
      <div
        className="
          relative
          flex
          h-12
          w-12
          shrink-0
          items-center
          justify-center
          overflow-hidden
          rounded-[10px]
          border
          border-[var(--color-border)]
          bg-neutral-900
        "
        style={{
          backgroundColor: hasImageError ? item.imageBackground : undefined,
        }}
      >
        {!hasImageError ? (
          <Image
            src={imgSrc}
            alt={item.name}
            fill
            sizes="48px"
            onError={() => {
              if (imgSrc !== "/images/burger.jpg") {
                setImgSrc("/images/burger.jpg");
              } else {
                setHasImageError(true);
              }
            }}
            className="object-cover"
          />
        ) : (
          <Icon icon={item.icon || "mdi:food"} width={24} height={24} />
        )}
      </div>

      {/* Product details */}
      <div className="min-w-0 flex-1">
        <Typography
          variant="cardHeading"
          className="block !text-[15px] !leading-[16.5px] font-bold text-white line-clamp-1"
        >
          {item.name}
        </Typography>

        <Typography
          variant="body"
          className="mt-[2px] block !text-[12px] !leading-[18px] !text-[var(--color-text-muted)]"
        >
          Qty: {quantity}
        </Typography>
      </div>

      {/* Price */}
      <Typography
        variant="price"
        className={`
          shrink-0
          !text-[16px]
          !leading-6
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
