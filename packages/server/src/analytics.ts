// Analytics for the team dashboard: anonymous events in, daily and per-heist summaries out.
import { LOCATIONS } from "@chogswipe/sim";
import type { GameEvent } from "./store.js";

export const EVENT_TYPES = ["visit", "heist_start", "heist_end"] as const;
const MODES = new Set(["lore", "daily", "test", "live"]);
const RESULTS = new Set(["escaped", "caught", "knocked-out", "timeout"]);
const SLUGS = new Set(LOCATIONS.map((l) => l.slug));
const DAY = 86_400_000;

/** Keep only the fields the dashboard reads, each checked; anything else is dropped. */
export function cleanEvent(type: unknown, visitor: unknown, data: unknown): Omit<GameEvent, "at"> | null {
  if (typeof type !== "string" || !(EVENT_TYPES as readonly string[]).includes(type)) return null;
  if (typeof visitor !== "string" || !/^[a-z0-9]{8,40}$/.test(visitor)) return null;
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const out: GameEvent["data"] = {};
  if (d.device === "phone" || d.device === "desktop") out.device = d.device;
  if (typeof d.ref === "string" && /^[a-z0-9.-]{1,60}$/i.test(d.ref)) out.ref = d.ref.toLowerCase();
  if (typeof d.mode === "string" && MODES.has(d.mode)) out.mode = d.mode;
  if (typeof d.slug === "string" && SLUGS.has(d.slug)) out.slug = d.slug;
  if (typeof d.result === "string" && RESULTS.has(d.result)) out.result = d.result;
  if (Number.isInteger(d.stars) && (d.stars as number) >= 0 && (d.stars as number) <= 3) out.stars = d.stars as number;
  if (typeof d.secs === "number" && d.secs >= 0 && d.secs <= 600) out.secs = Math.round(d.secs * 10) / 10;
  return { type, visitor, data: out };
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface Summary {
  days: { day: string; visitors: number; plays: number; escapes: number }[];
  totals: { visitorsToday: number; visitors7d: number; visitors30d: number; plays7d: number; escapes7d: number; playsToday: number };
  devices7d: { phone: number; desktop: number };
  modes7d: Record<string, number>;
  referrers7d: { host: string; visitors: number }[];
  heists7d: { slug: string; name: string; starts: number; escapes: number; avgEscapeSecs: number | null; threeStars: number }[];
}

/** Everything the dashboard shows from events: the last 14 days by day, and 7-day breakdowns. */
export function summarize(events: GameEvent[], now: number): Summary {
  const today = utcDay(now);
  const since7 = now - 7 * DAY, since30 = now - 30 * DAY;
  const byDay = new Map<string, { v: Set<string>; plays: number; escapes: number }>();
  for (let i = 13; i >= 0; i--) byDay.set(utcDay(now - i * DAY), { v: new Set(), plays: 0, escapes: 0 });
  const v7 = new Set<string>(), v30 = new Set<string>(), vToday = new Set<string>();
  const dev = new Map<string, string>(); // visitor -> device (last seen)
  const refs = new Map<string, Set<string>>();
  const modes: Record<string, number> = {};
  const heists = new Map<string, { starts: number; escapes: number; secs: number[]; three: number }>();
  let plays7 = 0, escapes7 = 0, playsToday = 0;
  for (const e of events) {
    if (e.at < since30) continue;
    const day = byDay.get(utcDay(e.at));
    v30.add(e.visitor);
    day?.v.add(e.visitor);
    const in7 = e.at >= since7;
    if (in7) v7.add(e.visitor);
    if (utcDay(e.at) === today) vToday.add(e.visitor);
    if (e.type === "visit" && in7) {
      if (e.data.device) dev.set(e.visitor, String(e.data.device));
      if (e.data.ref) {
        const host = String(e.data.ref);
        if (!refs.has(host)) refs.set(host, new Set());
        refs.get(host)!.add(e.visitor);
      }
    }
    const slug = e.data.slug ? String(e.data.slug) : null;
    const h = slug ? (heists.get(slug) ?? heists.set(slug, { starts: 0, escapes: 0, secs: [], three: 0 }).get(slug)!) : null;
    if (e.type === "heist_start") {
      if (day) day.plays++;
      if (utcDay(e.at) === today) playsToday++;
      if (in7) {
        plays7++;
        const m = String(e.data.mode ?? "lore");
        modes[m] = (modes[m] ?? 0) + 1;
        if (h) h.starts++;
      }
    }
    if (e.type === "heist_end" && e.data.result === "escaped") {
      if (day) day.escapes++;
      if (in7) {
        escapes7++;
        if (h) {
          h.escapes++;
          if (typeof e.data.secs === "number") h.secs.push(e.data.secs);
          if (e.data.stars === 3) h.three++;
        }
      }
    }
  }
  const devices7d = { phone: 0, desktop: 0 };
  for (const d of dev.values()) if (d === "phone" || d === "desktop") devices7d[d]++;
  return {
    days: [...byDay].map(([day, x]) => ({ day, visitors: x.v.size, plays: x.plays, escapes: x.escapes })),
    totals: { visitorsToday: vToday.size, visitors7d: v7.size, visitors30d: v30.size, plays7d: plays7, escapes7d: escapes7, playsToday },
    devices7d,
    modes7d: modes,
    referrers7d: [...refs].map(([host, s]) => ({ host, visitors: s.size })).sort((a, b) => b.visitors - a.visitors).slice(0, 6),
    heists7d: LOCATIONS.map((l) => {
      const h = heists.get(l.slug);
      const secs = h?.secs ?? [];
      return {
        slug: l.slug,
        name: l.name,
        starts: h?.starts ?? 0,
        escapes: h?.escapes ?? 0,
        avgEscapeSecs: secs.length ? Math.round((secs.reduce((a, b) => a + b, 0) / secs.length) * 10) / 10 : null,
        threeStars: h?.three ?? 0,
      };
    }),
  };
}
