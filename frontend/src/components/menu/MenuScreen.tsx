"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import type { CatalogItem } from "@/lib/types";
import { useLiveCatalog } from "@/lib/useLiveCatalog";
import { useOrder } from "@/context/OrderContext";
import { useLiveData } from "@/context/LiveDataContext";
import { useShell } from "@/components/shell/ShellContext";
import { QUEUE_TEXT, queueTone } from "@/components/shell/PodPicker";
import CartPanel from "@/components/cart/CartPanel";
import { money, Pill } from "@/components/ui/kit";
import ItemSheet, { stockNote } from "./ItemSheet";

type SectionId = "food" | "drinks" | "merch";

const SECTIONS: { id: SectionId; label: string; blurb: string; match: (i: CatalogItem) => boolean }[] = [
  {
    id: "food",
    label: "Food",
    blurb: "Cooked when you order, packed into a heated locker.",
    match: (i) => i.category === "food" && i.subCategory !== "beverage",
  },
  {
    id: "drinks",
    label: "Drinks",
    blurb: "Already chilled in the locker, so they are ready as soon as you pay.",
    match: (i) => i.subCategory === "beverage",
  },
  {
    id: "merch",
    label: "Merch",
    blurb: "Limited runs for race weekend. No queue at the merch tent.",
    match: (i) => i.category === "merch",
  },
];

