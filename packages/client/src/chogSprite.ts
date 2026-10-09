// The in-game Chog: one hand-drawn pose sheet, recoloured per NFT so the fur
// matches the holder's Skin trait. Abilities still come from the NFT traits.
import Phaser from "phaser";
import { Input, type RaidState, type Traits } from "@chogswipe/sim";
import { bakeEyes, bakeHead, eyeItem, headItem } from "./traitArt.js";

export const POSES = ["idle", "run1", "run2", "jump", "stunned", "carry", "win", "ko"] as const;
export type Pose = (typeof POSES)[number];
const FRAME = 260;

/** Fur colour per Skin trait. The sheet is drawn in Yellow. */
export const FUR: Record<string, string> = {
  Yellow: "#f2c230",
  Origin: "#6b4fc8",
  Pink: "#ee5f9e",
  Red: "#e0302e",
  Black: "#2e2a2c",
  Blue: "#4a8ee0",
  White: "#efeae0",
  Green: "#59b85a",
  Jade: "#3aa58a",
  Purple: "#9a5ad6",
  Beige: "#d8c4a0",
  Metal: "#9aa6b2",
  Grey: "#9c9a98",
  "Multi Colored": "#f08a30",
};

function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max / 255];
}

/** Copy the yellow sheet into a new texture with the fur recoloured, keeping the ink shading. */
export function makeChogTexture(scene: Phaser.Scene, skin: string | undefined, key: string): string {
  const src = scene.textures.get("chog-sheet").getSourceImage() as HTMLImageElement;
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const target = FUR[skin ?? "Yellow"] ?? FUR.Yellow!;
  if (target !== FUR.Yellow) {
    const t = Number.parseInt(target.slice(1), 16);
    const tr = (t >> 16) & 255, tg = (t >> 8) & 255, tb = t & 255;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! < 10) continue;
      const [h, s, v] = hsv(d[i]!, d[i + 1]!, d[i + 2]!);
      if (h < 22 || h > 68 || s < 0.38 || v < 0.3) continue; // only the yellow fur
      // keep relative shading: 0.95 is the bright fur value in the sheet
      const k = Math.min(1.15, v / 0.95);
      d[i] = Math.min(255, tr * k);
      d[i + 1] = Math.min(255, tg * k);
      d[i + 2] = Math.min(255, tb * k);
    }
    ctx.putImageData(img, 0, 0);
  }
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, c)!;
  POSES.forEach((p, i) => tex.add(p, 0, i * FRAME, 0, FRAME, FRAME));
  return key;
}

/** Where hats and eyewear sit in each pose, in sheet pixels (hat brim centre + tilt, eye centre). */
const ANCHORS: Record<Pose, { hat: [number, number, number]; eye: [number, number] | null }> = {
  idle: { hat: [138, 74, 0], eye: [148, 102] },
  run1: { hat: [138, 70, -0.05], eye: [148, 99] },
  run2: { hat: [136, 70, -0.05], eye: [145, 100] },
  jump: { hat: [138, 84, 0], eye: [149, 111] },
  stunned: { hat: [136, 82, 0.12], eye: [142, 110] },
  carry: { hat: [152, 76, -0.08], eye: [161, 104] },
  win: { hat: [130, 76, 0.12], eye: [138, 104] },
  ko: { hat: [44, 248, -1.4], eye: null },
};

export class ChogSprite {
  readonly root: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly key: string;
  private landT = 0;
  private wasAir = false;
  private lastStep = 0;
  private won = false;
  private readonly hat: Phaser.GameObjects.Image | null = null;
  private readonly eyes: Phaser.GameObjects.Image | null = null;
  private hatKey = "";
  private eyesKey = "";
  private boilT = 0;

  constructor(private scene: Phaser.Scene, textureKey: string, floorY: number, traits: Traits = {}) {
    this.key = textureKey;
    this.shadow = scene.add.ellipse(0, floorY + 6, 130, 22, 0x1c1618, 0.22);
    this.sprite = scene.add.image(0, 8, textureKey, "idle").setOrigin(0.5, 1).setScale(0.95);
    const parts: Phaser.GameObjects.GameObject[] = [this.sprite];
    const e = eyeItem(traits.Eyes, traits.Head);
    if (e) {
      this.eyesKey = bakeEyes(scene, e);
      this.eyes = scene.add.image(0, 0, `${this.eyesKey}_0`).setOrigin(60 / 160, 0.5);
      parts.push(this.eyes);
    }
    const h = headItem(traits.Head);
    if (h) {
      this.hatKey = bakeHead(scene, h);
      this.hat = scene.add.image(0, 0, `${this.hatKey}_0`).setOrigin(0.5, 96 / 110);
      parts.push(this.hat);
    }
    this.root = scene.add.container(0, floorY, parts);
  }

