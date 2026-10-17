import "server-only";
import PptxGenJS from "pptxgenjs";
import type { ClientDeck, DeckItem, DeckSlide } from "@/lib/schema";
import { photoCredit } from "@/lib/deal-room/deck";
import { photoData } from "./openverse";

/**
 * Renders a client deck record to .pptx (PRD 7.22, ADR-0015 D3), in the
 * maintainer's deck house style: a 10 × 5.625 in canvas, a navy header band
 * with eyebrow and title, a main band, a closing band and a footer; emerald
 * only for money and positive outcomes, amber only for risk. Every slide gets
 * speaker notes. Text slots are sized for the longest text the deck schema
 * allows (lib/deal-room/deck, DECK_BUDGET).
 */

const W = 10;
const H = 5.625;
const M = 0.28;
const FONT = "Calibri";
const C = {
  navy: "1B2A6B",
  navyDark: "121C4A",
  navyTint: "E8ECF7",
  slate: "5A6480",
  slateTint: "EEF1F7",
  emerald: "0F6B4F",
  emeraldTint: "E7F2EE",
  amber: "9A5B0C",
  amberTint: "FBF1E3",
  ink: "1F2430",
  line: "D6DBE8",
  white: "FFFFFF",
  eyebrow: "9FB0DE",
  footer: "9AA2B4",
  soft: "C9D3F0",
} as const;

type Slide = ReturnType<PptxGenJS["addSlide"]>;
type Photos = { title: string | null; proof: string | null };

const text = (slide: Slide, value: string | PptxGenJS.TextProps[], options: PptxGenJS.TextPropsOptions) =>
  slide.addText(value, { fontFace: FONT, color: C.ink, margin: 0, valign: "top", ...options });

function header(pres: PptxGenJS, slide: Slide, eyebrow: string, title: string) {
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.8, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
  text(slide, eyebrow.toUpperCase(), { x: M, y: 0.08, w: W - 2 * M, h: 0.22, fontSize: 9, bold: true, color: C.eyebrow, charSpacing: 1.2 });
  text(slide, title, { x: M, y: 0.3, w: W - 2 * M, h: 0.42, fontSize: 21, bold: true, color: C.white, fit: "shrink" });
}

function standfirst(slide: Slide, value: string | null) {
  if (!value) return;
  text(slide, value, { x: M, y: 0.88, w: W - 2 * M, h: 0.24, fontSize: 9.5, color: C.slate });
}

function closing(pres: PptxGenJS, slide: Slide, value: string | null | undefined, tone: "emerald" | "amber" = "emerald") {
  if (!value) return;
  const [fill, ink] = tone === "emerald" ? [C.emeraldTint, C.emerald] : [C.amberTint, C.amber];
  slide.addShape(pres.ShapeType.rect, { x: M, y: 4.54, w: W - 2 * M, h: 0.4, fill: { color: fill }, line: { color: fill, width: 0 } });
  text(slide, value, { x: M + 0.16, y: 4.54, w: W - 2 * M - 0.32, h: 0.4, fontSize: 10, bold: true, color: ink, valign: "middle" });
}

function footer(slide: Slide, deck: ClientDeck, page: number, light = false) {
  const color = light ? C.eyebrow : C.footer;
  text(slide, `${deck.title.seller} · Proposal for ${deck.title.prospect}`, { x: M, y: H - 0.3, w: 6, h: 0.22, fontSize: 7.5, color, valign: "middle" });
  text(slide, `${page} / 8`, { x: W - M - 1, y: H - 0.3, w: 1, h: 0.22, fontSize: 7.5, color, align: "right", valign: "middle" });
}

/** A numbered stage badge: "01", "02" … tells the eye where to start. */
function badge(pres: PptxGenJS, slide: Slide, x: number, y: number, n: number, fill: string = C.navy, ink: string = C.white) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w: 0.38, h: 0.26, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.06 });
  text(slide, String(n).padStart(2, "0"), { x, y, w: 0.38, h: 0.26, fontSize: 9, bold: true, color: ink, align: "center", valign: "middle" });
}

