"use client";

import { useEffect } from "react";
import { useDemoMode } from "@/components/DemoProvider";
import { useOrder } from "@/components/order/OrderProvider";
import { COLLECT_STATUS, CollectStatus } from "@/data/collectConstantData";
import { DEMO_ORDER_STATUS_DELAY_MS } from "@/data/demoConstantData";

export default function DemoOrderLifecycle() {
    const { demoMode } = useDemoMode();
    const { activeOrder, updateActiveOrderStatus } = useOrder();

    // 1. Real Backend Status Polling
    useEffect(() => {
        if (!activeOrder?.reference) return;

        const pollStatus = async () => {
            try {
                const res = await fetch(`/api/orders/${activeOrder.reference}/status`);
                const data = await res.json();
                if (data.success && data.data) {
                    const serverStatus = data.data.status;
                    if (serverStatus === 'READY_FOR_PICKUP' && activeOrder.status !== COLLECT_STATUS.READY) {
                        updateActiveOrderStatus(COLLECT_STATUS.READY);
                    } else if (serverStatus === 'COMPLETED' && activeOrder.status !== COLLECT_STATUS.COMPLETED) {
                        updateActiveOrderStatus(COLLECT_STATUS.COMPLETED);
                    }
                }
            } catch {
                // Ignore network polling hiccups
            }
        };

        const interval = setInterval(pollStatus, 2500);
        return () => clearInterval(interval);
    }, [activeOrder?.reference, activeOrder?.status, updateActiveOrderStatus]);

    // 2. Demo Mode automated progression fallback
    useEffect(() => {
        if (!demoMode || !activeOrder) return;

        let nextStatus: CollectStatus | null = null;

        if (activeOrder.status === COLLECT_STATUS.RECEIVED) {
            nextStatus = COLLECT_STATUS.PREPARING;
        } else if (activeOrder.status === COLLECT_STATUS.PREPARING) {
            nextStatus = COLLECT_STATUS.READY;
        }

        if (!nextStatus) return;

        const timer = window.setTimeout(() => {
            updateActiveOrderStatus(nextStatus);
        }, DEMO_ORDER_STATUS_DELAY_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [demoMode, activeOrder, updateActiveOrderStatus]);

    return null;
}
