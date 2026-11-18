"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";

import Card from "@/components/ui/Card";
import Typography from "@/components/ui/Typography";
import Button from "@/components/ui/Buttons";
import { ORDER_ITEMS } from "@/data/orderConstantData";

type OrderItem = (typeof ORDER_ITEMS)[number] & {
  image?: string;
  tag?: string;
  prepTime?: string;
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

type OrderItemCardProps = {
  item: OrderItem;
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
};

export default function OrderItemCard({
  item,
  quantity,
  onIncrease,
  onDecrease,
}: OrderItemCardProps) {
  const initialImage = item.image || ITEM_IMAGE_MAP[item.id] || "/images/burger.jpg";
  const [imgSrc, setImgSrc] = useState(initialImage);
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <Card className="!p-[14px]">
      <div className="flex gap-3">
        {/* Item Photography with Next.js <Image> & Fallback */}
        <div
          className="
            relative
            flex
            h-[76px]
            w-[76px]
            shrink-0
            items-center
            justify-center
            overflow-hidden
            rounded-[12px]
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
              sizes="76px"
              onError={() => {
                if (imgSrc !== "/images/burger.jpg") {
                  setImgSrc("/images/burger.jpg");
                } else {
                  setHasImageError(true);
                }
              }}
              className="object-cover transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <Icon icon={item.icon || "mdi:food"} width={38} height={38} />
          )}

          {item.tag && (
            <span className="absolute bottom-1 left-1 rounded bg-black/85 px-1 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--color-brand-primary)]">
              {item.tag}
            </span>
          )}
        </div>

        {/* Item details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <Typography
              variant="cardHeading"
              className="!text-[15px] !leading-[17px] font-bold text-white line-clamp-1"
            >
              {item.name}
            </Typography>

            <Typography
              variant="price"
              className="shrink-0 !text-[var(--color-status-warning)] font-display font-black text-sm"
            >
              ${item.price.toFixed(2)}
            </Typography>
          </div>

          <div className="mt-[3px]">
            <Typography
              variant="body"
              className="!text-[12px] !leading-[17px] !text-[var(--color-text-muted)] line-clamp-2"
            >
              {item.description}
            </Typography>
          </div>

          {/* Quantity Controls */}
          <div className="mt-[10px] flex items-center justify-end gap-2">
            <Button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={onDecrease}
              disabled={quantity === 0}
              className="
                !h-[30px]
                !w-[30px]
                !rounded-[8px]
                !border
                !border-[var(--color-border)]
                !bg-[var(--color-page-background)]
                !p-0
                !text-[var(--color-text-primary)]
                disabled:opacity-30
              "
            >
              <span className="flex h-full w-full items-center justify-center">
                <Icon icon="mdi:minus" width={14} height={14} />
              </span>
            </Button>

            <div className="min-w-[18px] text-center">
              <Typography variant="cardHeading" className="text-white font-mono font-bold">
                {quantity}
              </Typography>
            </div>

            <Button
              type="button"
              aria-label={`Add ${item.name}`}
              onClick={onIncrease}
              className="
                !h-[30px]
                !w-[30px]
                !rounded-[8px]
                !p-0
                !bg-[var(--color-brand-primary)]
                hover:!bg-red-700
              "
            >
              <span className="flex h-full w-full items-center justify-center">
                <Icon icon="mdi:plus" width={14} height={14} />
              </span>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
