import type { ReactNode } from "react";

export type BoardStage = "received" | "preparing" | "ready" | "completed";

const STAGES: { id: BoardStage; label: string }[] = [
  { id: "received", label: "Received" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "completed", label: "Collected" },
];

export function stageIndex(stage: string): number {
  const i = STAGES.findIndex((s) => s.id === stage);
  return i === -1 ? 0 : i;
}

/**
 * The pit board: the slate a crew holds over the pit wall to tell a driver
 * what matters right now. Here it tells a fan where to go and what code
 * opens their locker. It is the one loud element in the app.
 */
export default function PitBoard({
  podId,
  podLabel,
  locker,
  code,
  codeLabel = "Pickup PIN",
  stage,
  headline,
  children,
}: {
  podId: string;
  podLabel: string;
  locker?: string;
  /** The code to show large; hidden on public views. */
  code?: string;
  codeLabel?: string;
  stage: string;
  headline: string;
  children?: ReactNode;
}) {
  const current = stageIndex(stage);
  const ready = stage === "ready";

  return (
    <section
      aria-label="Order status"
      className="overflow-hidden rounded-[var(--radius-l)] bg-ink text-white shadow-[0_10px_30px_rgba(29,33,37,0.25)]"
    >
      {/* Rows read like a pit board: position, then the message. */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 border-b border-white/10 px-5 py-3">
        <span className="font-display text-[28px] font-extrabold leading-none text-hivis">{podId}</span>
        <span className="truncate text-[15px] text-white/80">{podLabel}</span>
        {locker && (
          <span className="text-right leading-none">
            <span className="block text-[12px] text-white/60">Locker</span>
            <span className="font-display text-[26px] font-extrabold tabular text-hivis">{locker.replace("#", "")}</span>
          </span>
        )}
      </div>

      {code && (
        <div className="px-5 pb-1 pt-4">
          <p className="text-[13px] text-white/60">{codeLabel}</p>
          <p
            className="font-display text-[88px] font-black leading-[0.9] tracking-[0.04em] text-hivis tabular sm:text-[104px]"
            aria-label={`${codeLabel} ${code.split("").join(" ")}`}
          >
            {code}
          </p>
        </div>
      )}

      <div className="px-5 pb-5 pt-3">
        <p className={`text-[20px] font-semibold leading-snug ${ready ? "text-hivis" : "text-white"}`} role="status" aria-live="polite">
          {headline}
        </p>

        <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Progress">
          {STAGES.map((s, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <li key={s.id} aria-current={now ? "step" : undefined}>
                <span
                  aria-hidden
                  className={`block h-1.5 rounded-full ${
                    done ? "bg-white/70" : now ? (ready || s.id === "completed" ? "bg-hivis" : "bg-hivis animate-pulse") : "bg-white/15"
                  }`}
                />
                <span className={`mt-1.5 block text-[12px] ${now ? "font-semibold text-white" : done ? "text-white/70" : "text-white/40"}`}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {children && <div className="border-t border-white/10 bg-white/[0.04] px-5 py-4">{children}</div>}
    </section>
  );
}
