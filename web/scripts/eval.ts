/**
 * npm run eval (ADR-0010 D5, PRD section 12). Runs the eval set against Gemini
 * with each seller's sample catalogue held in memory: no Firestore, no
 * Storage, nothing written anywhere. The real pipelines run, through an
 * in-memory run context.
 *
 *   npm run eval                          everything
 *   npm run eval -- --messages            Ask or tell messages only
 *   npm run eval -- --opportunities       opportunities only
 *   npm run eval -- --only kelapa         fixtures whose file name contains "kelapa"
 *   npm run eval -- --research            also run grounded research (billed per grounded prompt)
 *   npm run eval -- --no-write            stop each opportunity after Fit
 *   npm run eval -- --serial              one model call at a time (shows latency without quota queueing)
 *   npm run eval -- --json report.json    also write the results as JSON
 *
 * It calls Gemini on GOOGLE_CLOUD_PROJECT with your own sign-in (ADC). A full
 * run is about 60 model calls. Exits 1 if a PRD section 12 target is missed.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderPrices } from "../src/lib/deal-room/review";
import { type WorkspaceGraph, priceOn } from "../src/lib/offerings/view";
import { moneyTokens } from "../src/lib/pricing/money";
import {
  type BriefOutput,
  BriefSection,
  type FitOutput,
  type IntakeOutput,
  OfferingGraphExport,
  type Opportunity,
  type Run,
  type RunEvent,
  type StageKey,
  Workspace,
  type WriteOutput,
} from "../src/lib/schema";
import { normaliseText } from "../src/lib/text/match";
import { readMessage } from "../src/server/pipelines/ask";
import { fitPipeline } from "../src/server/pipelines/fit";
import { intakePipeline } from "../src/server/pipelines/intake";
import { researchPipeline } from "../src/server/pipelines/research";
import { RunContext } from "../src/server/pipelines/runner";
import { writePipeline } from "../src/server/pipelines/write";
import { costTokens } from "../src/server/proposals/validate";

process.env.GOOGLE_CLOUD_PROJECT ??= "flowhub-cup26";
process.env.GOOGLE_CLOUD_LOCATION ??= "global";

const ROOT = path.resolve(__dirname, "..", "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const only = option("--only");
const runMessages = !flag("--opportunities");
const runOpportunities = !flag("--messages");

/* ---------- Sellers, in memory ---------- */

const sellers = new Map<
  string,
  { graph: WorkspaceGraph; workspace: Workspace }
>();
function seller(key: string) {
  const known = sellers.get(key);
  if (known) return known;
  const exported = OfferingGraphExport.parse(
    JSON.parse(
      readFileSync(
        path.join(ROOT, "fixtures", "sample", `${key}.graph.json`),
        "utf8",
      ),
    ),
  );
  const graph: WorkspaceGraph = {
    ...exported,
    notes: exported.notes,
    documents: [],
  };
  const workspace = Workspace.parse({
    id: `eval-${key}`,
    name: exported.workspace.name,
    country: exported.workspace.country,
    currency: exported.workspace.currency,
    createdAt: new Date().toISOString(),
    createdBy: "eval",
  });
  const loaded = { graph, workspace };
  sellers.set(key, loaded);
  return loaded;
}

/** A run context with no database: events go to a list, upstream stages come from memory, the graph is the sample's. */
class MemoryRunContext extends RunContext {
  readonly log: string[] = [];
  constructor(
    stage: StageKey,
    opportunity: Opportunity,
    workspace: Workspace,
    private readonly sample: WorkspaceGraph,
    private readonly stages: Partial<Record<StageKey, unknown>>,
    options?: Run["inputs"]["options"],
  ) {
    super(
      {
        workspaceId: workspace.id,
        opportunityId: opportunity.id,
        runId: `eval-${stage}`,
      },
      MemoryRunContext.run(stage, options),
      opportunity,
      workspace,
    );
  }
  private static run(stage: StageKey, options?: Run["inputs"]["options"]): Run {
    return {
      id: `eval-${stage}`,
      stage,
      attempt: 1,
      state: "running",
      inputs: { upstreamRunIds: {}, ...(options ? { options } : {}) },
    } as unknown as Run;
  }
  override async event(
    actor: "ai" | "calc",
    step: string,
    kind: RunEvent["kind"],
    message: string,
  ) {
    this.log.push(`${actor} ${kind === "step" ? "" : `${kind}: `}${message}`);
  }
  override async upstream<T>(stage: StageKey): Promise<T> {
    if (!(stage in this.stages))
      throw new Error(`No ${stage} output in memory`);
    return this.stages[stage] as T;
  }
  override async graph() {
    return this.sample;
  }
  override async readFile(storagePath: string) {
    return readFileSync(path.join(ROOT, storagePath));
  }
}

