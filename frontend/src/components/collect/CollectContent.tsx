"use client";

import { ActiveOrder, useOrder } from "@/components/order/OrderProvider";
import { COLLECT_STATUS } from "@/data/collectConstantData";
import { PIT_STOPS } from "@/data/pitStopConstantData";

import CollectEmptyState from "./CollectEmptyState";
import CollectReadyState from "./CollectReadyState";
import CollectCompleteState from "./CollectCompleteState";
import CollectProgressState from "../order/CollectProgressState";
import DemoOrderLifecycle from "../demo/DemoOrderLifecycle";
import { useDemoMode } from "../DemoProvider";
import { useRewards } from "../reward/RewardsProvider";

export default function CollectContent() {
    const {
        activeOrder,
        updateActiveOrderStatus,
    } = useOrder();

    // demomode
    const { demoMode } = useDemoMode();
    const { awardOrderPoints } = useRewards();

    // No placed order yet.
    if (!activeOrder) {
        return (
            <section
                className="
                    flex
                    h-[calc(100dvh-var(--app-header-height)-var(--bottom-nav-height))]
                    w-full
                    items-center
                    justify-center
                    bg-[var(--color-page-background)]
                    px-8
                "
            >
                <CollectEmptyState />
            </section>
        );
    }

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
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(pin ? { 'X-Order-Pin': String(pin) } : {}),
                    },
                    body: JSON.stringify({ status: 'COMPLETED', pinCode: pin }),
                });
            }
        } catch {
            // Offline resilience: silent fallback without blocking UI
        }
    }

    // Get the Pit Stop 
    const pitStop =
        PIT_STOPS.find(
            (stop) =>
                stop.id ===
                activeOrder.pitStopId
        );

    // Protect against invalid order data.
    if (!pitStop) {
        return (
            <section
                className="
                    flex
                    h-[calc(100dvh-var(--app-header-height)-var(--bottom-nav-height))]
                    w-full
                    items-center
                    justify-center
                    bg-[var(--color-page-background)]
                    px-8
                "
            >
                <CollectEmptyState />
            </section>
        );
    }

    // Received and Preparing share
    if (
        activeOrder.status ===
        COLLECT_STATUS.RECEIVED ||
        activeOrder.status ===
        COLLECT_STATUS.PREPARING
    ) {
        return (
            <div>
                <DemoOrderLifecycle />
                <CollectProgressState
                    order={activeOrder}
                    pitStop={pitStop}
                />
            </div>
        );
    }

    if (
        activeOrder.status ===
        COLLECT_STATUS.READY
    ) {
        return (
            <CollectReadyState
                order={activeOrder}
                pitStop={pitStop}
                onCollected={() => handleOrderCollected(activeOrder)}
            />
        );
    }

    if (
        activeOrder.status ===
        COLLECT_STATUS.COMPLETED
    ) {
        return (
            <CollectCompleteState
                order={activeOrder}
            />
        );
    }

    return null;
}