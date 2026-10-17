import type { SampleSeller } from "@/lib/schema";

/**
 * ADR-0016 D6: each sample company's mark, drawn in code as a 40 × 40 SVG.
 * Simple geometric shapes in the company's own colour, resembling no real
 * brand. The name is set beside it as real text, never inside the image.
 * scripts/sample-logos.ts turns these into the PNGs the client deck uses.
 */
const MARKS: Record<SampleSeller, string> = {
  // Olvessa Cloud: an "O" with a cloud puff.
  olvessa: '<circle cx="18" cy="22" r="11" fill="none" stroke="#1D9E75" stroke-width="6"/><circle cx="29.5" cy="11" r="6" fill="#5DCAA5"/>',
  // Yorvex Workforce: a "Y" of three shift bars.
  yorvex: '<path d="M10 9 L20 20 L30 9" fill="none" stroke="#534AB7" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 21 V32" stroke="#7F77DD" stroke-width="6" stroke-linecap="round"/>',
  // Trassoq Hardware: a chip with pins and a "T".
  trassoq:
    '<g stroke="#D85A30" stroke-width="2.5" stroke-linecap="round"><path d="M14 5v4M20 5v4M26 5v4M14 31v4M20 31v4M26 31v4M5 14h4M5 20h4M5 26h4M31 14h4M31 20h4M31 26h4"/></g><rect x="9" y="9" width="22" height="22" rx="4" fill="#D85A30"/><path d="M14.5 16h11M20 16v9" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>',
};

/** The company's colour, for anything drawn next to its mark. */
export const LOGO_COLOR: Record<SampleSeller, string> = { olvessa: "#1D9E75", yorvex: "#534AB7", trassoq: "#D85A30" };

export function logoSvg(seller: SampleSeller): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">${MARKS[seller]}</svg>`;
}

export function logoDataUri(seller: SampleSeller): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(seller))}`;
}

/** Up to two initials for a company that isn't a sample: "Acme Data Sdn Bhd" → "AD". */
export function monogram(name: string): string {
  const words = name
    .replace(/\b(sdn|bhd|berhad|plc|ltd|limited|inc|llc|pte)\b\.?/gi, "")
    .split(/[\s\-–&]+/)
    .filter((word) => /[a-z0-9]/i.test(word));
  return (words.length >= 2 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
