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

          if (newStatus !== activeOrder.status) {
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
