"use client";

import { useState } from "react";
import { ActiveOrder, useOrder } from "@/components/order/OrderProvider";
import { COLLECT_STATUS } from "@/data/collectConstantData";
import { PIT_STOPS } from "@/data/pitStopConstantData";

import CollectEmptyState from "./CollectEmptyState";
import CollectReadyState from "./CollectReadyState";
import CollectCompleteState from "./CollectCompleteState";
import CollectProgressState from "../order/CollectProgressState";
import DemoOrderLifecycle from "../demo/DemoOrderLifecycle";
import OrderHistoryView from "./OrderHistoryView";
import { useDemoMode } from "../DemoProvider";
import { useRewards } from "../reward/RewardsProvider";

export default function CollectContent() {
    const [activeTab, setActiveTab] = useState<"active" | "history">("active");

    const {
        activeOrder,
        updateActiveOrderStatus,
        activeTicketCode,
    } = useOrder();

    // demomode
    const { demoMode } = useDemoMode();
    const { awardOrderPoints } = useRewards();

    // Fan confirms pickup of their locker order
    async function handleOrderCollected(order: ActiveOrder) {
        if (demoMode) {
            awardOrderPoints(
                order.reference,
                order.rewardPoints
            );
        }

        updateActiveOrderStatus(COLLECT_STATUS.COMPLETED);

        // Notify server that the order was collected, transitioning DB state and awarding loyalty points
        try {
            const orderId = order.orderId || order.reference || order.collectionCode;
            const pin = order.collectionCode || order.pinCode;
            if (orderId) {
                await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        ...(pin ? { "X-Order-Pin": String(pin) } : {}),
                    },
                    body: JSON.stringify({ status: "COMPLETED", pinCode: pin }),
                });
            }
        } catch {
            // Offline resilience: silent fallback without blocking UI
        }
    }

    // Get the Pit Stop 
    const pitStop = activeOrder
        ? PIT_STOPS.find((stop) => stop.id === activeOrder.pitStopId)
        : null;

    return (
        <div className="min-h-screen bg-[var(--color-page-background)] flex flex-col">
            {/* Top Segmented Control: [ Active Order | Order History ] */}
            <div className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
                <div className="flex rounded-xl bg-neutral-100 p-1 border border-neutral-300">
                    <button
                        type="button"
                        onClick={() => setActiveTab("active")}
                        className={`flex-1 py-2 text-center rounded-lg font-display font-black text-xs uppercase tracking-wider transition-all ${
                            activeTab === "active"
                                ? "bg-[var(--color-brand-primary)] text-white shadow-sm"
                                : "text-neutral-700 hover:text-neutral-900 font-bold"
                        }`}
                    >
                        Active Order
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("history")}
                        className={`flex-1 py-2 text-center rounded-lg font-display font-black text-xs uppercase tracking-wider transition-all ${
                            activeTab === "history"
                                ? "bg-[var(--color-brand-primary)] text-white shadow-sm"
                                : "text-neutral-700 hover:text-neutral-900 font-bold"
                        }`}
                    >
                        Order History
                    </button>
                </div>
            </div>

            {/* Tab Body */}
            {activeTab === "history" ? (
                <OrderHistoryView ticketCode={activeTicketCode || "GP-3820-X"} />
            ) : !activeOrder || !pitStop ? (
                <section className="flex h-[calc(100dvh-var(--app-header-height)-var(--bottom-nav-height)-60px)] w-full items-center justify-center px-8">
                    <CollectEmptyState />
                </section>
            ) : activeOrder.status === COLLECT_STATUS.RECEIVED || activeOrder.status === COLLECT_STATUS.PREPARING ? (
                <div>
                    <DemoOrderLifecycle />
                    <CollectProgressState order={activeOrder} pitStop={pitStop} />
                </div>
            ) : activeOrder.status === COLLECT_STATUS.READY ? (
                <CollectReadyState
                    order={activeOrder}
                    pitStop={pitStop}
                    onCollected={() => handleOrderCollected(activeOrder)}
                />
            ) : activeOrder.status === COLLECT_STATUS.COMPLETED ? (
                <CollectCompleteState order={activeOrder} />
            ) : (
                <section className="flex h-[calc(100dvh-var(--app-header-height)-var(--bottom-nav-height)-60px)] w-full items-center justify-center px-8">
                    <CollectEmptyState />
                </section>
            )}
        </div>
    );
}
