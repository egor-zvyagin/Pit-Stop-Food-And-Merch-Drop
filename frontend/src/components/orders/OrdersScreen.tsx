"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Bell, BellRing, Share2 } from "lucide-react";
import { useOrder, ActiveOrder } from "@/context/OrderContext";
import { useDemoMode } from "@/components/DemoProvider";
import { useRewards } from "@/components/reward/RewardsProvider";
import { useLiveData } from "@/context/LiveDataContext";
import { COLLECT_STATUS } from "@/data/collectConstantData";
import { CATALOG_BY_ID } from "@/data/catalog";
import DemoOrderLifecycle from "@/components/demo/DemoOrderLifecycle";
import { Button, money, Notice } from "@/components/ui/kit";
import PitBoard from "./PitBoard";
import OrderHistory from "./OrderHistory";
import { useReadyAlert } from "./useReadyAlert";

const PLACED = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" });

function headlineFor(order: ActiveOrder, place: string, locker: string, prepMins: number): string {
  switch (order.status) {
    case COLLECT_STATUS.RECEIVED:
      return "Order received. The kitchen has it.";
    case COLLECT_STATUS.PREPARING:
      return prepMins > 0 ? `Being prepared, about ${prepMins} min.` : "Being packed into your locker.";
    case COLLECT_STATUS.READY:
      return `Ready. Head to locker ${locker} at ${place}.`;
    default:
      return "Collected. Enjoy the race.";
  }
}