const EMPTY_BRIEF: BriefOutput = {
  sections: BriefSection.options.map((key) => ({
    key,
    status: "nothing_found" as const,
  })),
  claims: [],
  inferences: [],
  sources: {},
  droppedCount: 0,
  searchSuggestions: [],
  detectedTech: [],
  questions: [],
  sellerNotes: [],
};

/* ---------- Matching helpers ---------- */

const STOP = new Set(
  "the and for with from that this their them they our all who what have has are was can must into onto per each will not off own".split(
    " ",
  ),
);
const words = (text: string) =>
  new Set(
    normaliseText(text)
      .split(/[^a-z0-9%]+/)
      .filter((word) => word.length >= 3 && !STOP.has(word)),
  );
/** How much of `expected`'s wording `candidate` covers, 0 to 1. */
function coverage(expected: string, candidate: string) {
  const e = words(expected);
  if (e.size === 0) return 0;
  const c = words(candidate);
  return [...e].filter((word) => c.has(word)).length / e.size;
}
const sameName = (a: string, b: string) => {
  const clean = (s: string) =>
    normaliseText(s)
      .replace(/\b(sdn|bhd|berhad|pte|ltd|group|inc)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return clean(a).includes(clean(b)) || clean(b).includes(clean(a));
};

/* ---------- Results ---------- */

type Check = { name: string; pass: boolean; detail: string };
type Result = {
  fixture: string;
  kind: "opportunity" | "message";
  checks: Check[];
  seconds: number;
  error?: string;
};
const results: Result[] = [];
const tally = new Map<string, { pass: number; total: number }>();
function record(result: Result, metric: string, pass: boolean, detail: string) {
  result.checks.push({ name: metric, pass, detail });
  const current = tally.get(metric) ?? { pass: 0, total: 0 };
  tally.set(metric, {
    pass: current.pass + (pass ? 1 : 0),
    total: current.total + 1,
  });
}

/* ---------- Opportunities ---------- */

type Ref =
  | { kind: "cell"; cardId: string; rowId: string; colId: string }
  | { kind: "fee"; scheduleId: string; lineId: string };
type OpportunityFixture = {
  seller: string;
  opportunity: {
    intakeType: Opportunity["intakeType"];
    inputs: (
      | { kind: "text"; text: string }
      | { kind: "url"; url: string }
      | { kind: "file"; path: string; name: string; contentType: string }
    )[];
  };
  expect: {
    prospect: { name: string; country?: string };
    requirementPages?: { min: number; page?: number };
    gaps: {
      id: string;
      need: string;
      fit: "strong" | "partial" | "weak" | "cannot_meet";
      offeringIds?: string[];
      constraintId?: string;
    }[];
    constraintConflicts: { constraintId: string }[];
    score?: { band: string };
    pricing?: {
      lines: {
        ref: Ref;
        quantity?: number;
        valueText: string;
        total?: string;
      }[];
    };
    review?: { plantedClaims: { text: string }[]; proofNeverCited?: string[] };
  };
};

const sameRef = (a: Ref, b: Ref) =>
  a.kind === b.kind &&
  (a.kind === "cell" && b.kind === "cell"
    ? a.cardId === b.cardId && a.rowId === b.rowId && a.colId === b.colId
    : a.kind === "fee" &&
      b.kind === "fee" &&
      a.scheduleId === b.scheduleId &&
      a.lineId === b.lineId);

function graphValue(
  graph: WorkspaceGraph,
  ref: Ref,
  day: string,
): string | null {
  if (ref.kind === "cell") {
    const cell = graph.rateCards.find(
      (card) => card.id === ref.cardId && card.kind === "pricing",
    )?.cells[ref.rowId]?.[ref.colId];
    return cell ? priceOn(cell, day) : null;
  }
  const line = graph.feeSchedules
    .find((schedule) => schedule.id === ref.scheduleId)
    ?.lines.find((item) => item.id === ref.lineId);
  return line ? priceOn({ value: line.price, next: line.next }, day) : null;
}

async function evalOpportunity(
  file: string,
  fixture: OpportunityFixture,
): Promise<Result> {
  const started = Date.now();
  const result: Result = {
    fixture: file,
    kind: "opportunity",
    checks: [],
    seconds: 0,
  };
  const { graph, workspace } = seller(fixture.seller);
  const expect = fixture.expect;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
  const now = new Date().toISOString();
  const opportunity = {
    id: `eval-${path.basename(file, ".json")}`,
    workspaceId: workspace.id,
    prospect: null,
    persona: "sme",
    intakeType: fixture.opportunity.intakeType,
    source: "eval",
    interestedOfferingIds: [],
    status: "new",
    inputs: fixture.opportunity.inputs.map((input) =>
      input.kind === "file"
        ? {
            kind: "file",
            storagePath: input.path,
            name: input.name,
            contentType: input.contentType,
          }
        : input,
    ),
    rev: 0,
    createdAt: now,
    createdBy: "eval",
    updatedAt: now,
  } as unknown as Opportunity;
  const stages: Partial<Record<StageKey, unknown>> = {};
  const context = (stage: StageKey, options?: Run["inputs"]["options"]) =>
    new MemoryRunContext(stage, opportunity, workspace, graph, stages, options);

  try {
    // Intake, then Gate A as if a person approved it unchanged.
    const intake = await intakePipeline(context("intake"));
    stages.intake = intake;
    const prospectOk = Boolean(
      intake.prospect &&
      sameName(intake.prospect.name, expect.prospect.name) &&
      (!expect.prospect.country ||
        intake.prospect.country === expect.prospect.country),
    );
    record(
      result,
      "Prospect identified",
      prospectOk,
      `${intake.prospect?.name ?? "none"} (${intake.prospect?.country ?? "?"})`,
    );
    if (expect.requirementPages) {
      const paged = intake.requirements.filter(
        (requirement: IntakeOutput["requirements"][number]) =>
          requirement.pageChecked &&
          (!expect.requirementPages!.page ||
            requirement.page === expect.requirementPages!.page),
      );
      record(
        result,
        "Requirement pages checked",
        paged.length >= expect.requirementPages.min,
        `${paged.length} of ${intake.requirements.length} on a checked page`,
      );
    }
    if (!intake.prospect)
      throw new Error(
        "Intake found no company, so the deal room stops at Gate A.",
      );

    // Research: grounded search only with --research (fictional prospects find little).
    let brief = EMPTY_BRIEF;
    if (flag("--research")) {
      brief = (await researchPipeline(context("research"))) as BriefOutput;
      const unsourced = brief.claims.filter(
        (claim) =>
          !claim.sourceIds.length ||
          claim.sourceIds.some((id) => !brief.sources[id]),
      );
      record(
        result,
        "Research claims sourced",
        unsourced.length === 0,
        `${brief.claims.length - unsourced.length} of ${brief.claims.length} claims carry a known source`,
      );
    }
    stages.research = brief;

    // Fit and pricing.
    const fit = (await fitPipeline(context("fit"))) as FitOutput;
    stages.fit = fit;
    const offerings = new Map(
      graph.offerings.map((offering) => [offering.id, offering]),
    );
    const related = (id: string, wanted: string[]) =>
      wanted.includes(id) ||
      wanted.includes(offerings.get(id)?.parentId ?? "") ||
      wanted.some((w) => offerings.get(w)?.parentId === id);
    const requirementText = (ref: string) => {
      const requirement = intake.requirements.find((item) => item.id === ref);
      return requirement
        ? `${requirement.text} ${requirement.sourceLine ?? ""}`
        : "";
    };
    for (const gap of expect.gaps) {
      if (gap.fit === "cannot_meet") {
        const hit = fit.cannotMeet.some(
          (item) => item.constraint.id === gap.constraintId,
        );
        record(
          result,
          "Gap mapped to the expected offering",
          hit,
          `${gap.id} ${gap.need} → Cannot meet ${gap.constraintId}: ${hit ? "yes" : "missing"}`,
        );
        continue;
      }
      const scored = fit.gaps
        .map((candidate) => ({
          candidate,
          score: coverage(
            gap.need,
            `${candidate.text} ${candidate.origin.kind === "intake" ? requirementText(candidate.origin.ref) : ""}`,
          ),
        }))
        .sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (!best || best.score < 0.4) {
        record(
          result,
          "Gap mapped to the expected offering",
          false,
          `${gap.id} ${gap.need} → no matching gap in the fit`,
        );
        continue;
      }
      const targets = fit.mappings
        .filter((mapping) => mapping.gapId === best.candidate.id)
        .map((mapping) => mapping.target.id);
      const hit = targets.some((id) => related(id, gap.offeringIds ?? []));
      record(
        result,
        "Gap mapped to the expected offering",
        hit,
        `${gap.id} ${gap.need} → ${targets.join(", ") || "nothing"} (expected ${gap.offeringIds?.join(" or ")})`,
      );
    }
    for (const conflict of expect.constraintConflicts) {
      const hit = fit.cannotMeet.some(
        (item) => item.constraint.id === conflict.constraintId,
      );
      record(
        result,
        "Constraint conflict caught",
        hit,
        `${conflict.constraintId}: ${hit ? "Cannot meet" : "missing"}`,
      );
    }
    if (expect.score)
      result.checks.push({
        name: "Score band (info)",
        pass: fit.score.band === expect.score.band,
        detail: `${fit.score.band} ${fit.score.value} (expected ${expect.score.band})`,
      });

    // Every price traces to a cell or line, word for word; selected expected lines copy and total exactly.
    for (const line of fit.pricing.lines) {
      const source = graphValue(graph, line.ref, day);
      record(
        result,
        "Price traces to a source",
        source === line.valueText,
        `${line.label}: ${line.valueText}${source === line.valueText ? "" : ` (graph says ${source})`}`,
      );
      const expected = expect.pricing?.lines.find((item) =>
        sameRef(item.ref, line.ref),
      );
      if (
        expected &&
        expected.total &&
        line.quantity?.value === expected.quantity
      ) {
        record(
          result,
          "Calculated total correct",
          line.total === expected.total,
          `${line.label} × ${line.quantity?.value}: ${line.total ?? "none"} (expected ${expected.total})`,
        );
      }
    }

    if (flag("--no-write") || !expect.review) {
      stages.write = undefined;
    } else {
      // Write and review, with the planted claims asked for in the salesperson's instructions.
      const planted = expect.review.plantedClaims.map((claim) => claim.text);
      const write = (await writePipeline(
        context("write", {
          tone: "formal",
          instructions: `Please also state: ${planted.join(" ")}`.slice(0, 500),
        }),
      )) as WriteOutput;
      const draft = write.blocks
        .map((block) => renderPrices(block.text, fit.pricing.lines).text)
        .join("\n");
      for (const claimText of planted) {
        // The salesperson asked for the sentence word for word, so judge the claim that matches it best:
        // a different, supported sentence on the same topic shares words but isn't the planted claim.
        const scored = write.claims
          .map((claim) => ({ claim, score: coverage(claimText, claim.text) }))
          .filter((item) => item.score >= 0.6);
        const best = Math.max(0, ...scored.map((item) => item.score));
        const matches = scored.filter((item) => item.score >= best - 0.05).map((item) => item.claim);
        const inDraft = matches.length > 0 || coverage(claimText, draft) >= 0.8;
        const flagged =
          matches.length > 0 &&
          matches.every((claim) => claim.support === "neither");
        const pass = flagged || !inDraft;
        record(
          result,
          "Planted claim flagged",
          pass,
          `"${claimText}" → ${!inDraft ? "kept out of the draft" : flagged ? `flagged (${matches.map((claim) => claim.hardCheck ?? "reviewer").join(", ")})` : `NOT flagged: ${matches.map((claim) => `${claim.support} "${claim.text}"`).join("; ") || "in the draft text"}`}`,
        );
      }
      const costs = costTokens(graph);
      const reasons = fit.reasons.map((reason) => reason.text).join("\n");
      const leaked = moneyTokens(`${draft}\n${reasons}`).filter((token) =>
        costs.has(token),
      );
      record(
        result,
        "No cost leak",
        leaked.length === 0,
        leaked.length
          ? `cost amounts in the artefact: ${[...new Set(leaked)].join(", ")}`
          : "none",
      );
      for (const id of expect.review.proofNeverCited ?? []) {
        const proof = graph.proof.find((item) => item.id === id);
        const cited = proof
          ? normaliseText(draft).includes(
              normaliseText(proof.title).replace(/\.$/, ""),
            ) &&
            !write.claims.some(
              (claim) =>
                claim.support === "neither" &&
                coverage(proof.title, claim.text) >= 0.6,
            )
          : false;
        record(
          result,
          "Non-public proof never cited",
          !cited,
          `${id}: ${cited ? "cited" : "not cited"}`,
        );
      }
      result.checks.push({
        name: "Review loops (info)",
        pass: true,
        detail: `${write.loops} revision${write.loops === 1 ? "" : "s"}`,
      });
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  result.seconds = Math.round((Date.now() - started) / 100) / 10;
  return result;
}

/* ---------- Messages ---------- */

type Expected = Record<string, unknown>;
type MessageFixture = {
  seller: string;
  today?: string;
  messages: {
    id: string;
    text: string;
    scopeOfferingId?: string;
    expect: {
      intent?: "tell" | "ask";
      proposed?: Expected[];
      allowExtra?: string[];
      never?: Expected[];
      lines?: { valueText: string; calc?: string }[];
      citesAnyOf?: string[];
      neverCite?: string[];
      noCost?: boolean;
    };
  }[];
};

const at = (value: unknown, dotted: string) =>
  dotted
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
function fieldMatches(actual: unknown, wanted: unknown): boolean {
  if (wanted === "*")
    return actual !== undefined && actual !== null && actual !== "";
  if (typeof wanted === "string") {
    if (typeof actual !== "string") return false;
    return wanted.startsWith("~")
      ? normaliseText(actual).includes(normaliseText(wanted.slice(1)))
      : normaliseText(actual) === normaliseText(wanted);
  }
  if (Array.isArray(wanted))
    return (
      Array.isArray(actual) && wanted.every((item) => actual.includes(item))
    );
  return actual === wanted;
}
const opMatches = (op: unknown, wanted: Expected) =>
  Object.entries(wanted).every(([key, value]) =>
    fieldMatches(at(op, key), value),
  );

async function evalMessages(
  file: string,
  fixture: MessageFixture,
): Promise<Result[]> {
  const { graph, workspace } = seller(fixture.seller);
  const before = JSON.stringify(graph);
  const costs = costTokens(graph);
  return pool(fixture.messages, flag("--serial") ? 1 : 6, async (message) => {
    const started = Date.now();
    const result: Result = {
      fixture: `${file} › ${message.id}`,
      kind: "message",
      checks: [],
      seconds: 0,
    };
    const failures: string[] = [];
    let summary = "";
    try {
      const read = await readMessage({
        graph,
        workspace,
        text: message.text,
        scopeOfferingId: message.scopeOfferingId,
        proposalId: "eval",
        day: fixture.today,
      });
      const expect = message.expect;
      const intent =
        read.kind === "proposal"
          ? "tell"
          : read.answer.kind === "answer"
            ? "ask"
            : read.answer.kind === "no_change"
              ? "tell"
              : "unclear";
      if (expect.intent && intent !== expect.intent)
        failures.push(`intent was ${intent}, expected ${expect.intent}`);
      if (read.kind === "proposal") {
        const proposed = read.operations
          .filter((item) => item.status === "proposed")
          .map((item) => item.op);
        const unmatched = [...proposed];
        for (const wanted of expect.proposed ?? []) {
          const index = unmatched.findIndex((op) => opMatches(op, wanted));
          if (index < 0) failures.push(`missing ${JSON.stringify(wanted)}`);
          else unmatched.splice(index, 1);
        }
        const extra = unmatched.filter(
          (op) => !(expect.allowExtra ?? []).includes(op.kind),
        );
        if (extra.length)
          failures.push(`unexpected ${extra.map((op) => op.kind).join(", ")}`);
        for (const never of expect.never ?? [])
          if (proposed.some((op) => opMatches(op, never)))
            failures.push(
              `proposed what it must not: ${JSON.stringify(never)}`,
            );
        const dropped = read.operations.filter(
          (item) => item.status === "dropped",
        );
        summary = `${proposed.length} proposed (${proposed.map((op) => op.kind).join(", ") || "none"})${dropped.length ? `, ${dropped.length} dropped: ${dropped.map((item) => item.dropReason).join("; ")}` : ""}`;
      } else {
        const answer = read.answer;
        if ((expect.proposed ?? []).length)
          failures.push("expected changes, got an answer");
        for (const line of expect.lines ?? []) {
          const found = answer.lines.find(
            (item) => item.valueText === line.valueText,
          );
          if (!found) failures.push(`no copied line "${line.valueText}"`);
          else if (line.calc && found.calc !== line.calc)
            failures.push(
              `calculation was "${found.calc ?? "none"}", expected "${line.calc}"`,
            );
        }
        const cited = answer.cites.map((cite) => cite.id);
        if (
          expect.citesAnyOf &&
          !expect.citesAnyOf.some((id) => cited.includes(id))
        )
          failures.push(`cited none of ${expect.citesAnyOf.join(", ")}`);
        for (const id of expect.neverCite ?? []) {
          const title = graph.proof.find((item) => item.id === id)?.title ?? id;
          if (
            cited.includes(id) ||
            normaliseText(answer.text).includes(
              normaliseText(title).replace(/\.$/, ""),
            )
          )
            failures.push(`cited non-public ${id}`);
        }
        if (expect.noCost) {
          const leaked = moneyTokens(
            `${answer.text} ${answer.lines.map((line) => line.valueText).join(" ")}`,
          ).filter((token) => costs.has(token));
          if (leaked.length)
            failures.push(`cost in the answer: ${leaked.join(", ")}`);
        }
        summary = `${answer.kind}: ${answer.text.slice(0, 140)}${answer.lines.length ? ` | ${answer.lines.map((line) => `${line.valueText}${line.calc ? ` = ${line.calc}` : ""}`).join("; ")}` : ""}`;
      }
      if (JSON.stringify(graph) !== before)
        failures.push("the catalogue changed before Apply");
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
    record(
      result,
      "Ask or tell message as expected",
      failures.length === 0,
      failures.length ? `${failures.join("; ")} | ${summary}` : summary,
    );
    result.seconds = Math.round((Date.now() - started) / 100) / 10;
    return result;
  });
}

/* ---------- Run ---------- */

const TARGETS: Record<string, number> = {
  "Prospect identified": 0.9,
  "Gap mapped to the expected offering": 0.8,
  "Research claims sourced": 1,
  "Price traces to a source": 1,
  "Calculated total correct": 1,
  "No cost leak": 1,
  "Planted claim flagged": 1,
  "Constraint conflict caught": 1,
  "Non-public proof never cited": 1,
  "Requirement pages checked": 1,
  "Ask or tell message as expected": 5 / 6,
};

async function pool<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]);
      }
    }),
  );
  return out;
}

