import "server-only";
import type { Part } from "@google/genai";
import { checkRequirementPages } from "@/lib/deal-room/pages";
import { IntakeOutput } from "@/lib/schema";
import { generateJson } from "@/server/ai/generate";
import { PdfError, looksScanned, pdfPages } from "@/server/documents/pdf";
import { prompt } from "@/server/prompts";
import { PipelineError, type RunContext } from "./runner";

const FREE_MAIL = /(^|\.)(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|proton|protonmail|aol)\.(com|my|co\.uk|me)$/i;

/** Normalises a website to its host, or nothing if it's a free mail domain. */
function companySite(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const host = new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./, "");
    return FREE_MAIL.test(host) ? undefined : host;
  } catch {
    return undefined;
  }
}

/** Stage 1, Intake (FR-INT-1 to FR-INT-6). Ends at Gate A. */
export async function intakePipeline(context: RunContext): Promise<IntakeOutput> {
  const { opportunity, workspace } = context;
  const texts = opportunity.inputs.flatMap((input) => (input.kind === "text" ? [input.text] : []));
  const urls = opportunity.inputs.flatMap((input) => (input.kind === "url" ? [input.url] : []));
  const files = opportunity.inputs.flatMap((input) => (input.kind === "file" ? [input] : []));

  // FR-INT-1: one attached file. Gemini reads a PDF or an image itself; a saved email is text.
  // A PDF's own text is kept, so code can check the page of each requirement (FR-INT-3).
  const parts: Part[] = [];
  const fileTexts: string[] = [];
  const described: string[] = [];
  let pdf: { pages: string[]; scanned: boolean } | null = null;
  for (const file of files) {
    const bytes = await context.readFile(file.storagePath).catch(() => {
      throw new PipelineError("missing_input", `The attached file ${file.name} couldn't be opened. Start a new opportunity with it attached again.`, false);
    });
    const type = file.contentType ?? "application/pdf";
    if (type === "text/plain") {
      fileTexts.push(`Attached file ${file.name}:\n${bytes.toString("utf8").slice(0, 20000)}`);
      described.push(file.name);
      continue;
    }
    parts.push({ inlineData: { mimeType: type, data: bytes.toString("base64") } });
    if (type !== "application/pdf") {
      described.push(file.name);
      continue;
    }
    try {
      const pages = await pdfPages(bytes);
      pdf = { pages, scanned: looksScanned(pages) };
      described.push(`${file.name} (${pages.length} ${pages.length === 1 ? "page" : "pages"}${pdf.scanned ? ", scanned" : ""})`);
    } catch (err) {
      if (err instanceof PdfError) throw new PipelineError("unreadable_file", err.message, false);
      throw err;
    }
  }

  const came = [texts.length ? `${texts.length} pasted ${texts.length === 1 ? "text" : "texts"}` : null, described.length ? described.join(", ") : null, urls.length ? urls.join(", ") : null];
  await context.event("calc", "read", "step", `Reading what came in: ${came.filter(Boolean).join(" and ")}`);

  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  const incoming = [...texts.map((text) => text.slice(0, 20000)), ...fileTexts, ...urls.map((url) => `Company website: ${url}`)].join("\n\n---\n\n");
  const attachedNote = parts.length ? `\n\nThe attached ${parts.length === 1 ? "file" : "files"} came in from outside the company too: ${described.join(", ")}.` : "";
  const reading = urls.length
    ? `Intake is reading ${urls.map((url) => companySite(url) ?? url).join(", ")}`
    : described.length
      ? `Intake is reading ${described.join(", ")}`
      : "Intake is extracting the prospect and their needs";

  const extracted = await context.step("ai", "intake", reading, () =>
    generateJson({
      tier: "flash",
      system: prompt("intake", { today, persona: workspace.persona }),
      prompt: [{ role: "user", parts: [...parts, { text: `<incoming>\n${incoming}${attachedNote}\n</incoming>` }] }],
      schema: IntakeOutput,
      tools: urls.length ? [{ urlContext: {} }] : undefined,
      usage: context.usage,
    }),
  );

  return context.step("calc", "check", pdf ? "Checking the prospect, and each requirement's page in the PDF" : "Checking the prospect is a company, not a guess", async () => {
    const website = companySite(extracted.prospect?.website) ?? companySite(urls[0]);
    const name = extracted.prospect?.name?.trim();
    const prospect = name ? { ...extracted.prospect!, name, website, country: extracted.prospect?.country?.toUpperCase().slice(0, 2) || undefined } : null;
    const result: IntakeOutput = {
      ...extracted,
      // A lead from the news scout (FR-NEWS-7) stays marked as news; the model only picks among the other kinds.
      intakeType: opportunity.intakeType === "news" ? "news" : extracted.intakeType,
      prospect,
      needsCompany: !prospect,
      // FR-INT-3: a requirement's page is decided by code from the PDF's own text, never taken on the model's word.
      requirements: checkRequirementPages(extracted.requirements.slice(0, 30), pdf).map((requirement, index) => ({ ...requirement, id: `r${index + 1}` })),
    };
    if (!prospect) await context.event("calc", "check", "warning", "No company could be identified. Add its name or website at the gate before research can start.");
    return result;
  });
}
