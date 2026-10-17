import "server-only";

/**
 * Creates the proposal as a Google Doc in the user's own Drive (ADR-0007,
 * FR-WRI-6, FR-WRI-7). The `drive.file` access token comes from the browser,
 * is used for these calls only, and is never stored or logged (invariant 12).
 * `drive.file` sees only files FlowHub created, so the folder search below can
 * only ever find FlowHub's own folder.
 */

export class DriveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveError";
  }
}

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

async function drive<T>(url: string, token: string, init: RequestInit = {}, what = "Doc"): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (response.ok) return (await response.json()) as T;
  // Status only: the response body could echo request details, so it isn't surfaced.
  if (response.status === 401) throw new DriveError(`Google's permission expired before the ${what} was created. Try again.`);
  if (response.status === 403) throw new DriveError("Google didn't allow FlowHub to create files in your Drive. Try again and allow access.");
  throw new DriveError(`Google Drive couldn't create the ${what} (error ${response.status}). Try again in a moment.`);
}

async function flowhubFolder(token: string, knownId: string | null): Promise<string> {
  if (knownId) {
    const found = await drive<{ id: string; trashed?: boolean }>(`${DRIVE}/${encodeURIComponent(knownId)}?fields=id,trashed`, token).catch(() => null);
    if (found && !found.trashed) return found.id;
  }
  const query = encodeURIComponent("name = 'FlowHub' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const list = await drive<{ files: { id: string }[] }>(`${DRIVE}?q=${query}&fields=files(id)&pageSize=1`, token);
  if (list.files[0]) return list.files[0].id;
  const folder = await drive<{ id: string }>(`${DRIVE}?fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "FlowHub", mimeType: "application/vnd.google-apps.folder" }),
  });
  return folder.id;
}

/** Converts the proposal HTML into a Google Doc in the "FlowHub" folder. Returns the Doc and the folder used. */
export async function createProposalDoc(token: string, title: string, html: string, knownFolderId: string | null): Promise<{ id: string; url: string; folderId: string }> {
  const folderId = await flowhubFolder(token, knownFolderId);
  const boundary = `flowhub-${crypto.randomUUID()}`;
  const metadata = { name: title, mimeType: "application/vnd.google-apps.document", parents: [folderId] };
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title></head><body>${html}</body></html>`,
    `--${boundary}--`,
  ].join("\r\n");
  const doc = await drive<{ id: string; webViewLink: string }>(`${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, token, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return { id: doc.id, url: doc.webViewLink, folderId };
}

/**
 * The client deck (PRD 7.22, ADR-0015 D3): uploads the .pptx to the "FlowHub"
 * folder and lets Drive convert it into Google Slides. Same `drive.file` token
 * rules as the Doc: used for these calls only, never stored or logged.
 */
export async function createDeckSlides(token: string, title: string, pptx: Buffer, knownFolderId: string | null): Promise<{ id: string; url: string; folderId: string }> {
  const folderId = await flowhubFolder(token, knownFolderId);
  const boundary = `flowhub-${crypto.randomUUID()}`;
  const metadata = { name: title, mimeType: "application/vnd.google-apps.presentation", parents: [folderId] };
  const head = [`--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify(metadata), `--${boundary}`, "Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation", "", ""].join("\r\n");
  const body = Buffer.concat([Buffer.from(head), pptx, Buffer.from(`\r\n--${boundary}--`)]);
  const deck = await drive<{ id: string; webViewLink: string }>(
    `${UPLOAD}?uploadType=multipart&fields=id,webViewLink`,
    token,
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: new Uint8Array(body) },
    "deck",
  );
  return { id: deck.id, url: deck.webViewLink, folderId };
}