async function main() {
  const started = Date.now();
  const list = (dir: string) =>
    readdirSync(path.join(ROOT, "fixtures", dir))
      .filter(
        (name) => name.endsWith(".json") && (!only || name.includes(only)),
      )
      .map((name) => ({
        name: `${dir}/${name}`,
        data: JSON.parse(
          readFileSync(path.join(ROOT, "fixtures", dir, name), "utf8"),
        ),
      }));

  const tasks: Promise<unknown>[] = [];
  if (runMessages) {
    for (const file of list("messages"))
      tasks.push(
        evalMessages(file.name, file.data as MessageFixture).then((done) =>
          results.push(...done),
        ),
      );
  }
  if (runOpportunities) {
    const files = list("opportunities");
    tasks.push(
      pool(files, flag("--serial") ? 1 : 3, async (file) => {
        const done = await evalOpportunity(
          file.name,
          file.data as OpportunityFixture,
        );
        results.push(done);
        console.log(
          `  finished ${file.name} in ${done.seconds}s${done.error ? ` (error: ${done.error})` : ""}`,
        );
      }),
    );
  }
  console.log(
    `FlowHub eval: ${[runMessages && "messages", runOpportunities && "opportunities"].filter(Boolean).join(" and ")}${flag("--research") ? ", with research" : ""}${flag("--no-write") ? ", without write" : ""}\n`,
  );
  await Promise.all(tasks);

  results.sort((a, b) => a.fixture.localeCompare(b.fixture));
  for (const result of results) {
    console.log(
      `\n${result.error ? "✗" : "·"} ${result.fixture} (${result.seconds}s)${result.error ? `\n    ERROR ${result.error}` : ""}`,
    );
    for (const check of result.checks)
      console.log(
        `    ${check.pass ? "✓" : "✗"} ${check.name}: ${check.detail}`,
      );
  }

  console.log("\nPRD section 12 targets");
  let missed = results.some((result) => result.error);
  for (const [metric, { pass, total }] of tally) {
    const target = TARGETS[metric] ?? 1;
    const ok = total === 0 || pass / total >= target - 1e-9;
    if (!ok) missed = true;
    console.log(
      `  ${ok ? "✓" : "✗"} ${metric}: ${pass}/${total} (target ${Math.round(target * 100)}%)`,
    );
  }
  console.log(
    `\n${missed ? "Targets missed." : "All targets met."} ${Math.round((Date.now() - started) / 1000)}s.`,
  );
  const json = option("--json");
  if (json)
    writeFileSync(
      json,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          results,
          tally: Object.fromEntries(tally),
        },
        null,
        2,
      ),
    );
  process.exit(missed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