/** The quickest useful fact: where and when the order can be collected. */
function PickupHero() {
  const { selectedPitStopId, ticketProfile } = useOrder();
  const { podById, fastestPodId } = useLiveData();
  const { setPodPickerOpen } = useShell();
  const pod = podById(selectedPitStopId);
  if (!pod) return null;
  const quicker = fastestPodId !== pod.id ? podById(fastestPodId) : undefined;

  return (
    <section aria-labelledby="pickup-heading" className="border-b border-line bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-5 lg:px-6 lg:py-7">
        <p className="text-[15px] text-muted">
          {ticketProfile?.holderName ? `${ticketProfile.holderName.split(" ")[0]}, your` : "Your"} pickup pod
        </p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <h1 id="pickup-heading" className="font-display text-[34px] font-extrabold leading-[1.02] lg:text-[44px]">
            {pod.label}
            <span className="text-muted"> ({pod.id})</span>
          </h1>
          <button
            type="button"
            onClick={() => setPodPickerOpen(true)}
            className="mb-1 inline-flex h-10 shrink-0 items-center gap-1 rounded-full border border-line-strong px-4 text-[15px] font-semibold hover:bg-sunk"
          >
            Change
          </button>
        </div>
        <p className="mt-2 text-[15px] text-ink-2">
          {pod.walkMins} min walk, then{" "}
          <span className={`font-semibold ${QUEUE_TEXT[queueTone(pod.queueMins)]}`}>about {pod.queueMins} min at the locker</span>.
        </p>
        {quicker && quicker.totalMins + 2 <= pod.totalMins && (
          <button
            type="button"
            onClick={() => setPodPickerOpen(true)}
            className="mt-3 inline-flex items-center gap-1 rounded-full bg-hivis-soft px-3 py-1.5 text-[14px] font-medium text-ink"
          >
            {quicker.label} ({quicker.id}) is {pod.totalMins - quicker.totalMins} min quicker right now
            <ChevronRight size={16} aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}

function ActiveOrderBanner() {
  const { activeOrder } = useOrder();
  if (!activeOrder || activeOrder.status === "completed") return null;
  const ready = activeOrder.status === "ready";
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-4 lg:px-6">
      <Link
        href="/collect"
        className={`flex items-center gap-3 rounded-[var(--radius-m)] px-4 py-3 ${ready ? "bg-go text-white" : "bg-ink text-white"}`}
      >
        <span className="font-display text-[22px] font-extrabold tabular text-hivis">{activeOrder.collectionCode}</span>
        <span className="min-w-0 flex-1 text-[15px]">
          {ready ? "Your order is ready to collect" : "Your order is being prepared"}
        </span>
        <span className="text-[14px] font-semibold underline underline-offset-2">Track</span>
      </Link>
    </div>
  );
}

function MenuRow({ item, onOpen }: { item: CatalogItem; onOpen: () => void }) {
  const { addToCart, cartLines } = useOrder();
  const inCart = cartLines.filter((l) => l.itemId === item.id).reduce((n, l) => n + l.quantity, 0);
  const note = stockNote(item);
  const soldOut = note?.text === "Sold out";
  const quickAdd = !item.options?.length && !soldOut;

  return (
    <li className="relative">
      <div className={`flex gap-4 py-4 ${soldOut ? "opacity-60" : ""}`}>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-snug">
            <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 after:content-['']">
              {item.name}
            </button>
          </h3>
          <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-muted">{item.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-display text-[19px] font-bold tabular">{money(item.price)}</span>
            {note && <Pill tone={note.tone}>{note.text}</Pill>}
            {item.subCategory !== "beverage" && (item.dietary?.includes("Vegetarian") || item.dietary?.includes("Vegan")) ? (
              <Pill tone="go">{item.dietary.includes("Vegan") ? "Vegan" : "Vegetarian"}</Pill>
            ) : null}
            {item.isAlcoholic && <Pill>18+</Pill>}
            {inCart > 0 && <Pill tone="hivis">{inCart} in order</Pill>}
          </div>
        </div>
        <div className="relative h-[104px] w-[104px] shrink-0">
          <Image
            src={item.image}
            alt=""
            fill
            sizes="104px"
            className="rounded-[var(--radius-m)] object-cover"
          />
          {!soldOut && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (quickAdd) addToCart(item.id);
                else onOpen();
              }}
              aria-label={quickAdd ? `Add ${item.name}` : `Choose options for ${item.name}`}
              className="absolute -bottom-2 -right-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-surface bg-hivis text-ink shadow-[0_2px_8px_rgba(29,33,37,0.25)] hover:bg-hivis-deep"
            >
              <Plus size={22} strokeWidth={2.6} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function MenuScreen() {
  const items = useLiveCatalog();
  const [openItem, setOpenItem] = useState<CatalogItem | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("food");
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({ food: null, drinks: null, merch: null });

  const grouped = useMemo(
    () => SECTIONS.map((s) => ({ ...s, items: items.filter(s.match) })),
    [items]
  );

  // Keep the open sheet in sync with live stock.
  const liveOpenItem = openItem ? items.find((i) => i.id === openItem.id) ?? openItem : null;

  // Highlight the section whose heading has scrolled under the sticky tabs.
  useEffect(() => {
    const onScroll = () => {
      let current: SectionId = "food";
      for (const s of SECTIONS) {
        const el = sectionRefs.current[s.id];
        if (el && el.getBoundingClientRect().top <= 160) current = s.id;
      }
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <PickupHero />
      <ActiveOrderBanner />

      <div className="mx-auto max-w-[1200px] lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 lg:px-6">
        <div>
          <nav
            aria-label="Menu sections"
            className="sticky top-[var(--app-header-height)] z-30 border-b border-line bg-concrete/95 backdrop-blur"
          >
            <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none lg:px-0">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  aria-current={activeSection === s.id ? "true" : undefined}
                  className={`rounded-full px-4 py-2 text-[15px] font-semibold transition-colors ${
                    activeSection === s.id ? "bg-ink text-white" : "bg-surface text-ink hover:bg-sunk"
                  }`}
                >
                  {s.label}
                </a>
              ))}
            </div>
          </nav>

          {grouped.map((section) => (
            <section
              key={section.id}
              id={section.id}
              ref={(el) => {
                sectionRefs.current[section.id] = el;
              }}
              aria-labelledby={`${section.id}-heading`}
              className="scroll-mt-[120px] px-4 pt-6 lg:px-0"
            >
              <h2 id={`${section.id}-heading`} className="font-display text-[28px] font-extrabold leading-none">
                {section.label}
              </h2>
              <p className="mt-1 text-[14px] text-muted">{section.blurb}</p>
              <ul className="mt-2 divide-y divide-line lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0">
                {section.items.map((item) => (
                  <MenuRow key={item.id} item={item} onOpen={() => setOpenItem(item)} />
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Wide screens keep the order beside the menu. */}
        <aside aria-label="Your order" className="hidden lg:block">
          <div className="sticky top-[calc(var(--app-header-height)+24px)] mt-6 overflow-hidden rounded-[var(--radius-l)] border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-3 font-display text-[22px] font-extrabold">Your order</h2>
            <CartPanel />
          </div>
        </aside>
      </div>

      <ItemSheet item={liveOpenItem} onClose={() => setOpenItem(null)} />
    </>
  );
}
