"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrder } from "@/context/OrderContext";
import { CATALOG_BY_ID } from "@/data/catalog";
import { PIT_STOPS, PitStopId } from "@/data/pitStopConstantData";
import type { OrderRecord } from "@/lib/types";
import { Button, money, Notice, Pill } from "@/components/ui/kit";

const STATUS_PILL: Record<string, { tone: "go" | "caution" | "neutral"; text: string }> = {
  RECEIVED: { tone: "caution", text: "Received" },
  PREPARING: { tone: "caution", text: "Preparing" },
  READY_FOR_PICKUP: { tone: "go", text: "Ready" },
  COMPLETED: { tone: "neutral", text: "Collected" },
};

const TIME = new Intl.DateTimeFormat("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Past orders for the current ticket, read from the server. */
export default function OrderHistory({ ticketCode }: { ticketCode: string }) {
  const router = useRouter();
  const { addToCart, setSelectedPitStopId } = useOrder();
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/history?ticketCode=${encodeURIComponent(ticketCode)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setOrders((json.orders || json.data || []) as OrderRecord[]);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [ticketCode]);

  useEffect(() => {
    // State is only set after the request returns.
    void fetchHistory();
  }, [fetchHistory]);

  const retry = () => {
    setFailed(false);
    setOrders(null);
    void fetchHistory();
  };

  function reorder(order: OrderRecord) {
    for (const item of order.items) {
      if (!CATALOG_BY_ID.has(item.itemId)) continue;
      const catalogOptions = CATALOG_BY_ID.get(item.itemId)?.options ?? [];
      const optionIds = catalogOptions.filter((o) => item.options?.includes(o.label)).map((o) => o.id);
      addToCart(item.itemId, optionIds, item.quantity);
    }
    if (PIT_STOPS.some((p) => p.id === order.pickupStationId)) {
      setSelectedPitStopId(order.pickupStationId as PitStopId);
    }
    router.push("/checkout");
  }

  if (failed) {
    return (
      <Notice tone="caution" title="Past orders could not be loaded" action={<Button tone="dark" onClick={retry}>Try again</Button>}>
        You may be offline. Your current order and its pickup code are saved on this phone.
      </Notice>
    );
  }

  if (!orders) {
    return (
      <ul aria-busy="true" aria-label="Loading past orders" className="space-y-3">
        {[0, 1].map((i) => (
          <li key={i} className="h-[104px] animate-pulse rounded-[var(--radius-m)] bg-surface" />
        ))}
      </ul>
    );
  }

  if (orders.length === 0) {
    return <p className="py-10 text-center text-[16px] text-muted">No past orders on ticket {ticketCode} yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {orders.map((order) => {
        const pill = STATUS_PILL[order.status] ?? STATUS_PILL.RECEIVED;
        const pod = PIT_STOPS.find((p) => p.id === order.pickupStationId);
        return (
          <li key={order.orderId} className="rounded-[var(--radius-m)] border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">
                  {order.items.map((i) => `${i.quantity} × ${CATALOG_BY_ID.get(i.itemId)?.name ?? i.name}`).join(", ")}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {TIME.format(new Date(order.createdAt))}, {pod ? `${pod.label} (${pod.id})` : order.pickupStationName}, ref {order.orderId}
                </p>
              </div>
              <Pill tone={pill.tone}>{pill.text}</Pill>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-display text-[20px] font-bold tabular">{money(order.total)}</span>
              <Button tone="quiet" onClick={() => reorder(order)}>
                Order again
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
