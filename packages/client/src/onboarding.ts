// First-run guidance: one next action at a time, then out of the way.
const KEY = "chogswipe.onboard";
type Step = "pick" | "heist" | "done";

export function onboardStep(): Step {
  try {
    return (localStorage.getItem(KEY) as Step | null) ?? "pick";
  } catch {
    return "done";
  }
}

export function advance(to: Step) {
  try {
    localStorage.setItem(KEY, to);
  } catch {
    /* ignore */
  }
}
