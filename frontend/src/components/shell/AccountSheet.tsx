"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrder, DEMO_TICKETS } from "@/context/OrderContext";
import { useDemoMode } from "@/components/DemoProvider";
import { useRewards } from "@/components/reward/RewardsProvider";
import { Button, Sheet, Switch } from "@/components/ui/kit";
import { useShell } from "./ShellContext";

/** Ticket, seat and app settings. */
export default function AccountSheet() {
  const router = useRouter();
  const { accountOpen, setAccountOpen } = useShell();
  const { ticketProfile, activeTicketCode, switchTicket, resetOrderState } = useOrder();
  const { demoMode, setDemoMode } = useDemoMode();
  const { seedDemoRewards, resetDemoRewards } = useRewards();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setAccountOpen(false);
    setMessage(null);
  };

  async function applyTicket(next: string) {
    setBusy(true);
    const ok = await switchTicket(next);
    setBusy(false);
    setMessage(ok ? `Now using ticket ${next.toUpperCase()}` : "That ticket code was not recognised.");
    if (ok) setCode("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.trim()) void applyTicket(code.trim());
  }

  const area = ticketProfile?.viewingArea;

  return (
    <Sheet open={accountOpen} onClose={close} title="Your ticket" side="right">
      <div className="space-y-6 px-5 py-5">
        {/* Ticket */}
        <section aria-label="Current ticket" className="overflow-hidden rounded-[var(--radius-l)] bg-ink text-white">
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <p className="text-[13px] text-white/70">{ticketProfile?.ticketType}</p>
              <p className="mt-0.5 text-[20px] font-semibold">{ticketProfile?.holderName}</p>
            </div>
            <span className="rounded-[var(--radius-s)] bg-hivis px-2 py-1 font-display text-[16px] font-bold tracking-wide text-ink">
              {activeTicketCode}
            </span>
          </div>
          {area && (
            <dl className="mt-4 grid grid-cols-2 gap-px bg-white/15 text-[14px]">
              {[
                ["Stand", area.grandstand],
                ["Seat", area.seat],
                ["Nearest gate", area.nearestGate],
                ["Reward points", ticketProfile?.loyaltyPoints?.toLocaleString("en-AU") ?? "0"],
              ].map(([k, v]) => (
                <div key={k} className="bg-ink px-5 py-3">
                  <dt className="text-[12px] text-white/60">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {/* Switch ticket */}
        <section className="space-y-3">
          <h3 className="text-[16px] font-semibold">Use a different ticket</h3>
          <form onSubmit={onSubmit} className="flex gap-2">
            <label htmlFor="ticket-code" className="sr-only">
              Ticket code
            </label>
            <input
              id="ticket-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ticket code, e.g. GP-9014-P"
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-[var(--radius-m)] border border-line-strong bg-surface px-3 text-[15px] uppercase placeholder:normal-case placeholder:text-muted focus:border-ink focus:outline-none"
            />
            <Button tone="dark" type="submit" disabled={busy || !code.trim()}>
              Use ticket
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {Object.values(DEMO_TICKETS).map((t) => (
              <button
                key={t.ticketCode}
                type="button"
                onClick={() => void applyTicket(t.ticketCode)}
                aria-pressed={t.ticketCode === activeTicketCode}
                className={`rounded-full border px-3 py-1.5 text-[14px] ${
                  t.ticketCode === activeTicketCode ? "border-ink bg-ink text-white" : "border-line-strong hover:bg-sunk"
                }`}
              >
                {t.holderName}, {t.viewingArea.grandstand.replace(" (VIP)", "")}
              </button>
            ))}
          </div>
          {message && (
            <p role="status" className="text-[14px] text-ink-2">
              {message}
            </p>
          )}
          <p className="text-[13px] leading-snug text-muted">
            Ticket checks are simulated. The two sample tickets above have seats; any other code starting with GP- works as general admission.
          </p>
        </section>

        {/* Settings */}
        <section className="space-y-3 border-t border-line pt-5">
          <h3 className="text-[16px] font-semibold">Settings</h3>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[15px] font-medium">Demo Mode</p>
              <p className="text-[13px] leading-snug text-muted">
                Moves orders through the kitchen on a timer so the whole flow can be shown without staff.
              </p>
            </div>
            <Switch
              label="Demo Mode"
              checked={demoMode}
              onChange={(next) => {
                if (next) seedDemoRewards();
                setDemoMode(next);
              }}
            />
          </div>
          {demoMode && (
            <Button
              tone="quiet"
              block
              onClick={() => {
                resetOrderState();
                resetDemoRewards();
                close();
                router.replace("/");
              }}
            >
              Reset the demo
            </Button>
          )}
          <Link
            href="/vendor"
            onClick={close}
            className="block pt-1 text-[15px] font-semibold underline underline-offset-2"
          >
            Open the staff terminal
          </Link>
        </section>
      </div>
    </Sheet>
  );
}
