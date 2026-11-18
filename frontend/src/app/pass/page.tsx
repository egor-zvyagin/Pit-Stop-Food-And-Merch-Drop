"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useOrder } from "@/context/OrderContext";
import { COLLECT_STATUS, CollectStatus } from "@/data/collectConstantData";
import { CheckCircle2, ArrowLeft, Clock, ShieldCheck, Check, Loader2 } from "lucide-react";

export default function OrderPassPage() {
  const { activeOrder: orderContextOrder, updateActiveOrderStatus } = useOrder();
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(240); // 4 min countdown
  const [liveStatus, setLiveStatus] = useState<string>("READY_FOR_PICKUP");

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const defaultOrder = useMemo(() => ({
    orderId: "GP-8821",
    pinCode: "8821",
    qrPayload: "AGPC1.AGPC-2027-KEY-01.DEMO.GP-8821",
    pickupStation: {
      id: "M2",
      name: "Pit Stop M2 (Turn 9 East)",
      locationDetails: "Directly behind Clark Grandstand, Entry Gate 3",
      counterNumber: "#04",
      walkTimeMins: 2,
    },
    items: [
      { item: { name: "APEX BURGER", price: 16.5, image: "/images/burger.jpg" }, quantity: 1 },
      { item: { name: "CRAFT LAGER 4-PACK", price: 36.0, image: "/images/beer.jpg" }, quantity: 1 },
    ],
    total: 42.0,
    status: "READY_FOR_PICKUP" as const,
  }), []);

  const order = useMemo(() => {
    if (!orderContextOrder) return defaultOrder;

    return {
      orderId: orderContextOrder.reference || orderContextOrder.orderId || "GP-8821",
      pinCode: orderContextOrder.collectionCode || orderContextOrder.pinCode || "8821",
      qrPayload:
        orderContextOrder.qrPayload ||
        `AGPC1.AGPC-2027-KEY-01.DEMO.${orderContextOrder.reference || "GP-8821"}`,
      pickupStation: {
        id: orderContextOrder.pitStopId || "M2",
        name: orderContextOrder.stationName || `Pit Stop ${orderContextOrder.pitStopId || "M2"}`,
        locationDetails: "Albert Park Concession Pod",
        counterNumber: orderContextOrder.lockerNumber || "#04",
        walkTimeMins: 2,
      },
      items: orderContextOrder.items.map((i) => ({
        item: {
          name: i.name || i.itemId.toUpperCase(),
          price: i.unitPrice,
          image: i.image || "/images/burger.jpg",
        },
        quantity: i.quantity,
      })),
      total: orderContextOrder.totalPaid,
      status: (orderContextOrder.status === "completed"
        ? "COMPLETED"
        : orderContextOrder.status === "preparing"
        ? "PREPARING"
        : "READY_FOR_PICKUP") as "READY_FOR_PICKUP" | "PREPARING" | "COMPLETED",
    };
  }, [orderContextOrder, defaultOrder]);

  // Real-time Order Lifecycle Sync: Poll GET /api/orders/[id]/status every 3s
  useEffect(() => {
    const orderIdToPoll = order.orderId;
    if (!orderIdToPoll) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderIdToPoll)}/status`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data?.status) {
          const rawStatus = String(json.data.status).toUpperCase();
          let mappedStatus = rawStatus;
          if (rawStatus === "READY") mappedStatus = "READY_FOR_PICKUP";
          setLiveStatus(mappedStatus);

          if (orderContextOrder) {
            let collectStatus: CollectStatus = COLLECT_STATUS.READY;
            if (rawStatus === "RECEIVED") collectStatus = COLLECT_STATUS.RECEIVED;
            else if (rawStatus === "PREPARING") collectStatus = COLLECT_STATUS.PREPARING;
            else if (rawStatus === "READY" || rawStatus === "READY_FOR_PICKUP")
              collectStatus = COLLECT_STATUS.READY;
            else if (rawStatus === "COMPLETED" || rawStatus === "COLLECTED")
              collectStatus = COLLECT_STATUS.COMPLETED;

            const STATUS_RANKS: Record<string, number> = {
              [COLLECT_STATUS.RECEIVED]: 1,
              [COLLECT_STATUS.PREPARING]: 2,
              [COLLECT_STATUS.READY]: 3,
              [COLLECT_STATUS.COMPLETED]: 4,
            };

            const currentRank = STATUS_RANKS[orderContextOrder.status] || 0;
            const nextRank = STATUS_RANKS[collectStatus] || 0;

            if (nextRank > currentRank) {
              updateActiveOrderStatus(collectStatus);
            }
          }
        }
      } catch {
        // Offline resilience
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [order.orderId, orderContextOrder, updateActiveOrderStatus]);

  const fallbackDigits = (order.pinCode.length >= 4 ? order.pinCode : "8821")
    .slice(0, 4)
    .split("");

  return (
    <div className="min-h-screen bg-pitstop-background text-pitstop-text flex flex-col items-center">
      <div className="w-full max-w-[430px] flex flex-col min-h-screen bg-pitstop-background border-x border-pitstop-border shadow-raised relative pb-12">
        {/* Top Header */}
        <div className="px-screen pt-compact flex items-center justify-between border-b border-pitstop-border pb-compact">
          <Link
            href="/collect"
            className="inline-flex items-center gap-micro text-body text-pitstop-text-secondary hover:text-pitstop-text font-display font-bold uppercase tracking-wider transition-colors min-h-tap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Collect</span>
          </Link>
          <span className="text-label font-mono text-pitstop-text-secondary bg-pitstop-surface px-small py-micro rounded-small border border-pitstop-border">
            REF: {order.orderId}
          </span>
        </div>

        {/* Live Status Banner */}
        <div className="px-screen pt-compact">
          <div
            className={`
              border-2 rounded-large p-standard shadow-card text-center transition-all
              ${
                liveStatus === "COMPLETED"
                  ? "bg-emerald-950/40 border-emerald-500"
                  : liveStatus === "PREPARING"
                  ? "bg-amber-950/40 border-amber-500"
                  : "bg-pitstop-surface border-pitstop-success"
              }
            `}
          >
            <div className="flex items-center justify-center gap-compact">
              {liveStatus === "COMPLETED" ? (
                <Check className="w-6 h-6 text-emerald-400" />
              ) : liveStatus === "PREPARING" ? (
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
              ) : (
                <Check className="w-6 h-6 text-pitstop-success" />
              )}
              <h2
                className={`
                  font-display font-black text-section-title tracking-wider uppercase
                  ${
                    liveStatus === "COMPLETED"
                      ? "text-emerald-400"
                      : liveStatus === "PREPARING"
                      ? "text-amber-400"
                      : "text-pitstop-success"
                  }
                `}
              >
                {liveStatus === "COMPLETED"
                  ? "ORDER COMPLETED"
                  : liveStatus === "PREPARING"
                  ? "PREPARING ORDER"
                  : "ORDER READY"}
              </h2>
            </div>
            <p className="text-body text-pitstop-text-secondary mt-1 font-medium">
              {liveStatus === "COMPLETED" ? (
                <span>Collected successfully from {order.pickupStation.name}</span>
              ) : liveStatus === "PREPARING" ? (
                <span>Kitchen staff preparing items for {order.pickupStation.name}</span>
              ) : (
                <span>
                  Collect immediately at{" "}
                  <span className="text-pitstop-text font-bold">
                    {order.pickupStation.name}
                  </span>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Navigation & Pickup QR + Numeric Fallback */}
        <div className="px-screen pt-compact">
          <div className="bg-pitstop-surface border border-pitstop-border rounded-large p-standard space-y-standard shadow-card">
            <div className="flex items-center justify-between">
              <span className="px-small py-micro rounded-tiny bg-pitstop-brand text-pitstop-text font-display font-black text-label-compact tracking-wider uppercase">
                ED25519 VERIFIED PASS
              </span>
              <span className="font-display font-black text-body text-pitstop-price uppercase tracking-wider">
                POD {order.pickupStation.id} • {order.pickupStation.walkTimeMins} MIN WALK
              </span>
            </div>

            {/* Dynamic QR Code */}
            <div className="flex justify-center">
              <div className="bg-white p-small rounded-large border-4 border-black shadow-card">
                <QRCodeSVG
                  value={order.qrPayload}
                  size={175}
                  level="H"
                  includeMargin={false}
                />
              </div>
            </div>

            {/* Numeric Fallback */}
            <div className="space-y-compact text-center">
              <div className="font-display font-black text-label text-pitstop-text-secondary uppercase tracking-wider">
                Numeric 4-Digit Fallback
              </div>
              <div className="grid grid-cols-4 gap-compact px-compact">
                {fallbackDigits.map((char, index) => (
                  <div
                    key={index}
                    className="bg-pitstop-background border border-pitstop-border rounded-card py-small font-display font-black text-screen-title text-pitstop-text tracking-widest shadow-card"
                  >
                    {char}
                  </div>
                ))}
              </div>
              <p className="text-label text-pitstop-text-secondary mt-1">
                Show this code at the pickup counter if scanner camera is offline.
              </p>
            </div>

            {/* Locker & Countdown Details */}
            <div className="border-t border-pitstop-border pt-compact flex items-center justify-between text-body">
              <div>
                <span className="text-pitstop-text-secondary block text-label-compact uppercase font-bold">
                  Locker / Counter
                </span>
                <span className="font-display font-black text-compact-title text-pitstop-text font-mono">
                  {order.pickupStation.counterNumber}
                </span>
              </div>
              <div className="text-right">
                <span className="text-pitstop-text-secondary block text-label-compact uppercase font-bold flex items-center justify-end gap-micro">
                  <Clock className="w-3 h-3 text-pitstop-price" />
                  <span>Locker Reserved</span>
                </span>
                <span className="font-display font-black text-body-large text-pitstop-price">
                  {formatCountdown(secondsRemaining)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Offline Cache & Actions */}
        <div className="px-screen pt-standard space-y-compact">
          <button
            onClick={() => setOfflineSaved(true)}
            className={`w-full min-h-tap py-small rounded-large border text-body font-display font-bold uppercase tracking-wider flex items-center justify-center gap-compact transition-all ${
              offlineSaved
                ? "bg-pitstop-success/15 border-pitstop-success text-pitstop-success shadow-card"
                : "bg-pitstop-surface border-pitstop-border text-pitstop-text hover:bg-neutral-900"
            }`}
          >
            {offlineSaved ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-pitstop-success" />
                <span>Saved to Offline Wallet (Airplane Mode Active)</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5 text-pitstop-success" />
                <span>Save Pass to Offline Wallet</span>
              </>
            )}
          </button>

          <Link
            href="/collect"
            className="w-full min-h-tap py-compact rounded-large bg-pitstop-surface/60 border border-pitstop-border text-pitstop-text-secondary hover:text-pitstop-text text-label font-display font-bold uppercase tracking-wider text-center flex items-center justify-center transition-colors"
          >
            Return to Active Order Hub
          </Link>
        </div>
      </div>
    </div>
  );
}
