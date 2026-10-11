// The loading page in index.html: shown for at least MIN_MS, and until the game's first screen is ready.
import type Phaser from "phaser";

const MIN_MS = 3000;
const q = new URLSearchParams(location.search);
// debug: ?introAt=<ms> freezes the loading heist at that moment and keeps the loader up
const FREEZE = q.has("introAt") ? Number(q.get("introAt")) : null;
const shownAt = performance.now();

const STATUS = ["Picking the lock…", "Counting the $CHOG…", "Dodging the Fwog bouncer…", "Tiptoeing past the traps…"];
const TIPS = [
  "Your Chog's traits are its gadgets. Check them before every heist.",
  "Traps hide until you scout. Press Q when you enter a room.",
  "If the guard sees you, it chases you. Sneak up behind it, or jump it with Space.",
  "Hold F at the vault to swipe. The loot only counts if you get back out the front door.",
  "Set your own traps in the Hideout tab. Raiders will walk right into them.",
];

let ticker = 0;
let heist = 0;
let n = 0;

// sprite frames in the 156px-tall copy of the pose sheet (see index.html)
const FRAME = 156;
const POSE = { idle: 0, run1: 1, run2: 2, jump: 3, carry: 5, win: 6 } as const;

/**
 * A tiny heist on loop: run to the coin, it pops into a money bag,
 * the Chog slings it over its shoulder and carries it off.
 */
function playHeist() {
  const stage = document.querySelector<HTMLElement>(".stage");
  const runner = document.getElementById("runner");
  const loot = document.getElementById("loot");
  if (!stage || !runner || !loot) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LOOP = 3600;
  const start = performance.now();
  const pose = (p: keyof typeof POSE) => (runner.style.backgroundPosition = `${-POSE[p] * FRAME}px 0`);
  const puffs = Array.from({ length: 6 }, () => {
    const d = document.createElement("div");
    d.className = "poof";
    stage.appendChild(d);
    return d;
  });

  const tick = () => {
    const W = stage.clientWidth;
    const mid = W / 2;
    const stopAt = mid - 150; // runner's left edge when it reaches the coin
    const t = FREEZE !== null ? FREEZE : reduce ? 1500 : (performance.now() - start) % LOOP;
    let x: number;
    let bob = 0;
    // 1. run in
    if (t < 1300) {
      x = -160 + ((stopAt + 160) * t) / 1300;
      pose(Math.floor(t / 130) % 2 ? "run2" : "run1");
      bob = -Math.abs(Math.sin((t / 130) * Math.PI)) * 6;
      loot.className = "loot coin";
      loot.textContent = "$";
      loot.style.transform = "";
      loot.style.opacity = "1";
      puffs.forEach((p) => (p.style.opacity = "0"));
    }
    // 2. the coin pops into a money bag
    else if (t < 1750) {
      x = stopAt;
      pose("idle");
      const k = (t - 1300) / 450;
      if (k > 0.15) {
        loot.className = "loot bag";
        loot.textContent = "$";
        const s = k < 0.4 ? 0.4 + ((k - 0.15) / 0.25) * 0.9 : 1.3 - (k - 0.4) * 0.5;
        loot.style.transform = `scale(${s})`;
        puffs.forEach((p, i) => {
          const a = (i / puffs.length) * Math.PI * 2;
          p.style.opacity = String(1 - k);
          p.style.transform = `translate(${Math.cos(a) * 60 * k}px, ${Math.sin(a) * 40 * k - 20 * k}px)`;
        });
      }
    }
    // 3. sling it over the shoulder
    else if (t < 2100) {
      x = stopAt;
      pose("win");
      const k = (t - 1750) / 350;
      const toX = stopAt + 70 - mid; // shoulder, relative to the coin's spot
      loot.style.transform = `translate(${toX * k}px, ${-100 * Math.sin(k * Math.PI * 0.75)}px) rotate(${-40 * k}deg) scale(${1 - 0.3 * k})`;
      puffs.forEach((p) => (p.style.opacity = "0"));
    }
    // 4. carry it away
    else {
      loot.style.opacity = "0"; // the carry pose already has the sack on its shoulder
      const k = (t - 2100) / (LOOP - 2100);
      x = stopAt + (W + 20 - stopAt) * k;
      pose("carry");
      bob = -Math.abs(Math.sin(((t - 2100) / 140) * Math.PI)) * 7;
    }
    runner.style.transform = `translate(${x + 160}px, ${bob}px)`;
    if (!reduce && FREEZE === null) heist = requestAnimationFrame(tick);
  };
  tick();
}

export function startLoader() {
  if (new URLSearchParams(location.search).has("nointro")) return finishNow();
  const status = document.getElementById("loader-status");
  const tip = document.getElementById("loader-tip");
  if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]!;
  playHeist();
  ticker = window.setInterval(() => {
    n++;
    if (status) status.textContent = STATUS[n % STATUS.length]!;
  }, 750);
}

/** Fade the loader out once the first scene is running and at least MIN_MS have passed. */
export function finishLoader(game: Phaser.Game) {
  const check = () => {
    const ready = game.isBooted && game.scene.getScenes(true).some((s) => s.sys.settings.status >= 5);
    if (!ready) return void window.setTimeout(check, 100);
    if (FREEZE !== null) return;
    window.setTimeout(finishNow, Math.max(0, MIN_MS - (performance.now() - shownAt)));
  };
  check();
}

function finishNow() {
  window.clearInterval(ticker);
  cancelAnimationFrame(heist);
  const el = document.getElementById("loader");
  if (!el) return;
  const status = document.getElementById("loader-status");
  if (status) status.textContent = "You're in.";
  el.classList.add("done");
  window.setTimeout(() => el.remove(), 450);
}
