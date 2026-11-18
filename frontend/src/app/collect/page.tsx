"use client";

import { useEffect } from "react";
import CollectContent from "@/components/collect/CollectContent";
import { useOrder } from "@/context/OrderContext";
import { COLLECT_STATUS } from "@/data/collectConstantData";

export default function Collect() {
  const { activeOrder, updateActiveOrderStatus } = useOrder();

  // Poll GET /api/orders/[id]/status every 3s to sync vendor updates in real time
  useEffect(() => {
    if (!activeOrder?.reference && !activeOrder?.orderId && !activeOrder?.collectionCode) return;
    const orderId = activeOrder.orderId || activeOrder.reference || activeOrder.collectionCode;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data?.status) {
          const rawStatus = String(json.data.status).toUpperCase();
          let newStatus = activeOrder.status;

          if (rawStatus === "RECEIVED") {
            newStatus = COLLECT_STATUS.RECEIVED;
          } else if (rawStatus === "PREPARING") {
            newStatus = COLLECT_STATUS.PREPARING;
          } else if (rawStatus === "READY" || rawStatus === "READY_FOR_PICKUP") {
            newStatus = COLLECT_STATUS.READY;
          } else if (rawStatus === "COMPLETED" || rawStatus === "COLLECTED") {
            newStatus = COLLECT_STATUS.COMPLETED;
          }

          const STATUS_RANKS: Record<string, number> = {
            [COLLECT_STATUS.RECEIVED]: 1,
            [COLLECT_STATUS.PREPARING]: 2,
            [COLLECT_STATUS.READY]: 3,
            [COLLECT_STATUS.COMPLETED]: 4,
          };

          const currentRank = STATUS_RANKS[activeOrder.status] || 0;
          const nextRank = STATUS_RANKS[newStatus] || 0;

          // Only advance status forward (e.g. RECEIVED -> PREPARING -> READY -> COMPLETED),
          // never revert backwards if an order was completed by the fan or vendor.
          if (nextRank > currentRank) {
            updateActiveOrderStatus(newStatus);
          }
        }
      } catch {
        // Offline resilience: silent fallback without blocking UI
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [
    activeOrder?.reference,
    activeOrder?.orderId,
    activeOrder?.collectionCode,
    activeOrder?.status,
    updateActiveOrderStatus,
  ]);

  return <CollectContent />;
}
