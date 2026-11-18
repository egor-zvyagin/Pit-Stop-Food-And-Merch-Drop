"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import Typography from "@/components/ui/Typography";
import Image from "next/image";
import { useOrder } from "@/context/OrderContext";

type AppHeaderProps = { onSettingsClick?: () => void };

export default function AppHeader({ onSettingsClick }: AppHeaderProps) {
  const { ticketProfile, activeTicketCode, switchTicket } = useOrder();
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [customTicketInput, setCustomTicketInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectDemo = async (code: string) => {
    setErrorMsg("");
    setSuccessMsg("");
    setIsSubmitting(true);
    await switchTicket(code);
    setIsSubmitting(false);
    setSuccessMsg(`Switched to ${code}`);
    setTimeout(() => {
      setSuccessMsg("");
      setTicketModalOpen(false);
    }, 600);
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTicketInput.trim()) return;

    setErrorMsg("");
    setSuccessMsg("");
    setIsSubmitting(true);
    const success = await switchTicket(customTicketInput.trim().toUpperCase());
    setIsSubmitting(false);

    if (success) {
      setSuccessMsg(`Ticket verified: ${customTicketInput.trim().toUpperCase()}`);
      setCustomTicketInput("");
      setTimeout(() => {
        setSuccessMsg("");
        setTicketModalOpen(false);
      }, 700);
    } else {
      setErrorMsg("Unable to verify ticket. Please try again.");
    }
  };

  return (
    <>
      <header
        className="
          sticky
          top-0
          z-40
          flex
          w-full
          items-center
          justify-between
          border-b
          border-[var(--color-border)]
          bg-[var(--color-surface)]
          px-5
          py-3
        "
      >
        {/* Left section - Pit Stop logo */}
        <div className="flex items-center">
          <Image
            src="/images/PIT_STOP.png"
            alt="Pit Stop - Australian Grand Prix 2026 - RMIT"
            width={210}
            height={70}
            priority
            className="h-auto w-[180px] object-contain"
          />
        </div>

        {/* Right section - Ticket Profile Switcher & Settings */}
        <div className="flex items-center gap-2">
          {/* Interactive Ticket Profile Pill */}
          <button
            type="button"
            onClick={() => {
              setErrorMsg("");
              setSuccessMsg("");
              setTicketModalOpen(true);
            }}
            aria-label="Switch Ticket Profile"
            className="
              flex
              items-center
              gap-[6px]
              rounded-[20px]
              border
              border-[var(--color-border)]
              bg-[var(--color-page-background)]
              hover:border-[var(--color-brand-primary)]
              px-3
              py-[5px]
              transition-all
              group
            "
          >
            <Icon
              icon="ph:ticket-fill"
              width="14"
              height="14"
              className="text-[var(--color-brand-primary)] group-hover:scale-110 transition-transform"
            />

            <Typography
              variant="meta"
              className="text-[12px] font-mono font-bold leading-[18px] text-[var(--color-text-primary)]"
            >
              {activeTicketCode || "GP-3820-X"}
            </Typography>

            <Icon
              icon="ph:caret-down-bold"
              width="10"
              height="10"
              className="text-[var(--color-text-muted)] group-hover:text-[var(--color-brand-primary)]"
            />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={onSettingsClick}
            aria-label="Open settings"
            className="
              flex
              h-8
              w-8
              items-center
              justify-center
              rounded-full
              border
              border-[var(--color-border)]
              bg-[var(--color-page-background)]
              hover:border-[var(--color-brand-primary)]
              transition-colors
            "
          >
            <Icon
              icon="ph:gear-fill"
              width="16"
              height="16"
              className="text-[var(--color-text-muted)]"
            />
          </button>
        </div>
      </header>

      {/* Ticket Profile Modal */}
      {ticketModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div
            className="
              w-full
              max-w-md
              rounded-2xl
              border
              border-[var(--color-border)]
              bg-[var(--color-surface)]
              p-6
              shadow-2xl
              text-pitstop-text
              space-y-5
              relative
            "
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div className="flex items-center gap-2">
                <Icon
                  icon="ph:ticket-fill"
                  width="22"
                  height="22"
                  className="text-[var(--color-brand-primary)]"
                />
                <h3 className="font-display font-black text-lg tracking-wider uppercase text-white">
                  Ticket Profile
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTicketModalOpen(false)}
                className="rounded-full p-1 text-[var(--color-text-muted)] hover:text-white"
                aria-label="Close modal"
              >
                <Icon icon="mdi:close" width="20" height="20" />
              </button>
            </div>

            {/* Active Ticket Card */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-page-background)] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[var(--color-brand-primary)] tracking-wider">
                  ACTIVE TICKET: {ticketProfile?.ticketCode || activeTicketCode}
                </span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-400 border border-emerald-500/30">
                  {ticketProfile?.verified ? "Verified" : "Active"}
                </span>
              </div>

              <div className="text-sm font-bold text-white">
                {ticketProfile?.holderName || "Alex Hamilton"}
              </div>

              <div className="text-xs text-[var(--color-text-muted)]">
                {ticketProfile?.ticketType || "Paddock Club VIP"} • {ticketProfile?.loyaltyTier || "VIP Fan"} ({ticketProfile?.loyaltyPoints?.toLocaleString() ?? "1,850"} pts)
              </div>

              {ticketProfile?.viewingArea && (
                <div className="mt-2 pt-2 border-t border-[var(--color-border)] text-xs text-neutral-400 space-y-1">
                  <div>
                    <span className="font-semibold text-neutral-300">Viewing:</span> {ticketProfile.viewingArea.grandstand} ({ticketProfile.viewingArea.turn})
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-300">Seat:</span> {ticketProfile.viewingArea.seat} • {ticketProfile.viewingArea.nearestGate}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-300">Fastest Pod:</span> Pit Stop {ticketProfile.viewingArea.recommendedDropStation}
                  </div>
                </div>
              )}
            </div>

            {/* Switch to Preset Demo Tickets */}
            <div className="space-y-2">
              <div className="text-xs font-bold tracking-wider uppercase text-[var(--color-text-muted)]">
                Quick Switch Demo Tickets
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectDemo("GP-3820-X")}
                  disabled={isSubmitting}
                  className={`
                    p-3
                    rounded-xl
                    border
                    text-left
                    transition-all
                    ${
                      activeTicketCode === "GP-3820-X"
                        ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]/10"
                        : "border-[var(--color-border)] bg-[var(--color-page-background)] hover:border-neutral-500"
                    }
                  `}
                >
                  <div className="font-mono text-xs font-bold text-white">GP-3820-X</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">Paddock Club VIP</div>
                  <div className="text-[10px] text-amber-400 mt-1 font-semibold">1,850 pts • Turn 9</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectDemo("GP-9014-P")}
                  disabled={isSubmitting}
                  className={`
                    p-3
                    rounded-xl
                    border
                    text-left
                    transition-all
                    ${
                      activeTicketCode === "GP-9014-P"
                        ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]/10"
                        : "border-[var(--color-border)] bg-[var(--color-page-background)] hover:border-neutral-500"
                    }
                  `}
                >
                  <div className="font-mono text-xs font-bold text-white">GP-9014-P</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">Grandstand Pass</div>
                  <div className="text-[10px] text-amber-400 mt-1 font-semibold">720 pts • Turn 11</div>
                </button>
              </div>
            </div>

            {/* Custom Ticket Code Entry */}
            <form onSubmit={handleCustomSubmit} className="space-y-2 pt-1 border-t border-[var(--color-border)]">
              <div className="text-xs font-bold tracking-wider uppercase text-[var(--color-text-muted)]">
                Enter Custom Ticket Reference
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTicketInput}
                  onChange={(e) => setCustomTicketInput(e.target.value.toUpperCase())}
                  placeholder="e.g. GP-5510-T"
                  className="
                    flex-1
                    rounded-xl
                    border
                    border-[var(--color-border)]
                    bg-[var(--color-page-background)]
                    px-3
                    py-2
                    font-mono
                    text-sm
                    uppercase
                    text-white
                    placeholder:text-neutral-600
                    focus:border-[var(--color-brand-primary)]
                    focus:outline-none
                  "
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !customTicketInput.trim()}
                  className="
                    rounded-xl
                    bg-[var(--color-brand-primary)]
                    px-4
                    py-2
                    font-display
                    font-bold
                    text-xs
                    uppercase
                    tracking-wider
                    text-white
                    hover:bg-red-700
                    disabled:opacity-50
                    transition-colors
                  "
                >
                  {isSubmitting ? "Verifying..." : "Apply"}
                </button>
              </div>

              {errorMsg && (
                <p className="text-xs text-red-400 font-semibold mt-1">{errorMsg}</p>
              )}
              {successMsg && (
                <p className="text-xs text-emerald-400 font-semibold mt-1">{successMsg}</p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
