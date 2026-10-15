// Heist progress for the demo, kept in this browser only.
const KEY = "chogswipe.cleared";

export function cleared(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function markCleared(slug: string) {
  try {
    const s = cleared();
    s.add(slug);
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    // storage unavailable: progress just isn't remembered
  }
}

// Best run per heist: fastest escape, and the most stars earned (they can come from different runs).
const BEST = "chogswipe.best";

export interface Best {
  ticks: number;
  stars: number;
}

export function bests(): Record<string, Best> {
  try {
    return JSON.parse(localStorage.getItem(BEST) ?? "{}") as Record<string, Best>;
  } catch {
    return {};
  }
}

/** Saves the run if it beats the record; returns true for a new best time. */
export function recordRun(slug: string, ticks: number, stars: number): boolean {
  const all = bests();
  const old = all[slug];
  const faster = !old || ticks < old.ticks;
  all[slug] = { ticks: faster ? ticks : old.ticks, stars: Math.max(stars, old?.stars ?? 0) };
  try {
    localStorage.setItem(BEST, JSON.stringify(all));
  } catch {
    // storage unavailable
  }
  return faster;
}

export const starText = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

export const clock = (ticks: number, hz = 30) => {
  const s = ticks / hz;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};
