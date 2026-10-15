// Scoring shared by the client and the referee: stars for a heist run, and the daily heist
// everyone plays on the same day with the same seed.
import { LOCATIONS, type Location } from "./locations.js";
import { TICK_HZ, type RaidOutcome } from "./raid.js";
import { DEMO_ROSTER } from "./roster.js";

export const parTicks = (loc: Pick<Location, "par">) => loc.par * TICK_HZ;

/** One star for swiping and getting out, one for never getting hurt, one for beating the heist's par time. */
export function starsFor(outcome: Pick<RaidOutcome, "result" | "lootBps" | "ticks" | "events">, loc: Pick<Location, "par">): number {
  if (outcome.result !== "escaped" || outcome.lootBps <= 0) return 0;
  const hurt = outcome.events.some((e) => e.type === "trap" || e.type === "scald" || e.type === "second-life");
  return 1 + (hurt ? 0 : 1) + (outcome.ticks <= parTicks(loc) ? 1 : 0);
}

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface Daily {
  day: string;
  location: Location;
  seed: number;
}

/** The daily heist: the lore heists in turn, one a day, with a seed fixed by the date. */
export function dailyHeist(day: string): Daily {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  if (!Number.isFinite(n)) throw new Error("bad day");
  const location = LOCATIONS[((n % LOCATIONS.length) + LOCATIONS.length) % LOCATIONS.length]!;
  let h = 2166136261;
  for (const c of `daily:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return { day, location, seed: h & 0x7fffffff };
}

/** Daily runs use the demo Chogs, so anyone can play and the referee knows every raider's traits. */
export const dailyChog = (id: number) => DEMO_ROSTER.find((c) => c.id === id);
