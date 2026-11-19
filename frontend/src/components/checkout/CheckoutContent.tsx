"use client";

import { useState, useCallback } from "react";
import { useOrder } from "@/components/order/OrderProvider";

import ChangePitStopPopup from "@/components/popUp/ChangePitStopPopup";
import {
    CHECKOUT_VOUCHERS,
    CheckoutVoucherData,
    REWARD_POINT_MULTIPLIER,
    SERVICE_FEES_ITEMS,
    SERVICE_FEES_ZERO_ITEMS
} from "@/data/checkoutConstantData";

import CheckoutVoucher from "./CheckoutVoucher";
import CheckoutPriceBreakdown from "./CheckoutPriceBreakdown";
import CheckoutRewards from "./CheckoutRewards";
import CheckoutBottomBar from "./CheckoutBottomBar";
import CheckoutCollectionPoint from "./CheckoutCollectionPoint";
import CheckoutItems from "./CheckoutItems";
import CircuitFlagBanner from "@/components/home/CircuitFlagBanner";
import { useRewards } from "../reward/RewardsProvider";
import { useRouter } from "next/navigation";
import { useDemoMode } from "../DemoProvider";
import { Icon } from "@iconify/react";
import type { CircuitState } from "@/lib/types";
import { calculateOrderPricing } from "@/lib/pricing";

interface StockConflictItem {
    itemId: string;
    name: string;
    requested: number;
    available: number;
}

