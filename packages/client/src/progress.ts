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