function ShareLink({ orderId }: { orderId: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    const url = `${window.location.origin}/track/${encodeURIComponent(orderId)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Pit Stop order", text: "Follow my food order:", url });
      } else {
        await navigator.clipboard.writeText(url);
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      }
    } catch {
      // Share sheet dismissed.
    }
  }
  return (
    <button type="button" onClick={share} className="inline-flex items-center gap-2 text-[15px] font-semibold text-white">
      <Share2 size={18} aria-hidden />
      {done ? "Link copied" : "Share live tracker"}
    </button>
  );
}

function CurrentOrder({ order }: { order: ActiveOrder }) {
  const router = useRouter();
  const { demoMode } = useDemoMode();
  const { awardOrderPoints } = useRewards();
  const { updateActiveOrderStatus, resetOrderState, addToCart } = useOrder();
  const { podById } = useLiveData();
  const pod = podById(order.pitStopId);
  const place = pod ? `${pod.label} (${pod.id})` : order.stationName ?? "your pod";
  const locker = (order.lockerNumber ?? "").replace("#", "");
  const prepMins = Math.max(0, ...order.items.map((i) => CATALOG_BY_ID.get(i.itemId)?.prepMins ?? 0));
  const { permission, request } = useReadyAlert(order.status, `Order ${order.collectionCode}`, place);
  const ready = order.status === COLLECT_STATUS.READY;
  const collected = order.status === COLLECT_STATUS.COMPLETED;

  async function markCollected() {
    if (demoMode) awardOrderPoints(order.reference, order.rewardPoints);
    updateActiveOrderStatus(COLLECT_STATUS.COMPLETED);
    try {
      const id = order.orderId || order.reference;
      const pin = order.collectionCode || order.pinCode;
      await fetch(`/api/orders/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pin ? { "X-Order-Pin": String(pin) } : {}) },
        body: JSON.stringify({ status: "COMPLETED", pinCode: pin }),
      });
    } catch {
      // Offline: the locker scan already recorded the pickup on the staff side.
    }
  }

  function orderAgain() {
    for (const item of order.items) {
      if (item.isFree || !CATALOG_BY_ID.has(item.itemId)) continue;
      const options = CATALOG_BY_ID.get(item.itemId)?.options ?? [];
      addToCart(item.itemId, options.filter((o) => item.options?.includes(o.label)).map((o) => o.id), item.quantity);
    }
    resetOrderState();
    router.push("/checkout");
  }

  return (
    <div className="space-y-5">
      <DemoOrderLifecycle />
      <PitBoard
        podId={pod?.id ?? String(order.pitStopId)}
        podLabel={pod ? pod.label : place}
        locker={order.lockerNumber}
        code={collected ? undefined : order.collectionCode}
        stage={order.status}
        headline={headlineFor(order, place, locker, prepMins)}
      >
        {ready ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="rounded-[var(--radius-m)] bg-white p-3">
              <QRCodeSVG value={order.qrPayload || order.reference} size={168} level="M" aria-label="Locker QR code" />
            </div>
            <div className="w-full space-y-3 text-[15px] text-white/85">
              <p>Scan this at the locker, or type the PIN on its keypad. It works without signal.</p>
              <Button block onClick={markCollected}>
                I have collected my order
              </Button>
            </div>
          </div>
        ) : collected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] text-white/85">
              {order.rewardPoints > 0 ? `You earned ${order.rewardPoints} reward points.` : "Thanks for ordering."}
            </p>
            <div className="flex gap-2">
              <Button tone="quiet" onClick={() => resetOrderState()}>
                Done
              </Button>
              <Button onClick={orderAgain}>Order again</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {permission === "granted" ? (
              <span className="inline-flex items-center gap-2 text-[15px] text-white/85">
                <BellRing size={18} aria-hidden /> We will alert you when it is ready
              </span>
            ) : permission === "default" ? (
              <button type="button" onClick={request} className="inline-flex items-center gap-2 text-[15px] font-semibold text-white">
                <Bell size={18} aria-hidden /> Alert me when it is ready
              </button>
            ) : (
              <span className="text-[14px] text-white/70">Keep this page open to see when it is ready.</span>
            )}
            {!order.isLocalDemo && <ShareLink orderId={order.reference} />}
          </div>
        )}
      </PitBoard>

      {order.isLocalDemo && (
        <Notice tone="caution" title="Demo order, saved on this phone only">
          There was no connection, so this order never reached a kitchen. Demo Mode runs it on a timer so the flow can be shown.
        </Notice>
      )}

      <section className="rounded-[var(--radius-l)] border border-line bg-surface p-5">
        <div>
          <h2 className="text-[18px] font-semibold">Order details</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Ref {order.reference}
            {order.createdAt ? `, placed ${PLACED.format(new Date(order.createdAt))}` : ""}
          </p>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {order.items.map((item, i) => (
            <li key={`${item.itemId}-${i}`} className="flex justify-between gap-3 py-2.5 text-[15px]">
              <span>
                {item.quantity} × {CATALOG_BY_ID.get(item.itemId)?.name ?? item.name}
                {item.options?.length ? <span className="block text-[13px] text-muted">{item.options.join(", ")}</span> : null}
              </span>
              <span className="tabular">{item.isFree ? "Free" : money(item.unitPrice * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-semibold">Paid</span>
          <span className="font-display text-[22px] font-extrabold tabular">{money(order.totalPaid)}</span>
        </div>
      </section>
    </div>
  );
}

export default function OrdersScreen() {
  const { activeOrder, activeTicketCode } = useOrder();
  const [tab, setTab] = useState<"current" | "past">("current");

  return (
    <div className="mx-auto max-w-[720px] px-4 pt-5">
      <h1 className="font-display text-[36px] font-extrabold leading-none lg:text-[44px]">Orders</h1>

      <div role="tablist" aria-label="Orders" className="mt-4 inline-flex rounded-full bg-surface p-1">
        {(
          [
            ["current", "Current order"],
            ["past", "Past orders"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-[15px] font-semibold ${tab === id ? "bg-ink text-white" : "text-ink hover:bg-sunk"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5" role="tabpanel">
        {tab === "past" ? (
          <OrderHistory ticketCode={activeTicketCode} />
        ) : activeOrder ? (
          <CurrentOrder order={activeOrder} />
        ) : (
          <div className="rounded-[var(--radius-l)] border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="text-[18px] font-semibold">No order in progress</p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[15px] text-muted">
              Order from your seat and this page shows your locker, your PIN and when to walk over.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex h-12 items-center rounded-[var(--radius-m)] bg-hivis px-6 text-[16px] font-semibold text-ink"
            >
              Browse the menu
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
