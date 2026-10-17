import "server-only";
import { SampleSeller } from "@/lib/schema";
import { LOGO_PNG } from "./logos.generated";

/** ADR-0016 D6: the PNG mark of a sample company for the deck, or null for any other company. */
export function sellerLogo(sample: unknown): string | null {
  const parsed = SampleSeller.safeParse(sample);
  return parsed.success ? LOGO_PNG[parsed.data] : null;
}
