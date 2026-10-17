/**
 * Renames sample workspaces created before 2026-10-17 in place (ADR-0012
 * amendment): Kelapa Cloud becomes Olvessa Cloud, Giliran becomes Yorvex
 * Workforce, Rantai Supply becomes Trassoq Hardware. It sets the workspace's
 * name and sample ID, and replaces the old names in every record under it
 * (opportunities and their runs, proposals, audit entries and so on).
 *
 * Dry run by default. The project is required, so it never runs against the
 * wrong one by accident:
 *   npx tsx scripts/rename-samples.ts --project flowhub-cup26-dev
 *   npx tsx scripts/rename-samples.ts --project flowhub-cup26-dev --apply
 */
import { initializeApp } from "firebase-admin/app";
import { type DocumentReference, getFirestore } from "firebase-admin/firestore";

const LEGACY: Record<string, { seller: string; name: string }> = {
  "kelapa-cloud": { seller: "olvessa", name: "Olvessa Cloud" },
  giliran: { seller: "yorvex", name: "Yorvex Workforce" },
  "rantai-supply": { seller: "trassoq", name: "Trassoq Hardware" },
};
// Full names first, then the short forms. "Giliran Shifts" becomes "Yorvex Shifts".
const TEXT: [string, string][] = [
  ["Kelapa Cloud", "Olvessa Cloud"],
  ["Rantai Supply", "Trassoq Hardware"],
  ["Kelapa", "Olvessa"],
  ["Rantai", "Trassoq"],
  ["Giliran", "Yorvex"],
];

const args = process.argv.slice(2);
const project = args[args.indexOf("--project") + 1];
const apply = args.includes("--apply");
if (!args.includes("--project") || !project || project.startsWith("--")) {
  console.error("Pass --project <firebase project id>.");
  process.exit(1);
}

initializeApp({ projectId: project });
const db = getFirestore();

/** Replaces the old names in every string, keeping Timestamps and other non-plain values as they are. */
function rename(value: unknown): unknown {
  if (typeof value === "string") return TEXT.reduce((text, [from, to]) => text.split(from).join(to), value);
  if (Array.isArray(value)) return value.map(rename);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rename(item)]));
  }
  return value;
}

type Write = { ref: DocumentReference; data: Record<string, unknown> };

async function collect(ref: DocumentReference, writes: Write[]): Promise<number> {
  let seen = 0;
  for (const collection of await ref.listCollections()) {
    const snap = await collection.get();
    for (const doc of snap.docs) {
      seen += 1;
      const data = doc.data();
      const next = rename(data) as Record<string, unknown>;
      if (JSON.stringify(next) !== JSON.stringify(data)) writes.push({ ref: doc.ref, data: next });
      seen += await collect(doc.ref, writes);
    }
  }
  return seen;
}

async function main() {
  const workspaces = await db.collection("workspaces").where("sample", "in", Object.keys(LEGACY)).get();
  console.log(`${project}: ${workspaces.size} sample ${workspaces.size === 1 ? "workspace" : "workspaces"} to rename${apply ? "" : " (dry run)"}`);

  for (const workspace of workspaces.docs) {
    const target = LEGACY[String(workspace.get("sample"))];
    const writes: Write[] = [{ ref: workspace.ref, data: { ...(rename(workspace.data()) as Record<string, unknown>), name: target.name, sample: target.seller } }];
    const seen = await collect(workspace.ref, writes);
    console.log(`- ${workspace.get("name")} → ${target.name}${workspace.get("deletedAt") ? " (replaced earlier)" : ""}: ${writes.length - 1} of ${seen} records mention an old name`);
    if (!apply) continue;
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      for (const write of writes.slice(i, i + 400)) batch.set(write.ref, write.data);
      await batch.commit();
    }
  }
  if (!apply && workspaces.size) console.log("Nothing written. Add --apply to rename them.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
