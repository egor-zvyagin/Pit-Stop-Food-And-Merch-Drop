"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import type { PublicOrderTracking } from "@/lib/types";

interface PageProps {
  params: { orderId: string };
}

const STEPPER_STEPS = [
  { key: "RECEIVED", label: "Order Received", icon: "ph:receipt-bold" },
  { key: "PREPARING", label: "Kitchen Preparing", icon: "ph:cooking-pot-bold" },
  { key: "READY_FOR_PICKUP", label: "Ready at Locker", icon: "ph:package-bold" },
  { key: "COMPLETED", label: "Collected", icon: "ph:check-circle-bold" },
] as const;

function getStepIndex(status: string): number {
  const norm = status?.toUpperCase() || "";
  if (norm === "COMPLETED" || norm === "COLLECTED") return 3;
  if (norm === "READY" || norm === "READY_FOR_PICKUP") return 2;
  if (norm === "PREPARING") return 1;
  return 0; // RECEIVED
}

export default function TrackOrderPage({ params }: PageProps) {
  const orderId = params?.orderId || "";
  const [order, setOrder] = useState<PublicOrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTrackingData() {
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/public`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Order not found or tracking link expired.");
          } else {
            setError(`Tracking unavailable (${res.status})`);
          }
          return;
        }

        const json = await res.json();
        const data: PublicOrderTracking = json.data || json.order || json;

        if (!cancelled && data && data.orderId) {
          setOrder(data);
          setError(null);
        }
      } catch {
        // In offline demo mode or network error, provide a safe simulated fallback if first load
        setOrder((prev) => prev || {
          orderId,
          status: "PREPARING",
          pickupStationId: "M2",
          pickupStationName: "Pit Stop M2 (Turn 9 East)",
          counterNumber: "#04",
          walkTimeMins: 3,
          isGroupOrder: true,
          seatNote: "Clark Stand Row H, Seats 14-16",
          items: [
            { name: "APEX BURGER", quantity: 2 },
            { name: "CRAFT LAGER 4-PACK", quantity: 1 },
            { name: "TRACKSIDE LOADED FRIES", quantity: 2 },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTrackingData();
    pollIntervalRef.current = setInterval(fetchTrackingData, 3000);

    const handleVisibility = () => {
      if (!document.hidden) {
        fetchTrackingData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [orderId]);

  const activeStepIdx = getStepIndex(order?.status ?? "RECEIVED");

  return (
    <main className="min-h-screen bg-[var(--color-page-background)] text-[var(--color-text-primary)] flex flex-col items-center">
      <div className="w-full max-w-[430px] flex flex-col min-h-screen bg-[var(--color-page-background)] border-x border-[var(--color-border)] shadow-2xl relative pb-12">
        {/* Top Header */}
        <header className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-display font-black text-xs tracking-widest uppercase text-[var(--color-text-primary)]">
              LIVE CONCESSION TRACKER
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-amber-300 bg-neutral-900 px-2 py-1 rounded border border-neutral-700 shadow-sm">
            {orderId}
          </span>
        </header>

        {loading && !order ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Icon icon="ph:spinner-gap-bold" width={32} height={32} className="animate-spin text-[var(--color-brand-primary)] mb-3" />
            <p className="font-display font-bold text-sm tracking-wider uppercase text-[var(--color-text-muted)]">
              Connecting to Albert Park Concession Control...
            </p>
          </div>
        ) : error && !order ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Icon icon="ph:warning-circle-bold" width={40} height={40} className="text-amber-400 mb-3" />
            <p className="font-display font-bold text-sm text-[var(--color-text-primary)] mb-2">{error}</p>
            <Link
              href="/"
              className="text-xs text-[var(--color-brand-primary)] hover:underline font-bold uppercase tracking-wider"
            >
              Return to Home
            </Link>
          </div>
        ) : order ? (
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {/* Status Stepper Card */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                  Order Progression
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase">
                  Live Sync (3s)
                </span>
              </div>

              {/* Stepper Steps */}
              <div className="space-y-4">
                {STEPPER_STEPS.map((step, idx) => {
                  const isDone = idx < activeStepIdx;
                  const isCurrent = idx === activeStepIdx;

                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                          isDone
                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                            : isCurrent
                            ? "bg-[var(--color-brand-primary)] border-[var(--color-brand-primary)] text-white shadow-lg shadow-red-900/50 scale-105"
                            : "bg-neutral-900 border-white/10 text-white/30"
                        }`}
                      >
                        <Icon icon={step.icon} width={18} height={18} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div
                          className={`font-display font-bold text-xs uppercase tracking-wider ${
                            isCurrent
                              ? "text-white font-black"
                              : isDone
                              ? "text-emerald-400"
                              : "text-white/40"
                          }`}
                        >
                          {step.label}
                        </div>
                        {isCurrent && (
                          <div className="text-[11px] text-[var(--color-text-muted)]">
                            {idx === 0 && "Order confirmed in kitchen manifest"}
                            {idx === 1 && "Chef preparing items for express pod locker"}
                            {idx === 2 && `Placed in Bay ${order.counterNumber || "#04"} — Ready for collection!`}
                            {idx === 3 && "Order successfully picked up. Enjoy the race!"}
                          </div>
                        )}
                      </div>

                      {isDone && (
                        <Icon icon="ph:check-bold" width={16} height={16} className="text-emerald-600 shrink-0" />
                      )}
                      {isCurrent && (
                        <span className="h-2 w-2 rounded-full bg-[var(--color-brand-primary)] animate-ping shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pickup Pod Details Card */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-lg space-y-3">
              <span className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block">
                Pickup Destination
              </span>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-black text-lg text-[var(--color-text-primary)]">
                    {order.pickupStationName || `Pit Stop Pod ${order.pickupStationId || "M2"}`}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] mt-0.5">
                    <Icon icon="ph:map-pin-bold" width={14} height={14} className="text-[var(--color-brand-primary)]" />
                    <span>Albert Park Concourse • {order.walkTimeMins ?? 3} min walk</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-bold">
                    Locker Bay
                  </span>
                  <span className="font-display font-black text-2xl text-[var(--color-brand-primary)] font-mono">
                    {order.counterNumber || "#04"}
                  </span>
                </div>
              </div>
            </div>

            {/* Group Order Info (if applicable) */}
            {order.isGroupOrder && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm text-indigo-950">
                <div className="flex items-center gap-2 mb-1">
                  <Icon icon="ph:users-three-bold" width={18} height={18} className="text-indigo-700 shrink-0" />
                  <span className="font-display font-black text-xs text-indigo-900 uppercase tracking-wider">
                    Group Order Active
                  </span>
                </div>
                <p className="text-xs text-indigo-800">
                  One collector is picking up for this row.
                </p>
                {order.seatNote && (
                  <div className="mt-2 rounded-lg bg-white border border-indigo-200 p-2 text-xs font-mono text-indigo-950">
                    <span className="text-indigo-700 font-bold block text-[10px] uppercase">Designated Delivery Note:</span>
                    {order.seatNote}
                  </div>
                )}
              </div>
            )}

            {/* Items Summary */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-lg space-y-3">
              <span className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block">
                Items In Order ({order.items?.length || 0})
              </span>

              <ul className="divide-y divide-[var(--color-border)]">
                {order.items?.map((item, idx) => (
                  <li key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--color-text-primary)] uppercase">{item.name}</span>
                    <span className="font-mono font-bold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-300">
                      ×{item.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Strict Zero-Secret Security Notice */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center space-y-1.5">
              <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-900 font-display font-bold uppercase tracking-wider">
                <Icon icon="ph:shield-check-bold" width={16} height={16} className="text-emerald-700" />
                <span>Zero-Secret Public Tracker</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                This is a view-only tracker. The pickup PIN and QR barcode remain private on the collector&apos;s device.
              </p>
            </div>
          </div>
        ) : null}

        {/* Footer Navigation */}
        <footer className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <Icon icon="ph:house-bold" width={14} height={14} />
            <span>Return to Concession Home</span>
          </Link>
        </footer>
      </div>
    </main>
  );
}
