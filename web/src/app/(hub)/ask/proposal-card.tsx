"use client";

import { AlertTriangle, ArrowRight, FileText, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AiMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { malaysiaDay } from "@/lib/offerings/view";
import type { CheckedOperation, Operation, Proposal } from "@/lib/schema";
import { cn } from "cn";
import { type AskActionResult, applyProposalAction, discardProposalAction, editOperationAction, includeOperationAction, undoProposalAction } from "./actions";

const longDay = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

function kindLabel(op: Operation): string {
  switch (op.kind) {
    case "create_opportunity":
      return "New opportunity";
    case "add_note":
      return "Add a note";
    case "add_feature":
      return "Add to scope";
    case "update_feature":
      return "Change a feature";
    case "set_price_cell":
    case "set_fee_line_price":
      return "Change a price";
    case "add_fee_line":
      return "Add a price line";
    case "add_proof":
      return "Add a result you can cite";
    case "add_constraint":
      return op.offeringIds.length ? "Add an exclusion" : "Add a selling rule";
    case "add_partner":
      return `Add a ${op.relationship}`;
    case "link_document":
      return "File it under";
  }
}

/** One Ask or tell proposal (FR-ASK-2 to FR-ASK-7). Every value shown came from code-checked operations. */
export function ProposalCard({ proposal, names, canEdit, highlight }: { proposal: Proposal; names: Map<string, string>; canEdit: boolean; highlight: boolean }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ text: string; error: boolean; href?: string } | null>(null);
  const run = (action: () => Promise<AskActionResult>, done?: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setNotice({ text: result.error, error: true });
      else setNotice(result.message || done || result.href ? { text: result.message ?? done ?? "", error: false, href: result.href } : null);
    });

  const open = proposal.status === "proposed";
  const included = proposal.operations.filter((item) => item.status === "proposed").length;
  const applied = proposal.status === "applied" || proposal.status === "partially_applied";
  const editableProposal = open || (proposal.status === "discarded" && !proposal.operations.some((item) => item.status === "discarded"));

  return (
    <section
      id={`proposal-${proposal.id}`}
      aria-label="FlowHub's proposal"
      className={cn("flex flex-col gap-3 rounded-xl border bg-background p-3", highlight && "ring-3 ring-ai/40")}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">FlowHub · {time.format(new Date(proposal.createdAt))}</span>
        <p className="text-sm">
          {applied
            ? `${proposal.operations.filter((item) => item.status === "applied").length === 1 ? "1 change" : `${proposal.operations.filter((item) => item.status === "applied").length} changes`} applied.`
            : proposal.summary}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {proposal.operations.map((item) => (
          <OperationItem
            key={item.op.id}
            item={item}
            proposal={proposal}
            names={names}
            canChange={canEdit && editableProposal && !pending}
            canInclude={canEdit && open && !pending}
            onInclude={(include) => run(() => includeOperationAction(proposal.id, item.op.id, include))}
            onEdit={(patch) => run(() => editOperationAction(proposal.id, item.op.id, patch))}
          />
        ))}
      </ul>

      {notice ? (
        <p role={notice.error ? "alert" : "status"} className={cn("text-sm", notice.error ? "text-destructive" : "text-muted-foreground")}>
          {notice.text}{" "}
          {notice.href ? (
            <Link href={notice.href} className="text-link hover:underline">
              Open the deal room
            </Link>
          ) : null}
        </p>
      ) : null}

      {open && canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending || included === 0} onClick={() => run(() => applyProposalAction(proposal.id))}>
            {pending ? "Working…" : included === 1 ? "Apply" : included === 2 ? "Apply both" : `Apply all ${included}`}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => discardProposalAction(proposal.id))}>
            Discard
          </Button>
        </div>
      ) : null}

      {applied ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-ai-soft/60 px-3 py-2 text-sm">
          <span className="flex-1">
            Applied by {proposal.appliedBy}. {proposal.operations.some((item) => item.op.kind === "create_opportunity" && item.status === "applied") ? "Intake is reading the lead; confirm the prospect in the deal room. " : ""}
            Each change keeps your message as its source.
          </span>
          {canEdit ? (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => undoProposalAction(proposal.id), "Undone. The changes are back to proposed.")}>
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}

      {proposal.status === "discarded" && proposal.operations.some((item) => item.status === "discarded") ? <p className="text-sm text-muted-foreground">Discarded. Nothing was changed.</p> : null}
    </section>
  );
}

function StatusMarker({ item }: { item: CheckedOperation }) {
  if (item.status === "applied") return <AiMarker>Applied by {item.applied?.by ?? "you"}</AiMarker>;
  if (item.status === "proposed") return <AiMarker waiting>Proposed</AiMarker>;
  if (item.status === "dropped") return <span className="rounded-full bg-destructive/10 px-2 py-px text-xs font-semibold text-destructive">Dropped by the checks</span>;
  return <span className="rounded-full border px-2 py-px text-xs font-semibold text-muted-foreground">Left out</span>;
}

