import "server-only";
import QRCode from "qrcode";

/**
 * A QR code as an inline SVG, drawn on the server (FR-FORM-10). Used for the
 * website form, so a person at a stand or on stage scans it and fills the
 * form on their phone. Only ever drawn for an https address the script
 * reported (checked in `/api/inbox`).
 */
export function qrSvg(url: string, size = 220): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: size, color: { dark: "#141414", light: "#ffffff" } });
}

/** The address to point people at: the website if the script reported one, else the Google Form itself. */
export function formLink(settings: { siteUrl: string | null; formUrl: string | null }): string | null {
  return settings.siteUrl ?? settings.formUrl ?? null;
}
