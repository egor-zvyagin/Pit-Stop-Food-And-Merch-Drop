"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";
import Card from "@/components/ui/Card";
import Typography from "@/components/ui/Typography";
import Button from "@/components/ui/Buttons";
import { useOrder } from "@/context/OrderContext";
import { CatalogItem } from "@/lib/types";

type MenuCardProps = {
  item: CatalogItem | {
    id: string;
    name: string;
    price: number;
    originalPrice?: number;
    description?: string;
    image: string;
    prepTime?: string;
    tag?: string;
    stock?: number;
    availableUnits?: number;
    inStock?: boolean;
  };
};

export default function MenuCard({ item }: MenuCardProps) {
  const { quantities, increaseQuantity, decreaseQuantity } = useOrder();
  const quantity = quantities[item.id] ?? 0;
  const [imgSrc, setImgSrc] = useState(item.image || "/images/burger.jpg");

  // Determine stock status
  const stock = item.stock ?? item.availableUnits ?? (item.inStock === false ? 0 : 50);
  const isSoldOut = stock === 0 || item.inStock === false;
  const isUrgent = !isSoldOut && stock >= 1 && stock <= 5;
  const canIncrease = !isSoldOut && quantity < stock;

  return (
    <Card className={`!p-[14px] overflow-hidden transition-all ${isSoldOut ? "opacity-60 bg-neutral-100" : ""}`}>
      <div className="flex gap-3">
        {/* Item Photography with Next.js <Image> & Fallback */}
        <div className="relative h-[80px] w-[80px] shrink-0 overflow-hidden rounded-[12px] bg-neutral-900 border border-[var(--color-border)]">
          <Image
            src={imgSrc}
            alt={item.name}
            fill
            sizes="80px"
            onError={() => setImgSrc("/images/burger.jpg")}
            className={`object-cover transition-transform duration-300 hover:scale-105 ${
              isSoldOut ? "grayscale" : ""
            }`}
          />
          {isSoldOut ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/80 text-[10px] font-black uppercase tracking-wider text-red-400">
              SOLD OUT
            </span>
          ) : item.tag ? (
            <span className="absolute bottom-1 left-1 rounded bg-[var(--color-brand-primary)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white shadow-sm">
              {item.tag}
            </span>
          ) : null}
        </div>

        {/* Item details */}
        <div className="min-w-0 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <Typography
                variant="cardHeading"
                className="!text-[15px] !leading-[18px] font-bold !text-[var(--color-text-primary)] line-clamp-1"
              >
                {item.name}
              </Typography>

              <div className="text-right shrink-0">
                <Typography
                  variant="price"
                  className="!text-[var(--color-text-primary)] font-display font-black text-sm"
                >
                  ${item.price.toFixed(2)}
                </Typography>
                {item.originalPrice && item.originalPrice > item.price && (
                  <span className="block text-[10px] text-neutral-500 line-through">
                    ${item.originalPrice.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {item.description && (
              <p className="mt-1 text-[11px] leading-[15px] text-[var(--color-text-muted)] line-clamp-2">
                {item.description}
              </p>
            )}

            {/* Urgency Badge / Sold Out Pill / Prep Time */}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {isSoldOut && (
                <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-700 border border-red-200">
                  SOLD OUT
                </span>
              )}
              {isUrgent && (
                <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800 border border-amber-200 animate-pulse">
                  ONLY {stock} LEFT
                </span>
              )}
              {item.prepTime && (
                <div className="flex items-center gap-1 text-[10px] text-neutral-600 font-medium">
                  <Icon icon="mdi:clock-outline" width={11} height={11} className="text-amber-600" />
                  <span>{item.prepTime}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quantity Controls */}
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={() => decreaseQuantity(item.id)}
              disabled={quantity === 0}
              className="
                !h-[28px]
                !w-[28px]
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
              <span className="font-mono text-xs font-bold !text-[var(--color-text-primary)]">
                {quantity}
              </span>
            </div>

            <Button
              type="button"
              aria-label={`Add ${item.name}`}
              onClick={canIncrease ? () => increaseQuantity(item.id) : undefined}
              disabled={!canIncrease}
              className="
                !h-[28px]
                !w-[28px]
                !rounded-[8px]
                !p-0
                !bg-[var(--color-brand-primary)]
                hover:!bg-red-700
                disabled:opacity-30
                disabled:cursor-not-allowed
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
