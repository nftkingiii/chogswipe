// Shared menu styling: warm paper, ink outlines, one pink accent.
import Phaser from "phaser";
import { bake, grain, ink, INK, PAPER } from "./art.js";
import { Input, type RaidState } from "@chogswipe/sim";

export const FONT_TITLE = "'Luckiest Guy', sans-serif";
export const FONT_BODY = "'Patrick Hand', sans-serif";
export const ACCENT_N = 0xe0528a;
export const INK_N = 0x1c1618;

export function paperBackground(scene: Phaser.Scene) {
  const { width: W, height: H } = scene.scale;
  bake(scene, "menu-paper", W, H, (ctx, rc, s) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    // doodles in the margins
    for (let i = 0; i < 26; i++) {
      const x = (i * 211) % W, y = (i * 137) % H;
      rc.circle(x, y, 18 + (i % 4) * 8, ink(s + i, { stroke: "rgba(28,22,24,0.08)", strokeWidth: 2 }));
    }
    grain(ctx, W, H, 14, s);
  });
  const bg = scene.add.image(0, 0, "menu-paper_0").setOrigin(0, 0);
  let f = 0;
  scene.time.addEvent({ delay: 200, loop: true, callback: () => bg.setTexture(`menu-paper_${(f = (f + 1) % 3)}`) });
  return bg;
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill = 0xfffaf0) {
  const g = scene.add.graphics();
  g.fillStyle(INK_N, 1).fillRoundedRect(x + 6, y + 8, w, h, 22);
  g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, 22);
  g.lineStyle(4, INK_N, 1).strokeRoundedRect(x, y, w, h, 22);
  return g;
}

export function button(scene: Phaser.Scene, x: number, y: number, w: number, label: string, onClick: () => void, primary = true) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (hover: boolean) => {
    g.clear();
    g.fillStyle(INK_N, 1).fillRoundedRect(-w / 2 + 4, -26 + (hover ? 2 : 6), w, 56, 16);
    g.fillStyle(primary ? ACCENT_N : 0xfffaf0, 1).fillRoundedRect(-w / 2, -28 + (hover ? 2 : 0), w, 56, 16);
    g.lineStyle(4, INK_N, 1).strokeRoundedRect(-w / 2, -28 + (hover ? 2 : 0), w, 56, 16);
  };
  draw(false);
  const t = scene.add.text(0, 0, label, { fontFamily: FONT_TITLE, fontSize: "24px", color: primary ? PAPER : INK }).setOrigin(0.5);
  c.add([g, t]);
  c.setSize(w, 56).setInteractive({ useHandCursor: true });
  c.on("pointerover", () => (draw(true), t.setY(2)));
  c.on("pointerout", () => (draw(false), t.setY(0)));
  c.on("pointerdown", onClick);
  return c;
}

/** A still RaidState for posing a ChogSprite outside a raid. */
export function poseState(pose: "idle" | "win" | "run", t: number): RaidState {
  return {
    t,
    room: 0,
    x: 0,
    facing: 1,
    air: 0,
    hp: 3,
    stun: 0,
    invert: 0,
    boost: 0,
    timeLeft: 1,
    grab: 0,
    lootBps: 0,
    scoutCharges: 0,
    specialUsed: false,
    guardUsed: false,
    secondLifeUsed: false,
    alarmImmune: false,
    climb: null,
    doorOpen: false,
    doorWork: 0,
    guardOut: false,
    guardCooldown: 0,
    prevMask: pose === "run" ? Input.RIGHT : 0,
    traps: [],
    events: [],
    result: pose === "win" ? "escaped" : null,
  };
}