  /** Place trait items on the head for the current pose, following flip and squash. */
  private dress(pose: Pose, sx: number, sy: number, flip: boolean, rot: number) {
    const a = ANCHORS[pose];
    const k = 0.95;
    const local = (fx: number, fy: number): [number, number] => {
      const x = (fx - 130) * k * sx;
      const y = 8 + (fy - 260) * k * sy;
      return [flip ? -x : x, y];
    };
    if (this.hat) {
      const [x, y] = local(a.hat[0], a.hat[1]);
      this.hat.setPosition(x, y).setRotation((flip ? -a.hat[2] : a.hat[2]) + rot).setFlipX(flip).setScale(0.92 * sx, 0.92 * sy);
    }
    if (this.eyes) {
      this.eyes.setVisible(a.eye !== null);
      if (a.eye) {
        const [x, y] = local(a.eye[0], a.eye[1]);
        this.eyes.setPosition(x, y).setRotation(rot).setFlipX(flip).setScale(0.8 * sx, 0.8 * sy);
        this.eyes.setOrigin(flip ? 1 - 60 / 160 : 60 / 160, 0.5);
      }
    }
  }

  setWon() {
    this.won = true;
  }

  poseOf(s: RaidState): Pose {
    if (s.result === "knocked-out") return "ko";
    if (this.won || s.result === "escaped") return "win";
    if (s.stun > 0) return "stunned";
    if (s.air > 0 || s.climb) return "jump";
    const moving = (s.prevMask & (Input.LEFT | Input.RIGHT)) !== 0;
    if (s.lootBps > 0) return "carry";
    if (moving) return Math.floor(s.t / 5) % 2 === 0 ? "run1" : "run2";
    return "idle";
  }

  update(s: RaidState, worldX: number, floorY: number, _dt: number) {
    const pose = this.poseOf(s);
    const t = s.t;
    const moving = (s.prevMask & (Input.LEFT | Input.RIGHT)) !== 0 && s.stun === 0;
    const airY = s.air > 0 ? -Math.sin((s.air / 18) * Math.PI) * 120 : 0;
    const bob = moving && s.air === 0 ? -Math.abs(Math.sin(t * 0.63)) * 8 : pose === "idle" ? Math.sin(t * 0.12) * 1.5 : 0;
    const hop = pose === "win" ? -Math.abs(Math.sin(t * 0.25)) * 50 : 0;

    const landing = this.wasAir && s.air === 0;
    this.wasAir = s.air > 0;
    if (landing) this.landT = 8;
    if (this.landT > 0) this.landT -= 1;

    this.root.setPosition(worldX, floorY + airY + bob + hop);
    this.shadow.setPosition(worldX, floorY + 6).setScale(Math.max(0.5, 1 + (airY + hop) / 320), 1);

    this.sprite.setFrame(pose);
    // the sheet faces right; flip for left
    this.sprite.setFlipX(s.facing < 0);
    // squash and stretch
    const land = this.landT / 8;
    const sx = pose === "jump" ? 0.92 : 1 + land * 0.18;
    const sy = pose === "jump" ? 1.08 : 1 - land * 0.16;
    this.sprite.setScale(0.95 * sx, 0.95 * sy);
    this.sprite.setRotation(
      pose === "stunned" ? Math.sin(t * 0.5) * 0.06 :
      moving ? s.facing * 0.05 :
      0,
    );

    this.dress(pose, sx, sy, s.facing < 0, this.sprite.rotation);
    this.boilT += _dt;
    if (this.boilT > 180) {
      this.boilT = 0;
      const f = Math.floor(Math.random() * 3);
      if (this.hat) this.hat.setTexture(`${this.hatKey}_${f}`);
      if (this.eyes) this.eyes.setTexture(`${this.eyesKey}_${f}`);
    }

    if (moving && s.air === 0 && t - this.lastStep >= 8) {
      this.lastStep = t;
      this.puff(worldX - s.facing * 40, floorY - 6, 0.6);
    }
    if (landing) {
      this.puff(worldX - 40, floorY - 6, 0.9);
      this.puff(worldX + 40, floorY - 6, 0.9);
    }
  }

  sweat() {
    const d = this.scene.add.image(this.root.x + 60 * (this.sprite.flipX ? -1 : 1), this.root.y - 220, "sweat_0").setScale(0.9);
    this.scene.tweens.add({ targets: d, y: d.y + 40, alpha: 0, duration: 700, onComplete: () => d.destroy() });
  }

  private puff(x: number, y: number, scale: number) {
    const p = this.scene.add.image(x, y, "puff_0").setScale(scale * 0.6).setAlpha(0.9).setDepth(-1);
    this.scene.tweens.add({ targets: p, scale: scale * 1.2, alpha: 0, y: y - 18, duration: 420, ease: "Cubic.Out", onComplete: () => p.destroy() });
  }

  destroy() {
    this.root.destroy();
    this.shadow.destroy();
  }

  get textureKey() {
    return this.key;
  }
}