export default function CheckoutContent() {
    const router = useRouter();
    const { demoMode } = useDemoMode();
    const { markVoucherUsed } = useRewards();

    const [changePitStopOpen, setChangePitStopOpen] = useState(false);
    const [voucherCode, setVoucherCode] = useState("");
    const [appliedVoucher, setAppliedVoucher] = useState<CheckoutVoucherData | null>(null);
    const [voucherInvalid, setVoucherInvalid] = useState(false);

    // Live circuit state
    const [circuitState, setCircuitState] = useState<CircuitState | null>(null);

    // Group Order
    const [isGroupOrder, setIsGroupOrder] = useState(false);
    const [seatNote, setSeatNote] = useState("");

    // 409 conflict recovery
    const [stockConflicts, setStockConflicts] = useState<StockConflictItem[]>([]);

    const {
        selectedPitStop,
        selectedPitStopId,
        setSelectedPitStopId,
        quantities,
        totalItems,
        totalPrice,
        placeOrder,
        activeTicketCode,
        setQuantity,
    } = useOrder();

    // Service Fees
    const serviceFee = totalItems > 0 ? SERVICE_FEES_ITEMS : SERVICE_FEES_ZERO_ITEMS;

    // Discount supplied by the currently applied voucher.
    const voucherDiscount =
        appliedVoucher?.effect.type === "discount"
            ? appliedVoucher.effect.amount
            : 0;

    // Complimentary item supplied by the currently applied voucher.
    const freeItemId =
        appliedVoucher?.effect.type === "freeItem"
            ? appliedVoucher.effect.itemId
            : null;

    // Live pricing via calculateOrderPricing with active circuit state
    const circuitFlag = circuitState?.flag ?? "GREEN_FLAG";
    const orderItems = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity }));

    const livePricing = orderItems.length > 0
        ? calculateOrderPricing(orderItems, appliedVoucher?.code, circuitFlag)
        : null;

    const liveSubtotal = livePricing?.subtotal ?? totalPrice;
    const liveDynamicDiscount = livePricing?.dynamicYieldDiscount ?? 0;
    const liveVoucherDiscount = livePricing?.voucherDiscount ?? voucherDiscount;
    const liveServiceFee = livePricing?.serviceFee ?? serviceFee;
    const liveTotal = livePricing?.total ?? (liveSubtotal + liveServiceFee - liveDynamicDiscount - liveVoucherDiscount);
    const totalBeforeVoucher = liveSubtotal + liveServiceFee;

    const rewardPoints = Math.round(totalBeforeVoucher * REWARD_POINT_MULTIPLIER);

    // Handle circuit state changes from banner
    const handleCircuitStateChange = useCallback((state: CircuitState) => {
        setCircuitState(state);
    }, []);

    // Adjust cart to available stock (409 recovery)
    const handleAdjustCartToStock = useCallback(() => {
        for (const conflict of stockConflicts) {
            setQuantity(conflict.itemId, conflict.available);
        }
        setStockConflicts([]);
    }, [stockConflicts, setQuantity]);

    async function handlePlaceOrder() {
        if (!selectedPitStopId || totalItems === 0) return;

        try {
            const itemsToOrder = Object.entries(quantities)
                .filter(([, qty]) => qty > 0)
                .map(([itemId, qty]) => ({
                    itemId,
                    name: itemId.toUpperCase().replace(/-/g, " "),
                    quantity: qty,
                    unitPrice: Number((totalPrice / totalItems).toFixed(2)),
                }));

            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: itemsToOrder,
                    stationId: selectedPitStopId,
                    ticketCode: activeTicketCode || "GP-3820-X",
                    promoCode: appliedVoucher?.code,
                    circuitStatus: circuitFlag,
                    isGroupOrder,
                    seatNote: isGroupOrder ? seatNote : undefined,
                }),
            });

            // Handle 409 Conflict — INSUFFICIENT_STOCK
            if (res.status === 409) {
                const data = await res.json();
                if (data.code === "INSUFFICIENT_STOCK" && Array.isArray(data.conflicts)) {
                    setStockConflicts(data.conflicts as StockConflictItem[]);
                } else if (data.availableStock) {
                    // Single item conflict
                    const conflicts: StockConflictItem[] = Object.entries(
                        data.availableStock as Record<string, number>
                    ).map(([itemId, available]) => ({
                        itemId,
                        name: itemId.toUpperCase().replace(/-/g, " "),
                        requested: quantities[itemId] ?? 0,
                        available: available as number,
                    }));
                    setStockConflicts(conflicts);
                }
                return;
            }

            const data = await res.json();

            if (data.success && data.order) {
                placeOrder({
                    totalPaid: data.order.total,
                    rewardPoints: data.order.loyaltyPointsEarned,
                    freeItemId,
                    reference: data.order.orderId,
                    collectionCode: data.order.pinCode,
                    qrPayload: data.order.qrPayload,
                    lockerNumber: data.order.counterNumber,
                });

                if (appliedVoucher) {
                    markVoucherUsed(appliedVoucher.code);
                }
                router.push("/collect");
                return;
            }
        } catch (err) {
            console.warn("API order creation error, using fallback:", err);
        }

        // Local fallback
        const order = placeOrder({
            totalPaid: liveTotal,
            rewardPoints,
            freeItemId,
        });

        if (!order) return;

        if (appliedVoucher) {
            markVoucherUsed(appliedVoucher.code);
        }
        router.push("/collect");
    }

    function handleVoucherCodeChange(value: string) {
        setVoucherCode(value);
        if (voucherInvalid) setVoucherInvalid(false);
    }

    function handleApplyVoucher() {
        const normalizedCode = voucherCode.trim().toUpperCase();
        const voucher = CHECKOUT_VOUCHERS.find((item) => item.code === normalizedCode);
        if (!voucher) {
            setAppliedVoucher(null);
            setVoucherInvalid(true);
            return;
        }
        setAppliedVoucher(voucher);
        setVoucherInvalid(false);
    }

    function handleRemoveVoucher() {
        setAppliedVoucher(null);
        setVoucherCode("");
        setVoucherInvalid(false);
    }

    return (
        <main className="min-h-screen bg-[var(--color-page-background)]">
            {/* Checkout content */}
            <div className="flex flex-col gap-3 px-4 pb-[170px] pt-4">

                {/* Live Circuit Banner */}
                <CircuitFlagBanner compact onStateChange={handleCircuitStateChange} />

                {/* 409 Stock Conflict Alert */}
                {stockConflicts.length > 0 && (
                    <div className="rounded-xl border-2 border-red-500 bg-red-950/50 px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Icon icon="ph:warning-fill" width={20} height={20} className="text-red-400 shrink-0" />
                            <span className="font-display font-black text-[13px] text-red-300 uppercase tracking-wider">
                                Stock Conflict
                            </span>
                        </div>
                        <p className="text-[12px] text-red-200 mb-2">
                            Some items in your cart ran low or sold out. Please adjust:
                        </p>
                        <ul className="mb-3 space-y-1">
                            {stockConflicts.map((c) => (
                                <li key={c.itemId} className="text-[12px] text-red-100">
                                    <span className="font-bold">{c.name}</span>:{" "}
                                    requested {c.requested}, only{" "}
                                    <span className="font-bold text-amber-300">{c.available} left</span>
                                </li>
                            ))}
                        </ul>
                        <button
                            type="button"
                            onClick={handleAdjustCartToStock}
                            className="w-full rounded-lg bg-red-600 hover:bg-red-700 py-2 px-4 text-white font-display font-black text-[13px] tracking-wider uppercase transition-colors"
                        >
                            Adjust Cart to Available Stock
                        </button>
                    </div>
                )}

                <CheckoutCollectionPoint
                    pitStop={selectedPitStop}
                    onChange={() => setChangePitStopOpen(true)}
                />

                <CheckoutItems quantities={quantities} freeItemId={freeItemId} />

                <CheckoutVoucher
                    voucherCode={voucherCode}
                    appliedVoucher={appliedVoucher}
                    invalid={voucherInvalid}
                    onCodeChange={handleVoucherCodeChange}
                    onApply={handleApplyVoucher}
                    onRemove={handleRemoveVoucher}
                />

                <CheckoutPriceBreakdown
                    subtotal={liveSubtotal}
                    serviceFee={liveServiceFee}
                    dynamicDiscount={liveDynamicDiscount}
                    voucherDiscount={liveVoucherDiscount}
                    voucherLabel={
                        appliedVoucher?.effect.type === "discount"
                            ? appliedVoucher.title
                            : undefined
                    }
                    total={liveTotal}
                    circuitFlag={circuitFlag}
                />

                <CheckoutRewards points={totalItems > 0 ? rewardPoints : 0} />

                {/* Group Order Toggle */}
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Icon icon="ph:users-three-bold" width={18} height={18} className="text-[var(--color-brand-primary)] shrink-0" />
                            <span className="text-[13px] font-display font-bold text-white">
                                Group Order (1 Collector for Row)
                            </span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-label="Group Order"
                            aria-checked={isGroupOrder}
                            onClick={() => setIsGroupOrder((v) => !v)}
                            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors focus-visible:outline-none ${
                                isGroupOrder
                                    ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]"
                                    : "border-[var(--color-border)] bg-[var(--color-page-background)]"
                            }`}
                        >
                            <span
                                className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                                    isGroupOrder ? "translate-x-5" : "translate-x-0.5"
                                }`}
                            />
                        </button>
                    </div>
                    {isGroupOrder && (
                        <div className="mt-3">
                            <label className="block text-[11px] text-[var(--color-text-muted)] mb-1 uppercase tracking-wider font-bold">
                                Seat / Row Note (optional)
                            </label>
                            <input
                                type="text"
                                value={seatNote}
                                onChange={(e) => setSeatNote(e.target.value)}
                                placeholder="e.g. Clark Stand Row H, Seats 14-16"
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-page-background)] px-3 py-2 text-[13px] text-white placeholder-[var(--color-text-muted)] focus:border-[var(--color-brand-primary)] focus:outline-none"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Checkout action */}
            <CheckoutBottomBar
                totalItems={totalItems}
                total={liveTotal}
                hasPitStop={selectedPitStopId !== null}
                demoMode={demoMode}
                onPlaceOrder={handlePlaceOrder}
            />

            {/* Pit Stop popup */}
            <ChangePitStopPopup
                isOpen={changePitStopOpen}
                selectedPitStopId={selectedPitStopId}
                onSelect={setSelectedPitStopId}
                onClose={() => setChangePitStopOpen(false)}
            />
        </main>
    );
}
