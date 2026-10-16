import { Bot, ChartColumn, Cloud, Mail, Package } from "lucide-react";
import { cn } from "cn";

const ICONS = [
  { match: /cloud|migrat/i, icon: Cloud, tone: "bg-accent text-accent-foreground" },
  { match: /data|analytic|bigquery/i, icon: ChartColumn, tone: "bg-attention-soft text-attention" },
  { match: /workspace|mail/i, icon: Mail, tone: "bg-fit-strong-soft text-fit-strong" },
  { match: /\bai\b|agent/i, icon: Bot, tone: "bg-muted text-foreground" },
];

/** A recognisable tile per offering, chosen from its name. Decorative only. */
export function OfferingIcon({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const { icon: Icon, tone } = ICONS.find((entry) => entry.match.test(name)) ?? { icon: Package, tone: "bg-muted text-foreground" };
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-lg", tone, size === "lg" ? "size-12" : "size-10")}>
      <Icon className={size === "lg" ? "size-6" : "size-5"} />
    </span>
  );
}

const STATUS = {
  active: "bg-fit-strong-soft text-fit-strong",
  pilot: "bg-attention-soft text-attention",
  retired: "bg-muted text-muted-foreground",
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS }) {
  return <span className={cn("rounded-full px-2 py-px text-xs font-semibold capitalize", STATUS[status])}>{status}</span>;
}

export function TypeBadge({ type }: { type: string }) {
  return <span className="rounded-full border px-2 py-px text-xs font-semibold text-muted-foreground capitalize">{type}</span>;
}
