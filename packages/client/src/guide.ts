// How to play: one page, opened from the top bar on every menu screen, and once on a first visit.
import Phaser from "phaser";
import { castReady } from "./cast.js";
import { ACCENT_N, FONT_BODY, FONT_TITLE, INK_N, button, panel } from "./ui.js";
import { INK, PAPER } from "./art.js";

const SEEN = "chogswipe.guideSeen";

const STEPS: [title: string, body: string][] = [
  ["Pick a Chog", "Its NFT traits are its gadgets: eyes scout for traps, the head gives a perk, the body sets your speed, the accessory is a one-shot special."],
  ["Choose a heist", "Seven monanimal hideouts, each with its own rooms and traps. Sample Chogs can try the first two; your own Chog unlocks all seven. The Fwog Pond is the easiest."],
  ["Reach the vault", "Every hideout is laid out differently: read the heist card. ↑ takes stairs, launch pads and portals (↓ comes back down). Locked door? Hold F."],
  ["Mind the traps", "Traps are hidden until you scout: press Q. Jump them with SPACE. Hit too many and you're knocked out."],
  ["Dodge the guard", "If it sees you in front, it shouts \"!\" and chases you. Jump over it, sneak up behind it, or outrun it. Caught = raid over."],
  ["Swipe and get out", "Hold F at the vault to grab the loot, then run back out of the front door before the clock hits 0:00."],
];

/** Has this browser seen the guide yet? */
export function guideSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return true;
  }
}

export function showGuide(scene: Phaser.Scene) {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    /* ignore */
  }
  const parts: Phaser.GameObjects.GameObject[] = [];
  const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => (parts.push(o), o);
  const close = () => parts.forEach((o) => o.destroy());
  const D = 400;
  // the shade swallows clicks so nothing behind the guide reacts
  const shade = keep(scene.add.rectangle(640, 360, 4000, 2000, INK_N, 0.6).setDepth(D).setInteractive());
  shade.on("pointerdown", close);
  const x = 90, y = 40, w = 1100, h = 640;
  keep(panel(scene, x, y, w, h, 0xfffaf0).setDepth(D));
  keep(scene.add.text(x + 40, y + 26, "HOW TO PLAY", { fontFamily: FONT_TITLE, fontSize: "40px", color: INK }).setDepth(D));
  keep(
    scene.add
      .text(x + 330, y + 40, "Sneak in. Swipe the $CHOG. Get out.", { fontFamily: FONT_BODY, fontSize: "24px", color: "#5a4d50" })
      .setDepth(D),
  );
  // the panel itself also swallows clicks, so only the shade and the button close it
  keep(scene.add.zone(x, y, w, h).setOrigin(0, 0).setDepth(D).setInteractive());

  STEPS.forEach(([title, body], i) => {
    const cx = x + 40 + (i % 3) * 345, cy = y + 100 + Math.floor(i / 3) * 200;
    const g = keep(scene.add.graphics().setDepth(D));
    g.fillStyle(ACCENT_N, 1).fillCircle(cx + 22, cy + 22, 22);
    g.lineStyle(4, INK_N, 1).strokeCircle(cx + 22, cy + 22, 22);
    keep(scene.add.text(cx + 22, cy + 23, String(i + 1), { fontFamily: FONT_TITLE, fontSize: "24px", color: PAPER }).setOrigin(0.5).setDepth(D));
    keep(scene.add.text(cx + 56, cy + 8, title.toUpperCase(), { fontFamily: FONT_TITLE, fontSize: "22px", color: INK }).setDepth(D));
    keep(scene.add.text(cx, cy + 54, body, { fontFamily: FONT_BODY, fontSize: "19px", color: "#3b3033", wordWrap: { width: 315 }, lineSpacing: 2 }).setDepth(D));
  });

  // controls, keyboard and touch
  const ky = y + 506;
  const cg = keep(scene.add.graphics().setDepth(D));
  cg.fillStyle(0xf3eadb, 1).fillRoundedRect(x + 30, ky - 12, 760, 104, 16);
  keep(scene.add.text(x + 50, ky, "KEYS", { fontFamily: FONT_TITLE, fontSize: "18px", color: "#8a7d70" }).setDepth(D));
  keep(
    scene.add
      .text(x + 130, ky - 2, "← → move   SPACE jump   ↑ ↓ stairs   F grab   Q scout   E special   M sound", {
        fontFamily: FONT_BODY,
        fontSize: "20px",
        color: INK,
      })
      .setDepth(D),
  );
  keep(scene.add.text(x + 50, ky + 44, "PHONE", { fontFamily: FONT_TITLE, fontSize: "18px", color: "#8a7d70" }).setDepth(D));
  keep(
    scene.add
      .text(x + 130, ky + 42, "Hold your phone sideways. Buttons appear on your first tap: arrows on the left, JUMP, F, Q, E on the right.", {
        fontFamily: FONT_BODY,
        fontSize: "20px",
        color: INK,
        wordWrap: { width: 640 },
      })
      .setDepth(D),
  );
  if (castReady(scene)) keep(scene.add.image(x + w - 230, y + h - 30, "cast", "molandak").setOrigin(0.5, 1).setScale(0.42).setDepth(D));
  const btn = keep(button(scene, x + w - 150, y + h - 160, 220, "Got it!", close).setDepth(D + 1));
  void btn;
}
