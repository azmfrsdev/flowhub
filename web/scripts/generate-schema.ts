/**
 * Generates docs/schema/offering-graph.v1.schema.json from the Zod schema
 * (ADR-0001 D5, ADR-0010 D4). The JSON Schema is the published R12 exchange
 * format. Never edit the output by hand; run `npm run schema` instead.
 * With --check, exits 1 if the committed file has drifted (used in CI).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { OfferingGraphExport } from "../src/lib/schema/offering-graph";

const target = resolve(import.meta.dirname, "../../docs/schema/offering-graph.v1.schema.json");

const schema = {
  $id: "https://flowhub.example/schema/offering-graph.v1.schema.json",
  title: "FlowHub offering graph, version 1",
  ...z.toJSONSchema(OfferingGraphExport, { target: "draft-2020-12", io: "input" }),
};
const text = JSON.stringify(schema, null, 2) + "\n";

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    // Missing file counts as drift.
  }
  if (current !== text) {
    console.error("docs/schema/offering-graph.v1.schema.json is out of date. Run `npm run schema`.");
    process.exit(1);
  }
  console.log("Schema is up to date.");
} else {
  writeFileSync(target, text);
  console.log(`Wrote ${target}`);
}
