// The in-game Chog: the NFT sticker head on a hand-inked cat body whose
// outfit colour is sampled from the NFT and whose paws use the Skin trait.
import Phaser from "phaser";
import { Input, type RaidState } from "@chogswipe/sim";
import { bake, BOIL_FRAMES, INK } from "./art.js";
import rough from "roughjs";

const INK_N = 0x1c1618;

export type Pose = "idle" | "run" | "jump" | "stunned" | "grab" | "carry" | "ko" | "win";

const hex = (c: string) => Number.parseInt(c.replace("#", ""), 16);

function shade(c: string, f: number): string {
  const n = hex(c);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** Most common saturated colour in the lower-middle of the NFT image, where the outfit sits. */
function hue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function sampleOutfit(img: HTMLImageElement | HTMLCanvasElement, fallback: string, skin?: string): string {
  const sn = skin ? hex(skin) : null;
  const skinHue = sn === null ? null : hue((sn >> 16) & 255, (sn >> 8) & 255, sn & 255);
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 64, 64);
  const { data } = ctx.getImageData(24, 50, 36, 14);
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (a < 200 || max < 60 || max - min < 40) continue; // skip ink, shadows, greys and cream fur
    if (skinHue !== null && skin !== "#f3eadb") {
      const dh = Math.abs(hue(r, g, b) - skinHue);
      if (Math.min(dh, 360 - dh) < 30) continue; // arms and paws are skin, not outfit
    }
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n < 12) return fallback;
  const to = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, "0");
  return `#${to(best.r)}${to(best.g)}${to(best.b)}`;
}

export function bakeBody(scene: Phaser.Scene, key: string, outfit: string) {
  bake(scene, key, 170, 150, (_ctx, rc, s) => {
    const ink = (seed: number, o: object = {}) => ({ seed, stroke: INK, strokeWidth: 5, roughness: 1.4, bowing: 1, ...o });
    // pear-shaped torso, wider at the bottom
    rc.path("M 40 30 C 30 70, 18 120, 50 138 C 70 148, 100 148, 120 138 C 152 120, 140 70, 130 30 C 112 14, 58 14, 40 30 Z", ink(s, { fill: outfit, fillStyle: "solid" }));
    // shading on the far side and a collar
    rc.path("M 118 36 C 134 76, 140 112, 116 134 C 128 104, 126 70, 118 36 Z", ink(s + 1, { fill: shade(outfit, 0.78), fillStyle: "solid", strokeWidth: 0.1 }));
    rc.path("M 46 30 C 70 46, 100 46, 124 30", ink(s + 2, { strokeWidth: 4 }));
    // trim stripe
    rc.path("M 30 104 C 70 116, 104 116, 140 104", ink(s + 3, { stroke: shade(outfit, 0.6), strokeWidth: 6, roughness: 1 }));
  });
}

export function bakeFx(scene: Phaser.Scene) {
  bake(scene, "star", 40, 40, (_ctx, rc, s) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 18 : 8;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([20 + Math.cos(a) * r, 20 + Math.sin(a) * r]);
    }
    rc.polygon(pts, { seed: s, stroke: INK, strokeWidth: 3, roughness: 0.8, fill: "#f0c35a", fillStyle: "solid" });
  });
  bake(scene, "puff", 50, 40, (_ctx, rc, s) => {
    rc.ellipse(25, 22, 44, 30, { seed: s, stroke: "rgba(28,22,24,0.55)", strokeWidth: 2.5, roughness: 1.8, fill: "rgba(250,243,230,0.9)", fillStyle: "solid" });
  });
  bake(scene, "sweat", 30, 40, (_ctx, rc, s) => {
    rc.path("M 15 4 C 6 20, 4 30, 15 36 C 26 30, 24 20, 15 4 Z", { seed: s, stroke: INK, strokeWidth: 2.5, roughness: 0.8, fill: "#9fd3f2", fillStyle: "solid" });
  });
  void rough;
}

interface Limb {
  x: number;
  y: number;
  a: number;
  len: number;
}

export class Puppet {
  readonly root: Phaser.GameObjects.Container;
  private readonly back: Phaser.GameObjects.Graphics;
  private readonly front: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly sack: Phaser.GameObjects.Image;
  private readonly stars: Phaser.GameObjects.Image[] = [];
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private headY = 0;
  private headV = 0;
  private wasAir = false;
  private lastStep = 0;
  private boil = 0;
  private won = false;
  private readonly skin: number;
  private readonly HEAD_REST = -170;

