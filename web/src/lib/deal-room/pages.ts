import { evidenceAppearsIn } from "@/lib/text/match";

/**
 * FR-INT-3 (as changed in PRD 7.0): a requirement read from an attached PDF
 * carries its page, and code decides what that page is. The source line is
 * looked up in the PDF's own text:
 *  - found on the page the model gave: kept, and marked checked
 *  - found on another page: moved to that page, and marked checked
 *  - not found anywhere: no page (the line may come from the pasted text)
 * A scan has no text to look in, so the model's page stays, marked unchecked.
 * With no PDF attached, no page is kept.
 */
export function checkRequirementPages<T extends { sourceLine?: string; page?: number; pageChecked?: boolean }>(
  requirements: T[],
  pdf: { pages: string[]; scanned: boolean } | null,
): T[] {
  return requirements.map((requirement) => {
    const bare: T = { ...requirement };
    delete bare.page;
    delete bare.pageChecked;
    if (!pdf) return bare;
    if (pdf.scanned) {
      const real = requirement.page !== undefined && requirement.page <= pdf.pages.length;
      return real ? { ...bare, page: requirement.page, pageChecked: false } : bare;
    }
    const line = requirement.sourceLine;
    if (!line) return bare;
    const given = requirement.page ? pdf.pages[requirement.page - 1] : undefined;
    if (given !== undefined && evidenceAppearsIn(line, given)) return { ...bare, page: requirement.page, pageChecked: true };
    const found = pdf.pages.findIndex((text) => evidenceAppearsIn(line, text));
    return found >= 0 ? { ...bare, page: found + 1, pageChecked: true } : bare;
  });
}
