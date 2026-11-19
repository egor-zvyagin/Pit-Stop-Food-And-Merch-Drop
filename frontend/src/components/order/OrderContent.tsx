"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";

import { CATEGORIES } from "@/data/orderConstantData";
import { CATALOG_ITEMS } from "@/data/catalog";

import Button from "@/components/ui/Buttons";
import Typography from "@/components/ui/Typography";
import { useOrder } from "@/context/OrderContext";
import ChangePitStopPopup from "../popUp/ChangePitStopPopup";
import ReviewOrderButton from "./ReviewOrderButton";
import MenuCard from "./MenuCard";
import FoodMenu from "./FoodMenu";
import MerchDrop from "./MerchDrop";
import CircuitFlagBanner from "@/components/home/CircuitFlagBanner";

type Category = (typeof CATEGORIES)[number]["id"];

export default function OrderContent() {
  const router = useRouter();
  const [changePitStopOpen, setChangePitStopOpen] = useState(false);

  const {
    selectedPitStop,
    selectedPitStopId,
    setSelectedPitStopId,
    totalItems,
    totalPrice,
  } = useOrder();

  const [category, setCategory] = useState<Category>("all");

  return (
    <main className="min-h-screen bg-[var(--color-page-background)]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[var(--color-page-background)]">
        <div className="flex-1 overflow-y-auto pb-[155px]">
          {/* Delivery Title */}
          <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 pb-3 pt-4">
            <div className="flex items-center gap-1.5">
              <Icon
                icon="mdi:map-marker-outline"
                width={12}
                height={12}
                className="text-[var(--color-text-muted)]"
              />

              <Typography
                variant="meta"
                className="tracking-[0.88px] !text-[var(--color-text-muted)] font-bold text-xs"
              >
                {selectedPitStop
                  ? `DELIVERING TO: ${selectedPitStop.name}`
                  : "SELECT A PIT STOP"}
              </Typography>

              {/* Opens collection point selector */}
              <Button
                type="button"
                onClick={() => setChangePitStopOpen(true)}
                className="ml-auto !h-auto !w-auto !rounded-none !bg-transparent !p-0 !text-[var(--color-brand-primary)]"
              >
                <Typography
                  variant="meta"
                  className="tracking-[0.88px] !text-[var(--color-brand-primary)] font-bold text-xs"
                >
                  {selectedPitStop ? "CHANGE" : "SELECT"}
                </Typography>
              </Button>
            </div>

            <div className="mt-1">
              <Typography
                variant="screenTitle"
                className="!text-[28px] !leading-[29.4px] font-display font-black uppercase !text-[var(--color-text-primary)]"
              >
                PIT STOP FUEL & GEAR
              </Typography>
            </div>
          </section>

          {/* Categories */}
          <section className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-[10px]">
            {CATEGORIES.map((item) => {
              const selected = category === item.id;

              return (
                <Button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={`
                    !h-[32px]
                    !w-auto
                    shrink-0
                    !rounded-[6px]
                    !border
                    !px-3
                    !py-0
                    ${
                      selected
                        ? "!border-[var(--color-brand-primary)] !bg-[var(--color-brand-primary)] !text-[var(--color-text-on-primary)]"
                        : "!border-[var(--color-border)] !bg-[var(--color-page-background)] !text-[var(--color-text-primary)]"
                    }
                  `}
                >
                  <Typography
                    variant="button"
                    className="!text-[12px] !leading-[18px] tracking-[0.48px] font-bold"
                  >
                    {item.label}
                  </Typography>
                </Button>
              );
            })}
          </section>

          {/* Catalog Items */}
          <section className="px-4 pt-3">
            <div className="mb-3">
              <CircuitFlagBanner compact />
            </div>
            {category === "food" && <FoodMenu />}
            {category === "merch" && <MerchDrop />}
            {category === "all" && (
              <div className="space-y-3">
                {CATALOG_ITEMS.map((item) => (
                  <MenuCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        </div>

        <ReviewOrderButton
          itemCount={totalItems}
          totalPrice={totalPrice}
          onClick={() => {
            if (!selectedPitStopId) {
              setChangePitStopOpen(true);
              return;
            }
            router.push("/checkout");
          }}
        />
      </div>

      {/* Change Collection Point popup */}
      <ChangePitStopPopup
        isOpen={changePitStopOpen}
        selectedPitStopId={selectedPitStopId}
        onSelect={setSelectedPitStopId}
        onClose={() => setChangePitStopOpen(false)}
      />
    </main>
  );
}
