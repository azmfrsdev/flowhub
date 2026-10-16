import { FileText } from "lucide-react";
import Link from "next/link";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import type { Answer } from "@/lib/schema";

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
const CITE_LABEL = { offering: "Offering", feature: "Scope", proof: "Result", partner: "Partner", constraint: "Rule" } as const;

/** An Ask answer (FR-ASK-8): the model's words, prices copied by code, sums marked Calculated, every record linked. */
export function AnswerCard({ answer }: { answer: Answer }) {
  return (
    <section aria-label="FlowHub's answer" className="flex flex-col gap-2.5 rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">FlowHub · {time.format(new Date(answer.createdAt))}</span>
        {answer.notInHub ? <span className="rounded-full border px-2 py-px text-xs font-semibold text-muted-foreground">Not in the hub</span> : null}
      </div>
      <p className="text-sm whitespace-pre-wrap">{answer.text}</p>

      {answer.lines.length ? (
        <ul className="flex flex-col gap-2">
          {answer.lines.map((line) => (
            <li key={line.ref} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span>{line.label}</span>
                <b className="font-mono text-[13px]">{line.valueText}</b>
                <Link href={`/offerings/${line.offeringId}/pricing`} className="ml-auto">
                  <AiMarker>{line.where.split(" › ").slice(-2).join(" · ")}</AiMarker>
                </Link>
              </div>
              {line.calc ? (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-[13px]">{line.calc}</span>
                  <CalcMarker>Calculated</CalcMarker>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {answer.total ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Total: <b className="font-mono text-[13px]">{answer.total}</b>
          <CalcMarker>Calculated</CalcMarker>
        </p>
      ) : null}

      {answer.cites.length ? (
        <div className="flex flex-wrap gap-1.5">
          {answer.cites.map((cite) => (
            <Link key={cite.id} href={cite.href} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-card px-1.5 py-px text-xs hover:border-ink/40">
              <FileText aria-hidden="true" className="size-3 shrink-0 text-link" />
              <span className="text-muted-foreground">{CITE_LABEL[cite.kind]}:</span>
              <span className="truncate">{cite.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
