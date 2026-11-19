import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { QRCodeSVG } from "qrcode.react";

import Button from "@/components/ui/Buttons";
import Card from "@/components/ui/Card";
import Typography from "@/components/ui/Typography";

import CollectItemsCard from "./CollectItemsCard";
import CollectPageHeader from "./CollectPageHeader";
import PodDirectionsPanel from "@/components/pitstop/PodDirectionsPanel";

import type { ActiveOrder } from "@/components/order/OrderProvider";
import type { PitStop } from "@/data/pitStopConstantData";

type CollectReadyStateProps = {
  order: ActiveOrder;
  pitStop: PitStop;
  onCollected: () => void;
};

export default function CollectReadyState({
  order,
  pitStop,
  onCollected,
}: CollectReadyStateProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(240); // 4 min countdown

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const rawCode = order.collectionCode || order.reference.replace('GP-', '') || '8821';
  const fallbackDigits = (rawCode.length >= 4 ? rawCode : '8821').slice(0, 4).split('');
  const qrString = order.qrPayload || `AGPC1.AGPC-2027-KEY-01.DEMO.${order.reference}`;

  return (
    <div className="min-h-[calc(100dvh-var(--app-header-height))] bg-[var(--color-page-background)] pb-[calc(var(--bottom-nav-height)+24px)]">
      <CollectPageHeader
        description={`Show this pass at ${pitStop.name}. Collect your items and get right back to the race!`}
      />

      <div className="flex flex-col gap-[14px] px-4 py-[14px]">
        {/* Ready banner */}
        <Card className="!rounded-[12px] !border-2 !border-[var(--color-status-success)] !bg-[var(--color-status-success-surface)] !px-4 !py-3">
          <div className="flex items-center gap-3">
            <Icon
              icon="ph:check-circle-fill"
              width="24"
              height="24"
              className="text-[var(--color-status-success)] shrink-0"
            />

            <div>
              <Typography
                variant="sectionHeader"
                className="block !text-[16px] !leading-6 !text-[var(--color-status-success-text)] font-display font-black tracking-wider uppercase"
              >
                YOUR ORDER IS READY!
              </Typography>

              <div className="flex items-center gap-1">
                <Icon
                  icon="ph:map-pin"
                  width="11"
                  height="11"
                  className="text-[var(--color-status-success-muted)]"
                />
                <Typography
                  variant="body"
                  className="!text-[12px] !leading-[18px] !text-[var(--color-status-success-muted)]"
                >
                  Collect at {pitStop.name} · {pitStop.distance}
                </Typography>
              </div>
            </div>
          </div>
        </Card>

        {/* Directions to Pod Wayfinding Panel */}
        <PodDirectionsPanel
          podId={pitStop.id}
          podName={pitStop.name}
          lockerNumber={order.lockerNumber || "#04"}
          latitude={pitStop.latitude}
          longitude={pitStop.longitude}
        />

        {/* Dynamic Cryptographic QR Collection Card */}
        <Card className="!rounded-[14px] !px-5 !py-[18px] shadow-card">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <span className="px-2 py-0.5 rounded bg-[var(--color-brand-primary)] text-white font-display font-black text-[10px] tracking-wider uppercase">
              ED25519 VERIFIED PASS
            </span>
            <span className="font-display font-bold text-[12px] text-[var(--color-text-muted)] uppercase">
              Locker Reserved · {formatCountdown(secondsRemaining)}
            </span>
          </div>

          <Typography
            variant="meta"
            className="block text-center tracking-[0.88px] !text-[var(--color-text-muted)] mt-3"
          >
            SCAN AT CONCESSION SCANNER
          </Typography>

          {/* Dynamic QR SVG */}
          <div className="mt-3 flex items-center justify-center">
            <div className="p-3 bg-white rounded-xl border-2 border-black/10 shadow-inner">
              {order.qrPayload ? (
                <QRCodeSVG
                  value={qrString}
                  size={175}
                  level="M"
                  includeMargin={false}
                />
              ) : order.qrCodeSrc ? (
                <Image
                  src={order.qrCodeSrc}
                  alt="Order collection QR code"
                  width={175}
                  height={175}
                />
              ) : (
                <QRCodeSVG
                  value={qrString}
                  size={175}
                  level="M"
                  includeMargin={false}
                />
              )}
            </div>
          </div>

          {/* 4-Box Numeric Fallback */}
          <div className="mt-4 text-center">
            <Typography
              variant="meta"
              className="block tracking-[0.88px] !text-[var(--color-text-muted)] text-[11px]"
            >
              NUMERIC 4-DIGIT FALLBACK
            </Typography>
            <div className="grid grid-cols-4 gap-2 px-6 mt-1.5">
              {fallbackDigits.map((digit, idx) => (
                <div
                  key={idx}
                  className="bg-[var(--color-page-background)] border border-[var(--color-border)] rounded-lg py-2 font-display font-black text-2xl text-[var(--color-text-primary)] tracking-widest shadow-sm"
                >
                  {digit}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
              Present this code at locker counter if camera scan is unavailable.
            </p>
          </div>

          {/* Counter info */}
          <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
            <div>
              <span className="text-[var(--color-text-muted)] block uppercase font-bold text-[10px]">
                Express Locker Counter
              </span>
              <span className="font-display font-black text-lg text-[var(--color-brand-primary)]">
                {order.lockerNumber || '#04'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[var(--color-text-muted)] block uppercase font-bold text-[10px]">
                Order Reference
              </span>
              <span className="font-mono font-bold text-sm text-[var(--color-text-primary)]">
                {order.reference}
              </span>
            </div>
          </div>
        </Card>

        {/* View Fullscreen Pass Screen Button */}
        <Link
          href="/pass"
          className="w-full py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] text-[var(--color-text-primary)] font-display font-bold text-sm tracking-wider uppercase text-center flex items-center justify-center gap-2 transition-colors"
        >
          <Icon icon="ph:arrows-out-simple-bold" width="16" height="16" />
          <span>View Fullscreen Wallet Pass</span>
        </Link>

        {/* Items to collect */}
        <CollectItemsCard order={order} title="ITEMS TO COLLECT" showTotal />

        <Button
          type="button"
          onClick={onCollected}
          className="flex !h-[56px] items-center justify-center gap-2 !rounded-[12px]"
        >
          <Icon icon="ph:check" width="18" height="18" />
          <Typography
            variant="button"
            className="tracking-[0.64px] !text-[var(--color-text-on-primary)]"
          >
            I HAVE COLLECTED MY ORDER
          </Typography>
        </Button>
      </div>
    </div>
  );
}
