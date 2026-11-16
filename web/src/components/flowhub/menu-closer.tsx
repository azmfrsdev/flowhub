"use client";

import { useEffect } from "react";

/**
 * Small menus are plain `<details data-menu>` elements, so they work before
 * any script loads. This closes an open one when the person clicks outside it
 * or presses Escape, the way a menu is expected to behave. Mounted once in the
 * hub shell.
 */
export function MenuCloser() {
  useEffect(() => {
    const openMenus = () => Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-menu][open]"));
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      for (const menu of openMenus()) if (!target || !menu.contains(target)) menu.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      for (const menu of openMenus()) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