function OperationItem({
  item,
  proposal,
  names,
  canChange,
  canInclude,
  onInclude,
  onEdit,
}: {
  item: CheckedOperation;
  proposal: Proposal;
  names: Map<string, string>;
  canChange: boolean;
  canInclude: boolean;
  onInclude: (include: boolean) => void;
  onEdit: (patch: Record<string, string | boolean>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const op = item.op;
  const muted = item.status === "dropped" || item.status === "discarded";
  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border p-3", item.status === "proposed" && "border-attention/35 bg-attention-soft/30", muted && "bg-muted/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusMarker item={item} />
        <b className="text-sm">{kindLabel(op)}</b>
      </div>
      <p className="text-xs text-muted-foreground">
        {item.status === "applied" && item.href ? (
          <Link href={item.href} className="text-link hover:underline">
            {item.path}
          </Link>
        ) : (
          item.path
        )}
      </p>

      {editing ? (
        <EditForm
          op={op}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            setEditing(false);
            onEdit(patch);
          }}
        />
      ) : (
        <div className={cn(muted && "opacity-70")}>
          <Details op={op} names={names} proposal={proposal} />
        </div>
      )}

      {item.warning && item.status === "proposed" ? (
        <p className="flex items-start gap-1.5 rounded-md bg-attention-soft px-2.5 py-1.5 text-xs text-attention">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {item.warning}
        </p>
      ) : null}
      {item.status === "dropped" && item.dropReason ? <p className="text-xs text-destructive">{item.dropReason}</p> : null}

      {proposal.via === "document" ? (
        op.kind === "link_document" ? null : (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <FileText aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-link" />
            <span>
              From {proposal.input.fileName ?? "the file"}
              {item.source.locator.page ? ` p.${item.source.locator.page}` : ""}
              {item.source.quote ? (
                <>
                  : <q className="italic">{item.source.quote}</q>
                </>
              ) : null}
              {item.editedBy ? ` · Edited by ${item.editedBy}` : ""}
            </span>
          </p>
        )
      ) : (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MessageSquare aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-link" />
          <span>
            From your message: <q className="italic">{op.evidence}</q>
            {item.editedBy ? ` · Edited by ${item.editedBy}` : ""}
          </span>
        </p>
      )}

      {!editing && (canChange || canInclude) && item.status !== "applied" ? (
        <div className="flex gap-3 text-xs">
          {canChange && (item.status === "proposed" || item.status === "dropped") && fieldsFor(op).length > 0 ? (
            <button type="button" className="text-link hover:underline" onClick={() => setEditing(true)}>
              Edit
            </button>
          ) : null}
          {canInclude && item.status === "proposed" ? (
            <button type="button" className="text-link hover:underline" onClick={() => onInclude(false)}>
              Leave out
            </button>
          ) : null}
          {canInclude && item.status === "discarded" ? (
            <button type="button" className="text-link hover:underline" onClick={() => onInclude(true)}>
              Include again
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function Details({ op, names, proposal }: { op: Operation; names: Map<string, string>; proposal: Proposal }) {
  const list = (ids: string[]) => ids.map((id) => names.get(id) ?? "Unknown offering").join(", ");
  switch (op.kind) {
    case "set_price_cell":
    case "set_fee_line_price": {
      const before = op.before ?? "Not offered";
      const future = op.effectiveFrom && op.effectiveFrom > malaysiaDay();
      return (
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 font-mono text-[15px]">
            <span className="text-muted-foreground line-through">{before}</span>
            <ArrowRight aria-label="becomes" className="size-4 text-muted-foreground" />
            <b>{op.after}</b>
          </p>
          {future ? (
            <p className="text-xs text-muted-foreground">
              Starts <b className="text-foreground">{longDay(op.effectiveFrom!)}</b>. Until then, new deals still use {before}.
            </p>
          ) : null}
        </div>
      );
    }
    case "create_opportunity":
      return (
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <Row label="Prospect">
              <b>{op.prospectName}</b>
            </Row>
            {op.website ? <Row label="Website">{op.website}</Row> : null}
            {op.contact ? <Row label="Contact">{[op.contact.name, op.contact.role].filter(Boolean).join(", ")}</Row> : null}
            {op.interestedOfferingIds.length ? <Row label="Interested in">{list(op.interestedOfferingIds)}</Row> : null}
            {op.nextMeeting ? <Row label="Next meeting">{op.nextMeeting}</Row> : null}
            <Row label="Came in as">Told to FlowHub by {proposal.createdBy}</Row>
          </dl>
          {op.summary ? <p className="text-sm">{op.summary}</p> : null}
          {!op.website ? <p className="text-xs text-muted-foreground">No website was given. Intake looks for it, and you confirm the company before any research.</p> : null}
        </div>
      );
    case "add_note":
      return (
        <div className="flex flex-col gap-1">
          <p className="border-l-2 border-ai/40 pl-2.5 text-sm">{op.text}</p>
          {op.opportunityRef ? <p className="text-xs text-muted-foreground">Linked to the new opportunity.</p> : null}
        </div>
      );
    case "add_feature":
    case "update_feature":
      return (
        <p className="text-sm">
          <b>{op.name ?? "Same name"}</b>
          {op.description ? ` · ${op.description}` : ""}
        </p>
      );
    case "add_fee_line":
      return (
        <p className="text-sm">
          {op.label} · <span className="font-mono">{op.price}</span> <span className="text-muted-foreground">({op.basis.replace(/_/g, " ")})</span>
        </p>
      );
    case "add_proof":
      return (
        <div className="flex flex-col gap-1 text-sm">
          <b>{op.title}</b>
          {op.body ? <p>{op.body}</p> : null}
          <p className="text-xs text-muted-foreground">{op.isPublic ? "Public: proposals may cite it." : "Not public: proposals won't cite it until you mark it public."}</p>
        </div>
      );
    case "add_constraint":
      return (
        <div className="flex flex-col gap-1 text-sm">
          <p>{op.statement}</p>
          {op.insteadText ? <p className="text-xs text-muted-foreground">Instead: {op.insteadText}</p> : null}
        </div>
      );
    case "add_partner":
      return (
        <p className="text-sm">
          <b>{op.name}</b>
          {op.covers.length ? ` · covers ${op.covers.join(", ")}` : ""}
        </p>
      );
    case "link_document":
      return <p className="text-sm">{list(op.offeringIds)}: the file shows in their Sales material tabs.</p>;
  }
}

/** The fields a person may change before applying (FR-ASK-4). Mirrors EDITABLE in src/server/proposals/apply.ts. */
function fieldsFor(op: Operation): { name: string; label: string; value: string | boolean; long?: boolean; type?: "date" | "check" }[] {
  switch (op.kind) {
    case "set_price_cell":
    case "set_fee_line_price":
      return [
        { name: "after", label: "New price, exactly as you sell it", value: op.after },
        { name: "effectiveFrom", label: "Starts on (optional)", value: op.effectiveFrom ?? "", type: "date" },
      ];
    case "add_fee_line":
      return [
        { name: "label", label: "Line", value: op.label },
        { name: "price", label: "Price, exactly as you sell it", value: op.price },
      ];
    case "add_note":
      return [{ name: "text", label: "Note", value: op.text, long: true }];
    case "add_feature":
    case "update_feature":
      return [
        { name: "name", label: "Feature", value: op.name ?? "" },
        { name: "description", label: "What it covers", value: op.description ?? "", long: true },
      ];
    case "add_proof":
      return [
        { name: "title", label: "Title", value: op.title },
        { name: "body", label: "Result", value: op.body, long: true },
        { name: "isPublic", label: "Public: proposals may cite it", value: op.isPublic, type: "check" },
      ];
    case "add_constraint":
      return [
        { name: "statement", label: "Rule", value: op.statement },
        { name: "insteadText", label: "What you offer instead (optional)", value: op.insteadText ?? "" },
      ];
    case "add_partner":
      return [{ name: "name", label: "Name", value: op.name }];
    case "link_document":
      return [];
    case "create_opportunity":
      return [
        { name: "prospectName", label: "Prospect", value: op.prospectName },
        { name: "website", label: "Website (optional)", value: op.website ?? "" },
        { name: "contactName", label: "Contact", value: op.contact?.name ?? "" },
        { name: "contactRole", label: "Contact's role", value: op.contact?.role ?? "" },
        { name: "nextMeeting", label: "Next meeting", value: op.nextMeeting ?? "" },
      ];
  }
}

const field = "w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function EditForm({ op, onSave, onCancel }: { op: Operation; onSave: (patch: Record<string, string | boolean>) => void; onCancel: () => void }) {
  const fields = fieldsFor(op);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map((item) => [item.name, item.value])));
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(values);
      }}
    >
      {fields.map((item) => {
        const id = `${op.id}-${item.name}`;
        const value = values[item.name];
        if (item.type === "check")
          return (
            <label key={item.name} htmlFor={id} className="flex items-center gap-2 text-sm">
              <input id={id} type="checkbox" checked={value === true} onChange={(event) => setValues((v) => ({ ...v, [item.name]: event.target.checked }))} />
              {item.label}
            </label>
          );
        return (
          <label key={item.name} htmlFor={id} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {item.label}
            {item.long ? (
              <textarea id={id} rows={3} maxLength={2000} className={field} value={String(value)} onChange={(event) => setValues((v) => ({ ...v, [item.name]: event.target.value }))} />
            ) : (
              <input id={id} type={item.type === "date" ? "date" : "text"} maxLength={300} className={cn(field, item.name === "after" || item.name === "price" ? "font-mono" : "")} value={String(value)} onChange={(event) => setValues((v) => ({ ...v, [item.name]: event.target.value }))} />
            )}
          </label>
        );
      })}
      <p className="text-xs text-muted-foreground">Your edit is checked again, and recorded as yours.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
