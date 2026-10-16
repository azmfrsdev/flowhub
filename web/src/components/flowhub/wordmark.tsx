import Image from "next/image";
import { cn } from "cn";

/** The dog mark on its own. Decorative: whatever sits next to it carries the meaning. */
export function PupMark({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src="/brand/flowhub-mark-256.png" alt="" aria-hidden="true" width={64} height={64} className={cn("size-7 shrink-0 select-none", className)} priority={priority} />;
}

/** FlowHub wordmark: the dog mark and the name, in the hand of the logo's speech bubble (ADR-0013). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PupMark className="size-8" priority />
      <span className="fh-hand text-2xl leading-none [-webkit-text-stroke:0.025em_currentColor]">FlowHub</span>
    </span>
  );
}

/** The "This is FlowHub" artwork for the public pages: the dog, calm in its room, saying the name. */
export function BrandHero({ className, size = 320 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/brand/flowhub-hero.webp"
      alt="FlowHub's dog sitting calmly at home, with a speech bubble saying “This is FlowHub”"
      width={size}
      height={size}
      className={cn("h-auto select-none", className)}
      style={{ width: size, maxWidth: "100%" }}
      priority
    />
  );
}