function card(pres: PptxGenJS, slide: Slide, x: number, y: number, w: number, h: number, fill: string = C.white, border: string = C.line) {
  slide.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: border, width: 0.75 } });
}

function arrow(pres: PptxGenJS, slide: Slide, x: number, y: number, w: number, color: string = C.navy) {
  slide.addShape(pres.ShapeType.rightArrow, { x, y, w, h: 0.3, fill: { color }, line: { color, width: 0 } });
}

/** A photo cropped to cover its box, with its credit line (FR-DECK-5). */
function photo(slide: Slide, data: string, size: { width: number; height: number }, box: { x: number; y: number; w: number; h: number }) {
  slide.addImage({ data, x: box.x, y: box.y, w: size.width / 100, h: size.height / 100, sizing: { type: "cover", w: box.w, h: box.h } });
}

function notes(slide: Slide, deck: ClientDeck, key: DeckSlide, fallback: string[]) {
  const groups = deck.notes[key] ?? [];
  const body = groups.length ? groups.map((group) => [group.header, ...group.bullets.map((bullet) => `- ${bullet}`)].join("\n")).join("\n\n") : fallback.join("\n");
  slide.addNotes(body);
}

const items = (list: DeckItem[]) => list.map((item) => item.text);

function titleSlide(pres: PptxGenJS, deck: ClientDeck, photos: Photos) {
  const slide = pres.addSlide();
  const split = photos.title && deck.photos.title ? 6.1 : W;
  slide.background = { color: C.navyDark };
  if (photos.title && deck.photos.title) {
    photo(slide, photos.title, deck.photos.title, { x: split, y: 0, w: W - split, h: H });
    slide.addShape(pres.ShapeType.rect, { x: split, y: H - 0.5, w: W - split, h: 0.5, fill: { color: "000000", transparency: 40 }, line: { color: "000000", width: 0, transparency: 100 } });
    text(slide, photoCredit(deck.photos.title), { x: split + 0.12, y: H - 0.46, w: W - split - 0.24, h: 0.42, fontSize: 6.5, color: C.white, valign: "middle" });
  }
  const width = split - 2 * 0.6;
  text(slide, "PROPOSAL", { x: 0.6, y: 0.95, w: width, h: 0.28, fontSize: 10, bold: true, color: C.eyebrow, charSpacing: 2 });
  text(slide, deck.title.prospect, { x: 0.6, y: 1.28, w: width, h: 1.3, fontSize: 32, bold: true, color: C.white, fit: "shrink" });
  text(slide, deck.title.headline, { x: 0.6, y: 2.68, w: width, h: 0.95, fontSize: 14, color: C.soft });
  text(slide, [
    { text: deck.title.seller, options: { bold: true, color: C.white, breakLine: true } },
    { text: `${deck.title.date} · Presented by ${deck.title.presenter}`, options: { color: C.eyebrow } },
  ], { x: 0.6, y: 3.98, w: width, h: 0.6, fontSize: 11 });
  notes(slide, deck, "title", ["What this deck is for", `- Walk ${deck.title.prospect} through the proposal from ${deck.title.seller}.`]);
}

