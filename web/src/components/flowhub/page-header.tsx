"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

/**
 * A page's header stays in view under the top bar while the page scrolls, so
 * its title and main action are always at hand. It sits flush with the top of
 * the page and gains a rule and a soft shadow only once content scrolls under
 * it. On phones it scrolls away, to save room.
 */
export function PageHeader({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    // The top bar is 60px tall (min-h-15); the header counts as stuck once the sentinel passes under it.
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { rootMargin: "-61px 0px 0px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* The main column is a flex column with a gap; the sentinel takes no room and cancels the gap after it. */}
      <div ref={sentinel} aria-hidden="true" className="-mb-5 h-0" />
      <header
        aria-label={label}
        data-stuck={stuck || undefined}
        className={cn(
          "z-20 -mx-4 -mt-4 flex flex-col gap-3 border-b-2 border-transparent bg-background px-4 pt-4 pb-3 transition-[border-color,box-shadow] sm:-mx-7 sm:px-7 md:sticky md:top-15",
          "data-stuck:border-ink/15 data-stuck:shadow-[0_6px_12px_-10px_rgb(0_0_0/0.35)]",
          className,
        )}
      >
        {children}
      </header>
    </>
  );
}
