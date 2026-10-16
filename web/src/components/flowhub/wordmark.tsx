import Image from "next/image";
import { cn } from "cn";

/** FlowHub wordmark: the dog mark and the name. The name carries the meaning, so the mark is decorative. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-base font-bold tracking-tight", className)}>
      <Image src="/brand/flowhub-mark-256.png" alt="" aria-hidden="true" width={28} height={28} className="size-7 shrink-0" priority />
      FlowHub
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