function heardSlide(pres: PptxGenJS, deck: ClientDeck) {
  const slide = pres.addSlide();
  header(pres, slide, "What we heard", `Where ${deck.title.prospect} is today`);
  standfirst(slide, deck.heard.standfirst?.text ?? null);
  const today = items(deck.heard.today);
  const change = items(deck.heard.change);
  // Before: a grey strip of today's situation.
  slide.addShape(pres.ShapeType.rect, { x: M, y: 1.16, w: W - 2 * M, h: 1.0, fill: { color: C.slateTint }, line: { color: C.slateTint, width: 0 } });
  text(slide, "TODAY", { x: M + 0.16, y: 1.22, w: 2, h: 0.2, fontSize: 8, bold: true, color: C.slate, charSpacing: 1.2 });
  if (today.length) {
    const gap = 0.24;
    const colW = (W - 2 * M - 0.32 - gap * (today.length - 1)) / today.length;
    today.forEach((value, index) => text(slide, value, { x: M + 0.16 + index * (colW + gap), y: 1.46, w: colW, h: 0.64, fontSize: 9.5, color: C.ink }));
  }
  // The transition, then the change filling the lower part.
  slide.addShape(pres.ShapeType.downArrow, { x: W / 2 - 0.22, y: 2.2, w: 0.44, h: 0.36, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
  text(slide, `WITH ${deck.title.seller.toUpperCase()}`, { x: W / 2 + 0.34, y: 2.27, w: 4, h: 0.22, fontSize: 8, bold: true, color: C.navy, charSpacing: 1.2 });
  if (change.length) {
    const gap = 0.2;
    const colW = (W - 2 * M - gap * (change.length - 1)) / change.length;
    change.forEach((value, index) => {
      const x = M + index * (colW + gap);
      card(pres, slide, x, 2.62, colW, 1.82, index === 0 ? C.navyDark : C.navyTint, index === 0 ? C.navyDark : C.navyTint);
      badge(pres, slide, x + 0.16, 2.78, index + 1, index === 0 ? C.eyebrow : C.navy, index === 0 ? C.navyDark : C.white);
      text(slide, value, { x: x + 0.16, y: 3.16, w: colW - 0.32, h: 1.18, fontSize: 11, color: index === 0 ? C.white : C.ink });
    });
  }
  closing(pres, slide, deck.heard.closing?.text);
  footer(slide, deck, 2);
  notes(slide, deck, "heard", ["What the slide is for", "- Show we listened before we propose."]);
}

const STRENGTH = { strong: "Strong fit", partial: "Partial fit", weak: "Light fit" } as const;

function fitSlide(pres: PptxGenJS, deck: ClientDeck) {
  const slide = pres.addSlide();
  const needs = deck.fit.needs;
  header(pres, slide, "Where we fit", "Your needs, matched to what we deliver");
  standfirst(slide, needs.length ? `${needs.length} ${needs.length === 1 ? "need" : "needs"} from our conversations, each matched to an offering in ${deck.title.seller}'s catalogue.` : null);
  text(slide, "YOUR NEED", { x: M, y: 1.16, w: 3, h: 0.2, fontSize: 8, bold: true, color: C.slate, charSpacing: 1.2 });
  text(slide, "WHAT WE DELIVER", { x: 5.42, y: 1.16, w: 3, h: 0.2, fontSize: 8, bold: true, color: C.slate, charSpacing: 1.2 });
  const top = 1.42;
  const bottom = 4.44;
  const gap = 0.12;
  const rowH = needs.length ? Math.min(0.78, (bottom - top - gap * (needs.length - 1)) / needs.length) : 0.78;
  needs.forEach((need, index) => {
    const y = top + index * (rowH + gap);
    card(pres, slide, M, y, 4.34, rowH, C.slateTint, C.slateTint);
    badge(pres, slide, M + 0.14, y + (rowH - 0.26) / 2, index + 1);
    text(slide, need.text, { x: M + 0.64, y: y + 0.06, w: 3.56, h: rowH - 0.12, fontSize: need.text.length > 100 ? 9.5 : 10.5, color: C.ink, valign: "middle" });
    arrow(pres, slide, 4.7, y + (rowH - 0.3) / 2, 0.6);
    const offering = need.offerings[0];
    const strong = offering.strength === "strong";
    card(pres, slide, 5.42, y, W - M - 5.42, rowH, strong ? C.navyTint : C.white, strong ? C.navyTint : C.line);
    const others = need.offerings.slice(1).map((item) => item.name);
    text(slide, [
      { text: offering.name, options: { bold: true, color: C.navy, fontSize: 10.5 } },
      { text: `   ${STRENGTH[offering.strength]}${others.length ? ` · with ${others.join(", ")}` : ""}`, options: { color: C.slate, fontSize: 8, breakLine: true } },
      ...(offering.note ? [{ text: offering.note, options: { color: C.slate, fontSize: 8.5 } }] : []),
    ], { x: 5.58, y: y + 0.06, w: W - M - 5.74, h: rowH - 0.12, valign: "middle" });
  });
  const outside = deck.fit.outside[0];
  if (outside) closing(pres, slide, `Outside our scope: ${outside.need}${outside.partner ? `. We bring in ${outside.partner} for this.` : "."}`, "amber");
  else closing(pres, slide, needs.length ? "Each need above maps to an offering we already deliver, so nothing here is built from scratch." : null);
  footer(slide, deck, 3);
  notes(slide, deck, "fit", ["What the slide is for", "- Show every need has a home in what we already sell."]);
}

function deliverSlide(pres: PptxGenJS, deck: ClientDeck) {
  const slide = pres.addSlide();
  const cards = deck.deliver.cards;
  header(pres, slide, "What we'll deliver", cards.length ? `The scope, in ${cards.length} ${cards.length === 1 ? "part" : "parts"}` : "The scope");
  const cols = cards.length <= 3 ? Math.max(cards.length, 1) : cards.length === 4 ? 2 : 3;
  const rows = Math.ceil(cards.length / cols) || 1;
  const top = 1.0;
  const bottom = 4.42;
  const gap = 0.18;
  const cardW = (W - 2 * M - gap * (cols - 1)) / cols;
  const cardH = (bottom - top - gap * (rows - 1)) / rows;
  cards.forEach((item, index) => {
    const x = M + (index % cols) * (cardW + gap);
    const y = top + Math.floor(index / cols) * (cardH + gap);
    const heavy = index === 0;
    card(pres, slide, x, y, cardW, cardH, heavy ? C.navyDark : C.white, heavy ? C.navyDark : C.line);
    badge(pres, slide, x + 0.16, y + 0.16, index + 1, heavy ? C.eyebrow : C.navy, heavy ? C.navyDark : C.white);
    text(slide, item.title, { x: x + 0.16, y: y + 0.5, w: cardW - 0.32, h: 0.4, fontSize: 12.5, bold: true, color: heavy ? C.white : C.navy });
    text(slide, item.text, { x: x + 0.16, y: y + 0.92, w: cardW - 0.32, h: cardH - 1.04, fontSize: 9.5, color: heavy ? C.soft : C.ink });
  });
  closing(pres, slide, deck.deliver.closing?.text);
  footer(slide, deck, 4);
  notes(slide, deck, "deliver", ["What the slide is for", "- Name each part of the scope in the client's terms."]);
}

function planSlide(pres: PptxGenJS, deck: ClientDeck) {
  const slide = pres.addSlide();
  const phases = deck.plan.phases;
  header(pres, slide, "How we'll deliver", phases.length ? `Delivery in ${phases.length} ${phases.length === 1 ? "phase" : "phases"}` : "How we'll deliver");
  const n = Math.max(phases.length, 1);
  const gap = 0.36;
  const colW = (W - 2 * M - gap * (n - 1)) / n;
  // The time axis, with each phase's badge sitting on it and arrows between phases.
  slide.addShape(pres.ShapeType.rect, { x: M, y: 1.78, w: W - 2 * M, h: 0.02, fill: { color: C.line }, line: { color: C.line, width: 0 } });
  phases.forEach((phase, index) => {
    const x = M + index * (colW + gap);
    if (phase.duration) {
      slide.addShape(pres.ShapeType.roundRect, { x, y: 1.16, w: Math.min(colW, 1.5), h: 0.28, fill: { color: C.navyTint }, line: { color: C.navyTint, width: 0 }, rectRadius: 0.08 });
      text(slide, phase.duration, { x, y: 1.16, w: Math.min(colW, 1.5), h: 0.28, fontSize: 8.5, bold: true, color: C.navy, align: "center", valign: "middle" });
    }
    badge(pres, slide, x, 1.66, index + 1, index === 0 ? C.navyDark : C.navy);
    if (index < phases.length - 1) arrow(pres, slide, x + colW + 0.04, 1.64, gap - 0.08, C.slate);
    card(pres, slide, x, 2.06, colW, 2.36, index === 0 ? C.navyTint : C.white, index === 0 ? C.navyTint : C.line);
    text(slide, phase.name, { x: x + 0.14, y: 2.18, w: colW - 0.28, h: 0.5, fontSize: 12, bold: true, color: C.navy });
    text(slide, phase.detail, { x: x + 0.14, y: 2.72, w: colW - 0.28, h: 1.6, fontSize: 9.5, color: C.ink });
  });
  closing(pres, slide, deck.plan.closing?.text);
  footer(slide, deck, 5);
  notes(slide, deck, "plan", ["What the slide is for", "- Show the order of work and when each part lands."]);
}

function investmentSlide(pres: PptxGenJS, deck: ClientDeck) {
  const slide = pres.addSlide();
  header(pres, slide, "Investment", "What it costs");
  standfirst(slide, `Prices from ${deck.title.seller}'s current price list. The proposal has the full breakdown.`);
  const rows: PptxGenJS.TableRow[] = [];
  for (const group of deck.investment.groups) {
    rows.push([{ text: group.title.toUpperCase(), options: { bold: true, color: C.navy, fill: { color: C.navyTint }, fontSize: 8 } }, { text: "", options: { fill: { color: C.navyTint } } }]);
    for (const line of group.lines) rows.push([{ text: line.label, options: { color: C.ink } }, { text: line.price, options: { bold: true, color: C.ink, align: "right" } }]);
    if (group.subtotal) rows.push([{ text: "Subtotal", options: { bold: true, color: C.emerald } }, { text: group.subtotal, options: { bold: true, color: C.emerald, align: "right" } }]);
  }
  const subtotals = deck.investment.groups.filter((group) => group.subtotal);
  const tableBottom = subtotals.length ? 4.42 : 4.9;
  if (rows.length) {
    const rowH = Math.min(0.28, (tableBottom - 1.18) / rows.length);
    slide.addTable(rows, { x: M, y: 1.18, w: W - 2 * M, colW: [W - 2 * M - 2.6, 2.6], rowH, fontFace: FONT, fontSize: rowH < 0.24 ? 8.5 : 9.5, valign: "middle", margin: [0.02, 0.1, 0.02, 0.1], border: { type: "solid", pt: 0.5, color: C.line } });
  } else {
    text(slide, "Pricing is confirmed after discovery.", { x: M, y: 1.4, w: W - 2 * M, h: 0.4, fontSize: 12, color: C.slate });
  }
  // The stat strip: the subtotals the proposal's table allows, in emerald (money).
  subtotals.slice(0, 3).forEach((group, index, list) => {
    const gap = 0.18;
    const tileW = (W - 2 * M - gap * (list.length - 1)) / list.length;
    const x = M + index * (tileW + gap);
    card(pres, slide, x, 4.54, tileW, 0.62, C.emeraldTint, C.emeraldTint);
    text(slide, group.title, { x: x + 0.14, y: 4.58, w: tileW - 0.28, h: 0.2, fontSize: 8, bold: true, color: C.emerald });
    text(slide, group.subtotal ?? "", { x: x + 0.14, y: 4.78, w: tileW - 0.28, h: 0.32, fontSize: 15, bold: true, color: C.emerald });
  });
  footer(slide, deck, 6);
  notes(slide, deck, "investment", ["What the slide is for", "- Every price here is copied from our price list by code; none is typed by hand."]);
}

function proofSlide(pres: PptxGenJS, deck: ClientDeck, photos: Photos) {
  const slide = pres.addSlide();
  header(pres, slide, "Proof", "Work we can point to");
  const withPhoto = Boolean(photos.proof && deck.photos.proof);
  if (withPhoto && photos.proof && deck.photos.proof) {
    photo(slide, photos.proof, deck.photos.proof, { x: M, y: 1.0, w: 3.2, h: 2.96 });
    text(slide, photoCredit(deck.photos.proof), { x: M, y: 4.02, w: 3.2, h: 0.5, fontSize: 6.5, color: C.slate });
  }
  const left = withPhoto ? M + 3.44 : M;
  const width = W - M - left;
  const list = deck.proof.length ? deck.proof : [{ title: "Case studies available on request", body: `${deck.title.seller} can share detailed references once there is an agreement in place.` }];
  const gap = 0.16;
  const cardH = (4.52 - 1.0 - gap * (list.length - 1)) / list.length;
  list.forEach((item, index) => {
    const y = 1.0 + index * (cardH + gap);
    const heavy = index === 0 && deck.proof.length > 0;
    card(pres, slide, left, y, width, cardH, heavy ? C.navyTint : C.white, heavy ? C.navyTint : C.line);
    badge(pres, slide, left + 0.16, y + 0.14, index + 1);
    text(slide, [
      { text: item.title, options: { bold: true, color: C.navy, fontSize: 11.5, breakLine: true } },
      { text: item.body, options: { color: C.ink, fontSize: 9.5 } },
    ], { x: left + 0.66, y: y + 0.1, w: width - 0.82, h: cardH - 0.2 });
  });
  footer(slide, deck, 7);
  notes(slide, deck, "proof", ["What the slide is for", "- Only results the company has marked public appear here."]);
}

function nextSlide(pres: PptxGenJS, deck: ClientDeck) {
  const slide = pres.addSlide();
  slide.background = { color: C.navyDark };
  text(slide, "NEXT STEPS", { x: 0.6, y: 0.55, w: 6, h: 0.24, fontSize: 10, bold: true, color: C.eyebrow, charSpacing: 2 });
  text(slide, deck.next.headline, { x: 0.6, y: 0.85, w: W - 1.2, h: 1.1, fontSize: 32, bold: true, color: C.white, fit: "shrink" });
  const steps = items(deck.next.steps);
  if (steps.length) {
    const gap = 0.2;
    const colW = (W - 1.2 - gap * (steps.length - 1)) / steps.length;
    steps.forEach((step, index) => {
      const x = 0.6 + index * (colW + gap);
      card(pres, slide, x, 2.3, colW, 1.4, C.navy, C.navy);
      badge(pres, slide, x + 0.16, 2.46, index + 1, C.eyebrow, C.navyDark);
      text(slide, step, { x: x + 0.16, y: 2.84, w: colW - 0.32, h: 0.8, fontSize: 11, color: C.white });
    });
  }
  text(slide, [
    { text: deck.title.presenter, options: { bold: true, color: C.white, breakLine: true } },
    { text: deck.title.seller, options: { color: C.eyebrow } },
  ], { x: 0.6, y: 4.1, w: 6, h: 0.6, fontSize: 12 });
  footer(slide, deck, 8, true);
  notes(slide, deck, "next", ["What the slide is for", "- Land the ask and agree the first step before leaving the room."]);
}

/** The .pptx bytes for a client deck. Photos are fetched again each time; a failed fetch leaves the slide without one. */
export async function renderDeck(deck: ClientDeck): Promise<Buffer> {
  const [title, proof] = await Promise.all([photoData(deck.photos.title), photoData(deck.photos.proof)]);
  const photos: Photos = { title, proof };
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "FLOWHUB_DECK", width: W, height: H });
  pres.layout = "FLOWHUB_DECK";
  pres.title = `Proposal for ${deck.title.prospect}`;
  pres.company = deck.title.seller;
  pres.author = deck.title.presenter;
  titleSlide(pres, deck, photos);
  heardSlide(pres, deck);
  fitSlide(pres, deck);
  deliverSlide(pres, deck);
  planSlide(pres, deck);
  investmentSlide(pres, deck);
  proofSlide(pres, deck, photos);
  nextSlide(pres, deck);
  return (await pres.write({ outputType: "nodebuffer" })) as Buffer;
}
