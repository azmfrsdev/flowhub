import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * A PDF's text layer, page by page, read by code (no model). It is the source
 * the validator checks proposed prices against (invariant 1, ADR-0009 D2).
 */

export class PdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfError";
  }
}

export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  try {
    // pdf.js may take ownership of the buffer it's given, so it gets a copy.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") throw new PdfError("This PDF is password-protected. Upload a copy without a password.");
    throw new PdfError("This file couldn't be opened as a PDF.");
  }
}

/** Almost no text on the pages: a scan or a picture of a document, so Gemini reads the page images instead. */
export function looksScanned(pages: string[]): boolean {
  const characters = pages.reduce((sum, page) => sum + page.replace(/\s/g, "").length, 0);
  return pages.length > 0 && characters < 40 * pages.length;
}
