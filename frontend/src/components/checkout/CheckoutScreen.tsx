"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";
import { useOrder } from "@/context/OrderContext";
import { useDemoMode } from "@/components/DemoProvider";
import { useRewards } from "@/components/reward/RewardsProvider";
import { useShell } from "@/components/shell/ShellContext";
import { useOrderPricing } from "@/lib/useOrderPricing";
import { CATALOG_BY_ID } from "@/data/catalog";
import CartLines from "@/components/cart/CartLines";
import PriceRows from "@/components/cart/PriceRows";
import { PickupLine } from "@/components/cart/CartPanel";
import { Button, money, Notice, Switch } from "@/components/ui/kit";

type StockConflict = { itemId: string; name: string; available: number };

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b border-line py-5 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[18px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { demoMode } = useDemoMode();
  const { markVoucherUsed } = useRewards();
  const { setPodPickerOpen } = useShell();
  const { cartLines, totalItems, selectedPitStopId, activeTicketCode, placeOrder, setQuantity } = useOrder();

  // A voucher redeemed in Rewards arrives as ?voucher=CODE.
  const params = useSearchParams();
  const [voucherInput, setVoucherInput] = useState(() => (params.get("voucher") ?? "").slice(0, 32).toUpperCase());
  const [voucherCode, setVoucherCode] = useState<string | undefined>();
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [isGroupOrder, setIsGroupOrder] = useState(false);
  const [seatNote, setSeatNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<StockConflict[]>([]);

  const pricing = useOrderPricing(voucherCode);
  const preview = useOrderPricing(voucherInput.trim().toUpperCase() || undefined);
  const hasAlcohol = cartLines.some((l) => CATALOG_BY_ID.get(l.itemId)?.isAlcoholic);

  function applyVoucher(e: FormEvent) {
    e.preventDefault();
    const code = voucherInput.trim().toUpperCase();
    if (!code) return;
    if (!preview.voucherValid) {
      setVoucherError(`${code} is not a valid code for this order. Your vouchers are in Rewards.`);
      return;
    }
    setVoucherCode(code);
    setVoucherError(null);
  }

  function adjustToStock() {
    for (const c of conflicts) {
      const lines = cartLines.filter((l) => l.itemId === c.itemId);
      let remaining = c.available;
      for (const line of lines) {
        const keep = Math.max(0, Math.min(line.quantity, remaining));
        setQuantity(line.key, keep);
        remaining -= keep;
      }
    }
    setConflicts([]);
  }

  async function submit() {
    if (!selectedPitStopId || totalItems === 0 || submitting) return;
    setSubmitting(true);
    setOrderError(null);
    setConflicts([]);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartLines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            ...(l.optionIds.length ? { options: l.optionIds } : {}),
          })),
          stationId: selectedPitStopId,
          ticketCode: activeTicketCode,
          promoCode: voucherCode,
          isGroupOrder,
          seatNote: isGroupOrder && seatNote.trim() ? seatNote.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.status === 409 && data?.code === "INSUFFICIENT_STOCK") {
        const available = (data.availableStock ?? {}) as Record<string, number>;
        setConflicts(
          Object.entries(available).map(([itemId, n]) => ({
            itemId,
            name: CATALOG_BY_ID.get(itemId)?.name ?? itemId,
            available: Number(n),
          }))
        );
        return;
      }

      if (res.ok && data?.success && data.order) {
        // Payment is simulated: this marks the order as paid. It proves
        // ownership with the order's PIN, exactly as a real provider callback
        // would be tied to the order.
        await fetch("/api/payment/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": data.order.orderId },
          body: JSON.stringify({
            orderId: data.order.orderId,
            amount: data.order.total,
            method: "credit_card",
            pinCode: data.order.pinCode,
          }),
        }).catch(() => undefined);

        placeOrder({
          totalPaid: data.order.total,
          rewardPoints: data.order.loyaltyPointsEarned,
          reference: data.order.orderId,
          collectionCode: data.order.pinCode,
          qrPayload: data.order.qrPayload,
          lockerNumber: data.order.counterNumber,
        });
        if (voucherCode) markVoucherUsed(voucherCode);
        router.push("/collect");
        return;
      }

      setOrderError(
        typeof data?.error === "string" && res.status < 500
          ? data.error
          : "The order was not placed because the server did not respond properly. Try again in a moment."
      );
    } catch {
      if (!demoMode) {
        setOrderError("You are offline, so the order was not placed. It will go through once you reconnect and try again.");
        return;
      }
      // Demo Mode with no connection: a local, simulated order so the flow
      // can still be shown. It never reaches the kitchen.
      const order = placeOrder({
        totalPaid: pricing.total,
        rewardPoints: pricing.loyaltyPointsEarned,
        isLocalDemo: true,
      });
      if (order) {
        if (voucherCode) markVoucherUsed(voucherCode);
        router.push("/collect");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (totalItems === 0) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center">
        <h1 className="font-display text-[34px] font-extrabold">Nothing to check out</h1>
        <p className="mt-2 text-[16px] text-muted">Your order is empty. Pick something from the menu first.</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-12 items-center rounded-[var(--radius-m)] bg-hivis px-6 text-[16px] font-semibold text-ink"
        >
          Browse the menu
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
      <div className="pb-2 pt-5">
        <Link href="/" className="inline-flex items-center gap-1 text-[15px] font-medium text-muted hover:text-ink">
          <ArrowLeft size={16} aria-hidden /> Menu
        </Link>
        <h1 className="mt-2 font-display text-[36px] font-extrabold leading-none lg:text-[44px]">Checkout</h1>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <div>
          {orderError && (
            <div className="mt-4">
              <Notice tone="stop" title="Order not placed">
                {orderError}
              </Notice>
            </div>
          )}
          {conflicts.length > 0 && (
            <div className="mt-4">
              <Notice
                tone="caution"
                title="Some items sold out while you were ordering"
                action={
                  <Button tone="dark" onClick={adjustToStock}>
                    Update my order
                  </Button>
                }
              >
                <ul className="list-disc pl-5">
                  {conflicts.map((c) => (
                    <li key={c.itemId}>
                      {c.name}: {c.available === 0 ? "none left" : `only ${c.available} left`}
                    </li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}

          <Section title="Pickup">
            <PickupLine onChange={() => setPodPickerOpen(true)} />
            <p className="mt-3 text-[14px] text-muted">
              Keep this page handy: it shows when your locker is ready, and you open the locker with a QR code or PIN.
            </p>
          </Section>

          <Section
            title={`Items (${totalItems})`}
            aside={
              <Link href="/" className="text-[14px] font-semibold underline underline-offset-2">
                Add more
              </Link>
            }
          >
            <CartLines />
            {hasAlcohol && (
              <p className="mt-2 rounded-[var(--radius-s)] bg-sunk px-3 py-2 text-[14px] text-ink-2">
                Your order includes alcohol. Staff check photo ID at the locker before it opens.
              </p>
            )}
          </Section>

          <Section title="Collecting for your row?">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[15px] text-ink-2">
                One person collects for the group. Add your seats so staff can help if you get stuck.
              </p>
              <Switch label="Group order" checked={isGroupOrder} onChange={setIsGroupOrder} />
            </div>
            {isGroupOrder && (
              <div className="mt-3">
                <label htmlFor="seat-note" className="mb-1 block text-[14px] font-medium">
                  Seats (optional)
                </label>
                <input
                  id="seat-note"
                  value={seatNote}
                  maxLength={200}
                  onChange={(e) => setSeatNote(e.target.value)}
                  placeholder="e.g. Clark stand, row H, seats 14 to 16"
                  className="h-11 w-full rounded-[var(--radius-m)] border border-line-strong bg-surface px-3 text-[15px] placeholder:text-muted focus:border-ink focus:outline-none"
                />
              </div>
            )}
          </Section>

          <Section title="Voucher">
            {voucherCode ? (
              <div className="flex items-center justify-between rounded-[var(--radius-m)] bg-go-soft px-4 py-3">
                <p className="text-[15px] text-go">
                  <span className="font-semibold">{voucherCode}</span> applied, saving {money(pricing.voucherDiscount)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setVoucherCode(undefined);
                    setVoucherInput("");
                  }}
                  className="text-[14px] font-semibold underline underline-offset-2"
                >
                  Remove
                </button>
              </div>
            ) : (
              <form onSubmit={applyVoucher} className="flex gap-2">
                <label htmlFor="voucher" className="sr-only">
                  Voucher code
                </label>
                <input
                  id="voucher"
                  value={voucherInput}
                  onChange={(e) => {
                    setVoucherInput(e.target.value);
                    setVoucherError(null);
                  }}
                  placeholder="Voucher code"
                  autoComplete="off"
                  aria-invalid={Boolean(voucherError)}
                  aria-describedby={voucherError ? "voucher-error" : undefined}
                  className="h-11 min-w-0 flex-1 rounded-[var(--radius-m)] border border-line-strong bg-surface px-3 text-[15px] uppercase placeholder:normal-case placeholder:text-muted focus:border-ink focus:outline-none"
                />
                <Button tone="quiet" type="submit" disabled={!voucherInput.trim()}>
                  Apply
                </Button>
              </form>
            )}
            {voucherError && (
              <p id="voucher-error" className="mt-2 text-[14px] text-stop">
                {voucherError}
              </p>
            )}
            {pricing.dynamicYieldDiscount === 0 && voucherCode && pricing.voucherDiscount > 0 && (
              <p className="mt-2 text-[13px] text-muted">Percentage vouchers replace the race-flag discount.</p>
            )}
          </Section>
        </div>

        <aside className="lg:pt-5">
          <div className="space-y-4 rounded-[var(--radius-l)] border border-line bg-surface p-5 lg:sticky lg:top-[calc(var(--app-header-height)+24px)]">
            <PriceRows pricing={pricing} voucherCode={voucherCode} showPoints />
            <div className="flex items-start gap-3 rounded-[var(--radius-m)] bg-sunk px-3 py-3">
              <CreditCard size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              <p className="text-[14px] leading-snug text-ink-2">
                <span className="font-semibold text-ink">Payment is simulated.</span> No card is charged; placing the order marks it as paid.
              </p>
            </div>
            <Button size="l" block onClick={submit} disabled={submitting || conflicts.length > 0} className="justify-between">
              <span>{submitting ? "Placing order…" : "Place order"}</span>
              <span className="font-display text-[21px] font-extrabold tabular">{money(pricing.total)}</span>
            </Button>
            {demoMode && (
              <p className="text-center text-[13px] text-muted">
                Demo Mode is on: the kitchen steps run on a timer.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