  constructor(
    private scene: Phaser.Scene,
    headKey: string,
    bodyKey: string,
    skin: string,
    floorY: number,
  ) {
    this.skin = hex(skin);
    this.shadow = scene.add.ellipse(0, floorY + 6, 130, 22, INK_N, 0.22);
    this.back = scene.add.graphics();
    this.body = scene.add.image(0, -78, `${bodyKey}_0`);
    this.front = scene.add.graphics();
    this.sack = scene.add.image(-58, -128, "sack_0").setScale(0.9).setVisible(false);
    this.head = scene.add.image(0, this.HEAD_REST, headKey).setScale(0.56);
    for (let i = 0; i < 3; i++) this.stars.push(scene.add.image(0, 0, "star_0").setScale(0.8).setVisible(false));
    this.root = scene.add.container(0, floorY, [this.back, this.body, this.front, this.sack, this.head, ...this.stars]);
    this.bodyKey = bodyKey;
  }

  private bodyKey: string;

  setWon() {
    this.won = true;
  }

  poseOf(s: RaidState): Pose {
    if (s.result === "knocked-out") return "ko";
    if (this.won || s.result === "escaped") return "win";
    if (s.stun > 0) return "stunned";
    if (s.air > 0) return "jump";
    if (s.grab > 0 && s.lootBps === 0) return "grab";
    const moving = (s.prevMask & (Input.LEFT | Input.RIGHT)) !== 0;
    if (moving) return s.lootBps > 0 ? "carry" : "run";
    return "idle";
  }

  update(s: RaidState, worldX: number, floorY: number, dt: number) {
    const pose = this.poseOf(s);
    const t = s.t;
    const ph = t * 0.6;
    const airY = s.air > 0 ? -Math.sin((s.air / 18) * Math.PI) * 120 : 0;
    const bob = pose === "run" || pose === "carry" ? -Math.abs(Math.sin(ph)) * 10 : pose === "idle" ? Math.sin(t * 0.12) * 2 : 0;
    const hop = pose === "win" ? -Math.abs(Math.sin(t * 0.25)) * 60 : 0;

    this.root.setPosition(worldX, floorY + airY + bob + hop);
    this.root.scaleX = s.facing;
    this.shadow.setPosition(worldX, floorY + 6).setScale(1 + (airY + hop) / 320, 1);

    // squash and stretch
    const sx = pose === "jump" ? 0.92 : pose === "stunned" ? 1.1 : 1;
    const sy = pose === "jump" ? 1.08 : pose === "stunned" ? 0.88 : pose === "ko" ? 0.8 : 1;
    this.body.setScale(sx, sy);
    this.body.setRotation(pose === "run" || pose === "carry" ? 0.08 : pose === "ko" ? 0.5 : 0);

    // springy head: lags behind the body and overshoots on landing
    const landing = this.wasAir && s.air === 0;
    this.wasAir = s.air > 0;
    if (landing) this.headV += 9;
    if (pose === "jump") this.headV -= 0.6;
    const k = 0.22, damp = 0.72;
    this.headV = (this.headV + -this.headY * k) * damp;
    this.headY += this.headV;
    const tilt =
      pose === "stunned" ? Math.sin(t * 0.9) * 0.2 :
      pose === "ko" ? 0.9 :
      pose === "run" || pose === "carry" ? Math.sin(ph) * 0.06 + 0.05 :
      pose === "grab" ? Math.sin(t * 1.6) * 0.05 :
      pose === "win" ? Math.sin(t * 0.25) * 0.12 : 0;
    this.head.setPosition(pose === "ko" ? 40 : 0, this.HEAD_REST + this.headY + (pose === "ko" ? 90 : 0));
    this.head.setRotation(tilt);
    this.head.setScale(0.56 * s.facing, 0.56); // keep NFT art readable when facing left

    this.sack.setVisible(s.lootBps > 0 && pose !== "ko");
    this.sack.setPosition(-60, -128 + (pose === "carry" ? Math.sin(ph) * 4 : 0)).setRotation(pose === "carry" ? Math.sin(ph) * 0.1 : 0);

    // stun stars orbit the head
    this.stars.forEach((st, i) => {
      const on = pose === "stunned";
      st.setVisible(on);
      if (on) {
        const a = t * 0.25 + (i * Math.PI * 2) / 3;
        st.setPosition(Math.cos(a) * 80, this.HEAD_REST - 110 + Math.sin(a) * 18).setScale(0.6 + Math.sin(a) * 0.2);
      }
    });

    this.drawLimbs(pose, ph, t);

    // dust puffs on footsteps and landings
    if ((pose === "run" || pose === "carry") && t - this.lastStep >= 8) {
      this.lastStep = t;
      this.puff(worldX - s.facing * 30, floorY - 6, 0.6);
    }
    if (landing) {
      this.puff(worldX - 40, floorY - 6, 0.9);
      this.puff(worldX + 40, floorY - 6, 0.9);
    }

    this.boil += dt;
    if (this.boil > 180) {
      this.boil = 0;
      const f = Math.floor(Math.random() * BOIL_FRAMES);
      this.body.setTexture(`${this.bodyKey}_${f}`);
      this.sack.setTexture(`sack_${f}`);
      this.stars.forEach((st) => st.setTexture(`star_${f}`));
    }
  }

