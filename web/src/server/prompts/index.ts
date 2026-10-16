import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Prompts live as Markdown files next to this one, versioned with the code
 * (ADR-0010 D5). next.config.ts traces them into the standalone build.
 */
const cache = new Map<string, string>();

export function prompt(name: string, values: Record<string, string> = {}): string {
  let text = cache.get(name);
  if (text === undefined) {
    text = readFileSync(path.join(process.cwd(), "src", "server", "prompts", `${name}.md`), "utf8");
    cache.set(name, text);
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}
