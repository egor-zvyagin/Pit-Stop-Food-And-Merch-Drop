"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { PublicOrderTracking } from "@/lib/types";
import { PIT_STOPS } from "@/data/pitStopConstantData";
import PitBoard from "@/components/orders/PitBoard";
import { Notice } from "@/components/ui/kit";

function stageFor(status: string): string {
  switch (status?.toUpperCase()) {
    case "PREPARING":
      return "preparing";
    case "READY":
    case "READY_FOR_PICKUP":
      return "ready";
    case "COMPLETED":
    case "COLLECTED":
      return "completed";
    default:
      return "received";
  }
}

const HEADLINE: Record<string, string> = {
  received: "Order received. The kitchen has it.",
  preparing: "Being prepared now.",
  ready: "Ready and waiting in the locker.",
  completed: "Collected.",
};

/**
 * Public tracker for a shared link. An order ID only ever unlocks progress:
 * no PIN, QR code or signature is sent to this page.
 */
export default function TrackOrderPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = decodeURIComponent(params?.orderId ?? "");
  const [order, setOrder] = useState<PublicOrderTracking | null>(null);
  const [problem, setProblem] = useState<"missing" | "offline" | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/public`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setProblem("missing");
          return;
        }
        if (!res.ok) {
          setProblem("error");
          return;
        }
        const json = await res.json();
        const data: PublicOrderTracking = json.data || json.order || json;
        if (data?.orderId) {
          setOrder(data);
          setProblem(null);
        }
      } catch {
        // Keep showing the last known status and say it may be stale.
        if (!cancelled) setProblem("offline");
      }
    }

    void load();
    const timer = setInterval(load, 3000);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [orderId]);

  const pod = order ? PIT_STOPS.find((p) => p.id === order.pickupStationId) : undefined;
  const stage = order ? stageFor(order.status) : "received";

  return (
    <div className="mx-auto max-w-[640px] px-4 pt-5">
      <p className="text-[15px] text-muted">Shared order</p>
      <h1 className="font-display text-[36px] font-extrabold leading-none">Order tracker</h1>

      <div className="mt-5 space-y-4">
        {problem === "missing" && (
          <Notice tone="caution" title="This tracking link has no order behind it">
            The link may be mistyped, or the order is more than a week old. Ask whoever shared it for a new link.
          </Notice>
        )}
        {problem === "error" && (
          <Notice tone="caution" title="Tracking is unavailable right now">
            The server did not answer properly. This page keeps trying every few seconds.
          </Notice>
        )}
        {problem === "offline" && (
          <Notice tone="caution" title={order ? "You are offline. This status may be out of date." : "You are offline"}>
            The page will update by itself once you have signal again.
          </Notice>
        )}

        {!order && !problem && (
          <div aria-busy="true" aria-label="Loading order" className="h-[260px] animate-pulse rounded-[var(--radius-l)] bg-ink/90" />
        )}

        {order && (
          <>
            <PitBoard
              podId={order.pickupStationId}
              podLabel={pod?.label ?? order.pickupStationName}
              locker={order.counterNumber}
              stage={stage}
              headline={
                stage === "ready" && pod ? `Ready at locker ${order.counterNumber.replace("#", "")}, ${pod.label}.` : HEADLINE[stage]
              }
            />
            <section className="rounded-[var(--radius-l)] border border-line bg-surface p-5">
              <h2 className="text-[18px] font-semibold">In this order</h2>
              <ul className="mt-2 divide-y divide-line text-[15px]">
                {order.items.map((item, i) => (
                  <li key={`${item.name}-${i}`} className="py-2">
                    {item.quantity} × {item.name}
                  </li>
                ))}
              </ul>
              {order.isGroupOrder && order.seatNote && (
                <p className="mt-3 text-[14px] text-muted">Group order for {order.seatNote}</p>
              )}
              <p className="mt-3 text-[13px] text-muted">
                Ref {order.orderId}. Only the person who placed the order has the PIN that opens the locker.
              </p>
            </section>
          </>
        )}

        <Link href="/" className="inline-block text-[15px] font-semibold underline underline-offset-2">
          Order your own from the menu
        </Link>
      </div>
    </div>
  );
}
