"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { useRewards } from "./RewardsProvider";
import { useDemoMode } from "@/components/DemoProvider";
import { REDEEM_REWARDS, REWARD_BADGES, RedeemReward } from "@/data/rewardsConstantData";
import { CHECKOUT_VOUCHERS } from "@/data/checkoutConstantData";
import { Icon } from "@/components/ui/Icon";
import { Button, Notice, Pill, Sheet } from "@/components/ui/kit";

type Tab = "spend" | "badges" | "vouchers";

const DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function sentence(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function CodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked; the code is on screen.
        }
      }}
      className="inline-flex items-center gap-2 rounded-[var(--radius-s)] border border-dashed border-ink px-3 py-1.5 font-display text-[18px] font-bold tracking-wide"
      aria-label={`Copy code ${code}`}
    >
      {code}
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
    </button>
  );
}

export default function RewardsScreen() {
  const { profile, redeemReward } = useRewards();
  const { demoMode } = useDemoMode();
  const [tab, setTab] = useState<Tab>("spend");
  const [justRedeemed, setJustRedeemed] = useState<{ reward: RedeemReward; code: string } | null>(null);

  const { points, tier } = profile;
  const progress = Math.min(100, Math.round((points / tier.nextTierPoints) * 100));
  const toGo = Math.max(0, tier.nextTierPoints - points);
  const vouchers = profile.history;

  function redeem(reward: RedeemReward) {
    const entry = redeemReward(reward);
    if (entry) setJustRedeemed({ reward, code: entry.voucherCode });
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 pt-5 lg:px-6">
      <h1 className="font-display text-[36px] font-extrabold leading-none lg:text-[44px]">Rewards</h1>

      <section aria-label="Your points" className="mt-5 rounded-[var(--radius-l)] bg-surface p-5 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[15px] text-muted">Your points</p>
            <p className="font-display text-[56px] font-black leading-none tabular">{points.toLocaleString("en-AU")}</p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-semibold">{sentence(tier.current)} tier</p>
            <p className="text-[14px] text-muted">
              {toGo > 0 ? `${toGo.toLocaleString("en-AU")} to ${sentence(tier.next)}` : `${sentence(tier.next)} unlocked`}
            </p>
          </div>
        </div>
        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-sunk"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={tier.nextTierPoints}
          aria-valuenow={points}
          aria-label={`Progress to ${sentence(tier.next)}`}
        >
          <div className="h-full rounded-full bg-ink" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-[14px] text-muted">You earn 2 points for every dollar you spend.</p>
      </section>

      {!demoMode && points === 0 && (
        <div className="mt-4">
          <Notice title="Points are kept on this phone for now">
            Rewards are a prototype: points and vouchers live in this browser, not on your ticket. Turn on Demo Mode in your ticket settings to try them with a starting balance.
          </Notice>
        </div>
      )}

      <div role="tablist" aria-label="Rewards" className="mt-6 inline-flex rounded-full bg-surface p-1">
        {(
          [
            ["spend", "Spend points"],
            ["badges", "Badges"],
            ["vouchers", `Your vouchers${vouchers.length ? ` (${vouchers.length})` : ""}`],
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

      <div className="mt-4" role="tabpanel">
        {tab === "spend" && (
          <ul className="divide-y divide-line rounded-[var(--radius-l)] border border-line bg-surface">
            {REDEEM_REWARDS.map((reward) => {
              const available = reward.voucherId !== null;
              const affordable = points >= reward.pointsCost;
              return (
                <li key={reward.id} className="flex items-center gap-4 p-4">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-m)] bg-hivis-soft text-ink">
                    <Icon icon={reward.icon} width={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold">{reward.name}</p>
                    <p className="text-[14px] text-muted">{reward.description}</p>
                  </div>
                  <div className="shrink-0">
                    {available ? (
                      <Button tone={affordable ? "dark" : "quiet"} disabled={!affordable} onClick={() => redeem(reward)}>
                        {reward.pointsCost.toLocaleString("en-AU")} pts
                      </Button>
                    ) : (
                      <Pill>Coming soon</Pill>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {tab === "badges" && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {REWARD_BADGES.map((badge) => {
              const state = profile.badges.find((b) => b.badgeId === badge.id);
              const earned = Boolean(state?.earned);
              const pct = Math.min(100, Math.round(((state?.progress ?? 0) / badge.target) * 100));
              return (
                <li
                  key={badge.id}
                  className={`rounded-[var(--radius-l)] border p-4 ${earned ? "border-ink bg-surface" : "border-line bg-surface/60"}`}
                >
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
                      earned ? "bg-hivis text-ink" : "bg-sunk text-muted"
                    }`}
                  >
                    <Icon icon={badge.icon} width={20} />
                  </span>
                  <p className="mt-3 text-[15px] font-semibold">{sentence(badge.name)}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">{badge.unlockDescription}</p>
                  {earned ? (
                    <p className="mt-2 text-[13px] font-semibold text-go">Earned</p>
                  ) : (
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunk" aria-label={`${pct}% complete`}>
                      <div className="h-full bg-ink-2" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {tab === "vouchers" &&
          (vouchers.length === 0 ? (
            <p className="py-10 text-center text-[16px] text-muted">Vouchers you redeem appear here with their codes.</p>
          ) : (
            <ul className="divide-y divide-line rounded-[var(--radius-l)] border border-line bg-surface">
              {vouchers.map((v) => {
                const voucher = CHECKOUT_VOUCHERS.find((c) => c.id === v.voucherId);
                return (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-[16px] font-semibold">{voucher?.title ?? v.voucherCode}</p>
                      <p className="text-[13px] text-muted">Redeemed {DATE.format(new Date(v.redeemedAt))}</p>
                    </div>
                    {v.status === "used" ? <Pill>Used</Pill> : <CodeBox code={v.voucherCode} />}
                  </li>
                );
              })}
            </ul>
          ))}
      </div>

      <Sheet open={Boolean(justRedeemed)} onClose={() => setJustRedeemed(null)} title="Voucher ready">
        {justRedeemed && (
          <div className="space-y-4 px-5 py-5">
            <p className="text-[16px]">
              <span className="font-semibold">{justRedeemed.reward.name}</span> is yours. Enter this code at checkout:
            </p>
            <CodeBox code={justRedeemed.code} />
            <Link
              href={`/checkout?voucher=${encodeURIComponent(justRedeemed.code)}`}
              onClick={() => setJustRedeemed(null)}
              className="flex h-12 items-center justify-center rounded-[var(--radius-m)] bg-hivis text-[16px] font-semibold text-ink"
            >
              Use it on my order
            </Link>
          </div>
        )}
      </Sheet>
    </div>
  );
}