  sweat() {
    const d = this.scene.add.image(this.root.x + 70 * this.root.scaleX, this.root.y - 230, "sweat_0").setScale(0.9);
    this.scene.tweens.add({ targets: d, y: d.y + 40, alpha: 0, duration: 700, onComplete: () => d.destroy() });
  }

  private puff(x: number, y: number, scale: number) {
    const p = this.scene.add.image(x, y, "puff_0").setScale(scale * 0.6).setAlpha(0.9).setDepth(-1);
    this.scene.tweens.add({ targets: p, scale: scale * 1.2, alpha: 0, y: y - 18, duration: 420, ease: "Cubic.Out", onComplete: () => p.destroy() });
  }

  private limb(g: Phaser.GameObjects.Graphics, l: Limb, w: number, end: "paw" | "foot", fill: number) {
    const ex = l.x + Math.sin(l.a) * l.len;
    const ey = l.y + Math.cos(l.a) * l.len;
    g.lineStyle(w + 9, INK_N, 1).lineBetween(l.x, l.y, ex, ey);
    g.lineStyle(w, fill, 1).lineBetween(l.x, l.y, ex, ey);
    if (end === "paw") {
      g.fillStyle(INK_N, 1).fillCircle(ex, ey, w * 0.85 + 4);
      g.fillStyle(fill, 1).fillCircle(ex, ey, w * 0.85);
    } else {
      g.fillStyle(INK_N, 1).fillEllipse(ex + 8, ey + 2, w * 2.6 + 8, w * 1.3 + 8);
      g.fillStyle(fill, 1).fillEllipse(ex + 8, ey + 2, w * 2.6, w * 1.3);
    }
  }

  private tail(g: Phaser.GameObjects.Graphics, t: number, pose: Pose) {
    const swish = pose === "run" || pose === "carry" ? Math.sin(t * 0.6) * 10 : Math.sin(t * 0.1) * 6;
    const pts = [
      new Phaser.Math.Vector2(-54, -50),
      new Phaser.Math.Vector2(-84, -60 + swish * 0.3),
      new Phaser.Math.Vector2(-100, -96 + swish),
      new Phaser.Math.Vector2(-84, -118 + swish),
    ];
    const curve = new Phaser.Curves.Spline(pts);
    g.lineStyle(20, INK_N, 1);
    curve.draw(g, 24);
    g.lineStyle(11, this.skin, 1);
    curve.draw(g, 24);
  }

  private drawLimbs(pose: Pose, ph: number, t: number) {
    const b = this.back.clear();
    const f = this.front.clear();
    const swing = pose === "run" || pose === "carry" ? Math.sin(ph) * 0.7 : 0;
    const legs: [number, number] =
      pose === "jump" ? [-0.9, -0.5] :
      pose === "stunned" ? [0.4, -0.4] :
      pose === "ko" ? [1.4, 1.1] :
      pose === "win" ? [0.25, -0.25] :
      [swing, -swing];
    const arms: [number, number] =
      pose === "jump" ? [2.4, 2.0] :
      pose === "grab" ? [1.4 + Math.sin(t * 1.6) * 0.3, 1.5 + Math.cos(t * 1.6) * 0.3] :
      pose === "carry" ? [2.6, -swing * 0.8] :
      pose === "stunned" ? [0.6 + Math.sin(t * 0.8) * 0.3, -0.6] :
      pose === "win" ? [2.8, 2.8] :
      pose === "ko" ? [1.6, 1.4] :
      [-swing * 0.8 - 0.15, swing * 0.8 + 0.15];

    if (pose !== "ko") this.tail(b, t, pose);
    this.limb(b, { x: 18, y: -26, a: legs[1], len: 26 }, 15, "foot", this.skin);
    this.limb(b, { x: 40, y: -110, a: arms[1], len: 40 }, 13, "paw", this.skin);
    this.limb(f, { x: -16, y: -26, a: legs[0], len: 26 }, 15, "foot", this.skin);
    this.limb(f, { x: -40, y: -110, a: arms[0], len: 40 }, 13, "paw", this.skin);
  }
}
