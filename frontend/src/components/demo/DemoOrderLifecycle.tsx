"use client";

import { useEffect } from "react";
import { useDemoMode } from "@/components/DemoProvider";
import { useOrder } from "@/components/order/OrderProvider";
import { COLLECT_STATUS, CollectStatus } from "@/data/collectConstantData";
import { DEMO_ORDER_STATUS_DELAY_MS } from "@/data/demoConstantData";

const RANK: Record<string, number> = {
  [COLLECT_STATUS.RECEIVED]: 1,
  [COLLECT_STATUS.PREPARING]: 2,
  [COLLECT_STATUS.READY]: 3,
  [COLLECT_STATUS.COMPLETED]: 4,
};

function fromServer(raw: string): CollectStatus | null {
  switch (raw.toUpperCase()) {
    case "RECEIVED":
      return COLLECT_STATUS.RECEIVED;
    case "PREPARING":
      return COLLECT_STATUS.PREPARING;
    case "READY":
    case "READY_FOR_PICKUP":
      return COLLECT_STATUS.READY;
    case "COMPLETED":
    case "COLLECTED":
      return COLLECT_STATUS.COMPLETED;
    default:
      return null;
  }
}

/**
 * Keeps the active order's status current.
 *
 * 1. Polls the server, so updates made on the staff terminal appear here.
 *    Status only moves forward, never back.
 * 2. In Demo Mode, also advances the order on a timer so the whole flow can
 *    be shown without anyone working the staff terminal.
 */
export default function DemoOrderLifecycle() {
  const { demoMode } = useDemoMode();
  const { activeOrder, updateActiveOrderStatus } = useOrder();

  const orderId = activeOrder?.orderId || activeOrder?.reference;
  const status = activeOrder?.status;
  const isLocal = Boolean(activeOrder?.isLocalDemo);

  useEffect(() => {
    if (!orderId || isLocal || status === COLLECT_STATUS.COMPLETED) return;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const next = json.success && json.data?.status ? fromServer(String(json.data.status)) : null;
        if (next && (RANK[next] ?? 0) > (RANK[status ?? ""] ?? 0)) {
          updateActiveOrderStatus(next);
        }
      } catch {
        // No signal: keep the last known status.
      }
    };

    void poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [orderId, status, isLocal, updateActiveOrderStatus]);

  useEffect(() => {
    if (!demoMode || !status) return;
    let next: CollectStatus | null = null;
    if (status === COLLECT_STATUS.RECEIVED) next = COLLECT_STATUS.PREPARING;
    else if (status === COLLECT_STATUS.PREPARING) next = COLLECT_STATUS.READY;
    if (!next) return;
    const target = next;
    const timer = window.setTimeout(() => updateActiveOrderStatus(target), DEMO_ORDER_STATUS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [demoMode, status, updateActiveOrderStatus]);

  return null;
}
