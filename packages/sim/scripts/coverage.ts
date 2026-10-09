// Print how many Chogs get each gadget. Usage: pnpm --filter @chogswipe/sim gadgets
import { readFileSync } from "node:fs";
import { loadoutFor, type Loadout } from "../src/loadout.js";

const files = JSON.parse(readFileSync(new URL("../../../data/chog-metadata.json", import.meta.url), "utf8")).files;
const loads: Loadout[] = Object.values(files).map((t) => loadoutFor(t as Record<string, string>));
console.log(`${loads.length} Chogs mapped`);
for (const key of ["tier", "trap", "scout", "head", "body", "special", "aura"] as const) {
  const counts = new Map<string, number>();
  for (const l of loads) counts.set(String(l[key]), (counts.get(String(l[key])) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  console.log(`\n${key}: ${sorted.map(([k, v]) => `${k}=${v}`).join(", ")}`);
}
