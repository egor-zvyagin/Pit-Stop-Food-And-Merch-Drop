"use client";

import { useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import type { CatalogItem } from "@/lib/types";
import { useOrder } from "@/context/OrderContext";
import { Button, money, Pill, Sheet, Stepper } from "@/components/ui/kit";

export function stockNote(item: CatalogItem): { tone: "stop" | "caution"; text: string } | null {
  if (!item.inStock || item.stock <= 0) return { tone: "stop", text: "Sold out" };
  if (item.isLimitedDrop || item.stock <= 10) return { tone: "caution", text: `${item.stock} left` };
  return null;
}

/** Full item details with options, allergens and quantity. */
export default function ItemSheet({ item, onClose }: { item: CatalogItem | null; onClose: () => void }) {
  const { addToCart } = useOrder();
  const [qty, setQty] = useState(1);
  const [chosen, setChosen] = useState<string[]>([]);

  if (!item) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const soldOut = !item.inStock || item.stock <= 0;
  const maxQty = Math.max(1, Math.min(20, item.stock));
  const note = stockNote(item);

  const toggle = (id: string) =>
    setChosen((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      footer={
        <div className="flex items-center gap-3">
          <Stepper
            value={qty}
            label={item.name}
            max={maxQty}
            onIncrease={() => setQty((q) => Math.min(maxQty, q + 1))}
            onDecrease={() => setQty((q) => Math.max(1, q - 1))}
          />
          <Button
            size="l"
            block
            disabled={soldOut}
            onClick={() => {
              addToCart(item.id, chosen, qty);
              onClose();
            }}
            className="justify-between"
          >
            <span>{soldOut ? "Sold out" : "Add to order"}</span>
            {!soldOut && <span className="font-display text-[20px] font-extrabold tabular">{money(item.price * qty)}</span>}
          </Button>
        </div>
      }
    >
      <div className="relative h-[190px] w-full bg-sunk md:h-[240px]">
        <Image src={item.image} alt="" fill sizes="(min-width: 768px) 520px, 100vw" className="object-cover" />
      </div>
      <div className="space-y-5 px-5 py-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[26px] font-extrabold tabular">{money(item.price)}</span>
            {note && <Pill tone={note.tone}>{note.text}</Pill>}
            {item.isAlcoholic && <Pill tone="neutral">18+, ID checked</Pill>}
            {item.dietary?.map((d) => (
              <Pill key={d} tone="go">
                {d}
              </Pill>
            ))}
          </div>
          <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{item.description}</p>
          <p className="mt-2 text-[14px] text-muted">
            {item.prepMins ? `Made to order, about ${item.prepMins} min` : item.prepTime}
          </p>
        </div>

        {item.options && item.options.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-[16px] font-semibold">Kitchen notes</legend>
            <div className="divide-y divide-line rounded-[var(--radius-m)] border border-line">
              {item.options.map((option) => {
                const on = chosen.includes(option.id);
                return (
                  <label key={option.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(option.id)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-[4px] border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-you ${
                        on ? "border-ink bg-ink text-hivis" : "border-line-strong"
                      }`}
                    >
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className="text-[15px]">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {item.category === "food" && (
          <div>
            <h3 className="text-[16px] font-semibold">Allergens</h3>
            <p className="mt-1 text-[15px] text-ink-2">
              {item.allergens && item.allergens.length > 0
                ? `Contains ${item.allergens.join(", ").toLowerCase()}.`
                : "No declared allergens."}{" "}
              Made in a kitchen that handles all major allergens.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
