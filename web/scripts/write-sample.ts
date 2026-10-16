/**
 * Validates each sample seller against the R12 schema and writes
 * fixtures/sample/<seller>.graph.json (PRD Q24, ADR-0012).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { OfferingGraphExport } from "../src/lib/schema/offering-graph";
import { SAMPLES } from "../src/lib/sample";

for (const { seller, graph } of Object.values(SAMPLES)) {
  const parsed = OfferingGraphExport.parse(graph);
  const target = resolve(import.meta.dirname, `../../fixtures/sample/${seller}.graph.json`);
  writeFileSync(target, JSON.stringify(parsed, null, 2) + "\n");
  console.log(`Wrote ${target}`);
}
