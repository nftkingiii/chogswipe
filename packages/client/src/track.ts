// Anonymous play analytics for the team dashboard (/admin): a random id kept in this browser, the device
// type, where the visit came from, and how heists go. No wallet, name or IP is sent.
import { API } from "./api.js";

const KEY = "chogswipe.vid";

function visitor(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[a-z0-9]{8,40}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("");
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "nostorage0";
  }
}

export function track(type: "visit" | "heist_start" | "heist_end", data: Record<string, string | number> = {}) {
  try {
    void fetch(`${API}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, visitor: visitor(), data }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // analytics never gets in the way of the game
  }
}

/** Once per page load: device type and the site the player came from. */
export function trackVisit() {
  const device = document.documentElement.classList.contains("phone") || matchMedia("(pointer: coarse)").matches ? "phone" : "desktop";
  let ref = "";
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    if (host && host !== location.hostname) ref = host.replace(/^www\./, "");
  } catch {
    /* no referrer */
  }
  track("visit", ref ? { device, ref } : { device });
}
