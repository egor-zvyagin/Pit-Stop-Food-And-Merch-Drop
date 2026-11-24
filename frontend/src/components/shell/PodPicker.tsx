"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useOrder } from "@/context/OrderContext";
import { useLiveData, LivePod } from "@/context/LiveDataContext";
import { Pill, Sheet } from "@/components/ui/kit";
import { useShell } from "./ShellContext";
import type { PitStopId } from "@/data/pitStopConstantData";

export function queueTone(queueMins: number): "go" | "caution" | "stop" {
  if (queueMins <= 4) return "go";
  if (queueMins <= 9) return "caution";
  return "stop";
}

export const QUEUE_TEXT = { go: "text-go", caution: "text-caution", stop: "text-stop" } as const;

export function PodRow({
  pod,
  selected,
  onSelect,
}: {
  pod: LivePod;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-[var(--radius-m)] border px-3 py-3 text-left transition-colors ${
        selected ? "border-ink bg-hivis-soft" : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-s)] bg-ink font-display text-[19px] font-bold text-hivis">
        {pod.id}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-2">
          <span className="text-[16px] font-semibold">{pod.label}</span>
          {pod.isFastest && <Pill tone="hivis">Quickest</Pill>}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{pod.area}</span>
      </span>
      <span className="shrink-0 text-right leading-tight">
        <span className="block font-display text-[22px] font-extrabold tabular">{pod.totalMins} min</span>
        <span className="block text-[12px] text-muted">
          {pod.walkMins} walk + <span className={`font-semibold ${QUEUE_TEXT[queueTone(pod.queueMins)]}`}>{pod.queueMins} queue</span>
        </span>
      </span>
      {selected && <Check size={18} className="shrink-0" aria-label="Selected" />}
    </button>
  );
}

export default function PodPicker() {
  const { podPickerOpen, setPodPickerOpen } = useShell();
  const { selectedPitStopId, setSelectedPitStopId } = useOrder();
  const { pods } = useLiveData();
  const sorted = [...pods].sort((a, b) => a.totalMins - b.totalMins);

  return (
    <Sheet open={podPickerOpen} onClose={() => setPodPickerOpen(false)} title="Choose a pickup pod">
      <div className="space-y-2 px-5 py-4">
        <p className="pb-1 text-[14px] text-muted">
          Times are your walk from the stand plus the current queue, quickest first.
        </p>
        {sorted.map((pod) => (
          <PodRow
            key={pod.id}
            pod={pod}
            selected={pod.id === selectedPitStopId}
            onSelect={() => {
              setSelectedPitStopId(pod.id as PitStopId);
              setPodPickerOpen(false);
            }}
          />
        ))}
        <Link
          href="/map"
          onClick={() => setPodPickerOpen(false)}
          className="block pt-2 text-center text-[15px] font-semibold underline underline-offset-2"
        >
          See pods on the circuit map
        </Link>
      </div>
    </Sheet>
  );
}
