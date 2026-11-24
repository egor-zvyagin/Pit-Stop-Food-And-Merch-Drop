/**
 * Pit Stop wordmark: a pit board (the yellow board a crew holds over the
 * wall to signal a driver) next to the name.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-[22%] bg-hivis font-display font-black leading-none text-ink ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.78 }}
    >
      <span style={{ marginTop: size * 0.06 }}>P</span>
    </span>
  );
}

export default function Logo({ inverted = false, size = 32 }: { inverted?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span
        className={`font-display font-extrabold leading-none tracking-[-0.01em] ${inverted ? "text-white" : "text-ink"}`}
        style={{ fontSize: size * 0.82 }}
      >
        Pit Stop
      </span>
    </span>
  );
}
