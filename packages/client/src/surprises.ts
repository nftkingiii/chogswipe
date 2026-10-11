// Little surprises in each lore heist: things that go off once when the Chog walks past
// (a frog leaps out of the aquarium, a loaf pops out of the oven, a spider drops on its thread)
// and ambient life (fireflies, spinning gears, a swirling portal). Purely cosmetic: the sim
// never sees them, so live raids and the referee's replays are unaffected.
import Phaser from "phaser";
import { FLOORS, floorOf, type RaidState } from "@chogswipe/sim";
import { FLOOR_Y, VIEW_H, bake, ink } from "./art.js";
import { sfx } from "./sfx.js";

type Pop = "frog" | "salmon" | "spider" | "leaves" | "flour" | "loaf" | "cuckoo" | "glitch" | "sparks" | "ink" | "glove" | "paper" | "confetti" | "bubbleup";
type Ambient = "fireflies" | "bubbles" | "gears" | "portal" | "flicker" | "steam" | "embers" | "drips";

/** just under the ceiling band, in room-local y */
const CEIL_Y = 62;

/** room-local coordinates, as in decor.ts */
interface PopSpec {
  room: number;
  /** where the Chog has to walk past */
  at: number;
  kind: Pop;
  /** where the effect plays, if not right where it's triggered */
  x?: number;
  y?: number;
}

interface AmbientSpec {
  room: number;
  kind: Ambient;
  x: number;
  y: number;
}

const POPS: Record<string, PopSpec[]> = {
  "fwog-pond": [
    { room: 1, at: 260, kind: "frog", x: 220, y: FLOOR_Y - 280 },
    { room: 2, at: 680, kind: "bubbleup", x: 680, y: FLOOR_Y - 40 },
    { room: 5, at: 250, kind: "frog", x: 200, y: FLOOR_Y + 20 },
  ],
  "rayj-studio": [
    { room: 1, at: 360, kind: "paper", x: 240, y: FLOOR_Y - 220 },
    { room: 3, at: 200, kind: "glitch" },
    { room: 4, at: 680, kind: "ink", x: 690, y: CEIL_Y },
  ],
  "moyaki-bakery": [
    { room: 1, at: 250, kind: "flour", x: 220, y: FLOOR_Y - 60 },
    { room: 2, at: 640, kind: "loaf", x: 710, y: FLOOR_Y - 110 },
    { room: 4, at: 160, kind: "flour", x: 120, y: FLOOR_Y - 60 },
  ],
  "mouch-nest": [
    { room: 0, at: 300, kind: "leaves", x: 280, y: FLOOR_Y - 40 },
    { room: 1, at: 500, kind: "spider", x: 560, y: CEIL_Y },
    { room: 2, at: 760, kind: "glove", x: 940, y: FLOOR_Y - 150 },
    { room: 5, at: 650, kind: "confetti", x: 640, y: 260 },
  ],
  "salmonad-shrine": [
    { room: 0, at: 260, kind: "salmon", x: 160, y: FLOOR_Y + 40 },
    { room: 3, at: 760, kind: "salmon", x: 700, y: FLOOR_Y },
    { room: 4, at: 700, kind: "bubbleup", x: 710, y: FLOOR_Y - 170 },
  ],
  "molandak-lab": [
    { room: 0, at: 220, kind: "cuckoo", x: 195, y: FLOOR_Y - 250 },
    { room: 3, at: 200, kind: "glitch" },
    { room: 5, at: 300, kind: "sparks", x: 190, y: 260 },
  ],
  "mongrod-citadel": [
    { room: 2, at: 700, kind: "sparks", x: 690, y: FLOOR_Y - 40 },
    { room: 1, at: 650, kind: "sparks", x: 720, y: FLOOR_Y - 250 },
    { room: 4, at: 640, kind: "glove", x: 940, y: FLOOR_Y - 140 },
  ],
};

const AMBIENT: Record<string, AmbientSpec[]> = {
  "fwog-pond": [
    { room: 4, kind: "fireflies", x: 720, y: 360 },
    { room: 1, kind: "bubbles", x: 220, y: FLOOR_Y - 130 },
  ],
  "rayj-studio": [{ room: 4, kind: "drips", x: 680, y: FLOOR_Y + 40 }],
  "moyaki-bakery": [{ room: 2, kind: "steam", x: 710, y: FLOOR_Y - 130 }],
  "mouch-nest": [{ room: 3, kind: "fireflies", x: 280, y: 320 }],
  "salmonad-shrine": [
    { room: 2, kind: "flicker", x: 630, y: FLOOR_Y - 180 },
    { room: 2, kind: "flicker", x: 850, y: FLOOR_Y - 190 },
    { room: 5, kind: "flicker", x: 100, y: FLOOR_Y - 54 },
    { room: 5, kind: "flicker", x: 320, y: FLOOR_Y - 70 },
    { room: 3, kind: "bubbles", x: 800, y: FLOOR_Y },
  ],
  "molandak-lab": [
    { room: 2, kind: "gears", x: 730, y: FLOOR_Y - 170 },
    { room: 5, kind: "portal", x: 190, y: 260 },
  ],
  "mongrod-citadel": [
    { room: 0, kind: "flicker", x: 200, y: 204 },
    { room: 0, kind: "flicker", x: 900, y: 204 },
    { room: 2, kind: "embers", x: 690, y: FLOOR_Y - 40 },
    { room: 5, kind: "flicker", x: 200, y: FLOOR_Y - 200 },
  ],
};

const SIZES: Record<string, [number, number]> = {
  "sp-frog": [110, 90],
  "sp-salmon": [150, 80],
  "sp-spider": [70, 60],
  "sp-loaf": [110, 70],
  "sp-bird": [80, 70],
  "sp-glove": [120, 80],
  "sp-gear": [150, 150],
  "sp-portal": [240, 240],
};

function bakeSprites(scene: Phaser.Scene) {
  const solid = (s: number, fill: string, w = 3) => ink(s, { fill, fillStyle: "solid", strokeWidth: w });
  bake(scene, "sp-frog", ...SIZES["sp-frog"]!, (_c, rc, s) => {
    rc.ellipse(55, 58, 90, 50, solid(s, "#7cc36a"));
    rc.circle(36, 30, 30, solid(s + 1, "#fff"));
    rc.circle(74, 30, 30, solid(s + 2, "#fff"));
    rc.circle(38, 30, 10, solid(s + 3, "#1c1618", 1));
    rc.circle(72, 30, 10, solid(s + 4, "#1c1618", 1));
    rc.arc(55, 62, 40, 16, 0, Math.PI, false, ink(s + 5, { strokeWidth: 3 }));
  });
  bake(scene, "sp-salmon", ...SIZES["sp-salmon"]!, (_c, rc, s) => {
    rc.ellipse(66, 40, 110, 50, solid(s, "#e0528a"));
    rc.polygon(
      [
        [116, 40],
        [146, 14],
        [146, 66],
      ],
      solid(s + 1, "#e0528a"),
    );
    rc.circle(36, 34, 12, solid(s + 2, "#fff", 2));
    rc.line(60, 22, 90, 26, ink(s + 3, { stroke: "#8e6ee8", strokeWidth: 4 }));
  });
  bake(scene, "sp-spider", ...SIZES["sp-spider"]!, (_c, rc, s) => {
    for (let i = 0; i < 4; i++) {
      rc.line(35, 32, 6, 14 + i * 10, ink(s + i, { strokeWidth: 3 }));
      rc.line(35, 32, 64, 14 + i * 10, ink(s + 10 + i, { strokeWidth: 3 }));
    }
    rc.circle(35, 32, 34, solid(s + 20, "#2a2124"));
    rc.circle(28, 28, 8, solid(s + 21, "#fff", 1));
    rc.circle(42, 28, 8, solid(s + 22, "#fff", 1));
  });
  bake(scene, "sp-loaf", ...SIZES["sp-loaf"]!, (_c, rc, s) => {
    rc.ellipse(55, 38, 100, 56, solid(s, "#d9a05a"));
    for (let i = 0; i < 3; i++) rc.line(30 + i * 22, 22, 40 + i * 22, 40, ink(s + 1 + i, { stroke: "#f3e2c0", strokeWidth: 4 }));
  });
  bake(scene, "sp-bird", ...SIZES["sp-bird"]!, (_c, rc, s) => {
    rc.ellipse(40, 40, 60, 46, solid(s, "#f0c35a"));
    rc.polygon(
      [
        [8, 38],
        [-4, 44],
        [10, 48],
      ],
      solid(s + 1, "#e0528a", 2),
    );
    rc.circle(26, 32, 10, solid(s + 2, "#1c1618", 1));
    rc.ellipse(50, 46, 26, 16, solid(s + 3, "#e8a830", 2));
  });
  bake(scene, "sp-glove", ...SIZES["sp-glove"]!, (_c, rc, s) => {
    rc.ellipse(70, 40, 90, 70, solid(s, "#c0392b"));
    rc.ellipse(46, 22, 30, 26, solid(s + 1, "#c0392b"));
    rc.rectangle(100, 26, 20, 28, solid(s + 2, "#f3eadb", 2));
  });
  bake(scene, "sp-gear", ...SIZES["sp-gear"]!, (ctx, rc, s) => {
    const cx = 75, cy = 75;
    ctx.fillStyle = "#9aa6b2";
    for (let i = 0; i < 10; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i / 10) * Math.PI * 2);
      ctx.fillRect(-10, -72, 20, 22);
      ctx.restore();
    }
    rc.circle(cx, cy, 110, solid(s, "#9aa6b2"));
    rc.circle(cx, cy, 34, solid(s + 1, "#5c6670"));
  });
  bake(scene, "sp-portal", ...SIZES["sp-portal"]!, (_c, rc, s) => {
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      rc.arc(120, 120, 220 - i * 28, 220 - i * 28, a, a + Math.PI * 1.3, false, ink(s + i, { stroke: i % 2 ? "#5b7cff" : "#c9b2ff", strokeWidth: 6 }));
    }
  });
}

export interface Surprises {
  update(s: RaidState): void;
}

/** Set up a heist's surprises. `top(room)` is the world y of the room's top edge, `x(room, rx)` its world x. */
export function addSurprises(scene: Phaser.Scene, slug: string, x: (room: number, rx: number) => number): Surprises {
  const pops = POPS[slug] ?? [];
  const amb = AMBIENT[slug] ?? [];
  if (!pops.length && !amb.length) return { update: () => undefined };
  bakeSprites(scene);
  const top = (room: number) => (FLOORS - 1 - floorOf(room)) * VIEW_H;
  const at = (room: number, rx: number, ry: number) => ({ x: x(room, rx), y: top(room) + ry });
  const fired = new Set<number>();

  for (const a of amb) ambient(scene, a.kind, at(a.room, a.x, a.y));

  return {
    update(s: RaidState) {
      if (s.climb || s.result) return;
      pops.forEach((p, i) => {
        if (fired.has(i) || p.room !== s.room || Math.abs(s.x - p.at) > 150) return;
        fired.add(i);
        const where = at(p.room, p.x ?? p.at, p.y ?? FLOOR_Y - 120);
        pop(scene, p.kind, where.x, where.y, at(p.room, 0, FLOOR_Y).y);
      });
    },
  };
}

// ------------------------------------------------------------- one-offs

function dots(scene: Phaser.Scene, x: number, y: number, colors: number[], n: number, spread: number, rise: number, life = 700) {
  for (let i = 0; i < n; i++) {
    const d = scene.add.circle(x, y, Phaser.Math.Between(3, 8), colors[i % colors.length]!).setDepth(4);
    const a = Math.random() * Math.PI * 2;
    scene.tweens.add({
      targets: d,
      x: x + Math.cos(a) * spread * Math.random(),
      y: y + Math.sin(a) * spread * 0.5 - rise * Math.random(),
      alpha: 0,
      duration: life + Math.random() * 300,
      ease: "Cubic.Out",
      onComplete: () => d.destroy(),
    });
  }
}

function pop(scene: Phaser.Scene, kind: Pop, x: number, y: number, floor: number) {
  sfx.surprise(kind);
  switch (kind) {
    case "frog": {
      const f = scene.add.image(x, y, "sp-frog_0").setDepth(4).setScale(0.3);
      scene.tweens.add({ targets: f, scale: 1, duration: 160, ease: "Back.Out" });
      scene.tweens.add({ targets: f, x: x + 260, duration: 900, delay: 120, ease: "Linear" });
      scene.tweens.add({ targets: f, y: y - 160, duration: 450, delay: 120, ease: "Quad.Out", yoyo: true });
      scene.tweens.add({ targets: f, angle: 360, duration: 900, delay: 120 });
      scene.tweens.add({ targets: f, alpha: 0, delay: 1400, duration: 300, onComplete: () => f.destroy() });
      dots(scene, x, y + 20, [0x7fc0d6, 0xcfe0ff], 10, 80, 40);
      break;
    }
    case "salmon": {
      const f = scene.add.image(x, y, "sp-salmon_0").setDepth(4).setAngle(-40);
      dots(scene, x, y, [0x7fc0d6, 0xcfe0ff], 14, 90, 60);
      scene.tweens.add({ targets: f, x: x + 320, duration: 1000, ease: "Linear" });
      scene.tweens.add({ targets: f, y: y - 240, duration: 500, ease: "Quad.Out", yoyo: true });
      scene.tweens.add({ targets: f, angle: 50, duration: 1000 });
      scene.time.delayedCall(1000, () => {
        dots(scene, x + 320, y, [0x7fc0d6, 0xcfe0ff], 14, 90, 60);
        f.destroy();
      });
      break;
    }
    case "spider": {
      const thread = scene.add.line(0, 0, x, y, x, y, 0xffffff, 0.8).setOrigin(0, 0).setDepth(4).setLineWidth(2);
      const sp = scene.add.image(x, y, "sp-spider_0").setDepth(4);
      const d = { v: 0 };
      scene.tweens.add({
        targets: d,
        v: 300,
        duration: 600,
        ease: "Bounce.Out",
        yoyo: true,
        hold: 1200,
        onUpdate: () => {
          sp.setY(y + d.v);
          thread.setTo(x, y, x, y + d.v - 20);
        },
        onComplete: () => (sp.destroy(), thread.destroy()),
      });
      scene.tweens.add({ targets: sp, angle: { from: -12, to: 12 }, duration: 160, yoyo: true, repeat: 8, delay: 600 });
      break;
    }
    case "leaves": {
      for (let i = 0; i < 22; i++) {
        const l = scene.add.ellipse(x + Phaser.Math.Between(-80, 80), y, 26, 14, [0x6fa65a, 0x8fbf6a, 0xc9a44a][i % 3]!).setStrokeStyle(2, 0x1c1618).setDepth(4);
        const tx = l.x + Phaser.Math.Between(-200, 200);
        scene.tweens.add({ targets: l, y: y - Phaser.Math.Between(120, 260), duration: 420, ease: "Quad.Out" });
        scene.tweens.add({ targets: l, y: floor - 4, x: tx, delay: 420, duration: 1400, ease: "Sine.In" });
        scene.tweens.add({ targets: l, angle: Phaser.Math.Between(-360, 360), duration: 1800 });
        scene.tweens.add({ targets: l, alpha: 0, delay: 2200, duration: 400, onComplete: () => l.destroy() });
      }
      break;
    }
    case "flour":
      for (let i = 0; i < 16; i++) {
        const c = scene.add.circle(x + Phaser.Math.Between(-40, 40), y, Phaser.Math.Between(16, 34), 0xffffff, 0.85).setDepth(4);
        scene.tweens.add({ targets: c, y: y - Phaser.Math.Between(60, 200), x: c.x + Phaser.Math.Between(-120, 120), scale: 1.8, alpha: 0, duration: 1300, ease: "Quad.Out", onComplete: () => c.destroy() });
      }
      break;
    case "loaf": {
      const b = scene.add.image(x, y, "sp-loaf_0").setDepth(4);
      scene.tweens.add({ targets: b, y: y - 220, duration: 380, ease: "Quad.Out", yoyo: true });
      scene.tweens.add({ targets: b, x: x - 200, angle: -540, duration: 760 });
      scene.time.delayedCall(760, () => {
        scene.tweens.add({ targets: b, y: floor - 30, duration: 300, ease: "Bounce.Out" });
        scene.tweens.add({ targets: b, alpha: 0, delay: 1600, duration: 400, onComplete: () => b.destroy() });
      });
      dots(scene, x, y, [0xffffff], 8, 60, 80);
      break;
    }
    case "cuckoo": {
      const bird = scene.add.image(x, y, "sp-bird_0").setDepth(4).setScale(0.2);
      const t = scene.add.text(x - 30, y - 70, "CUCKOO!", { fontFamily: "'Luckiest Guy', sans-serif", fontSize: "30px", color: "#f0c35a", stroke: "#1c1618", strokeThickness: 6 }).setDepth(4).setAlpha(0);
      scene.tweens.add({ targets: bird, x: x - 70, scale: 1, duration: 220, ease: "Back.Out", yoyo: true, hold: 900 });
      scene.tweens.add({ targets: t, alpha: 1, y: y - 90, duration: 200, yoyo: true, hold: 800, onComplete: () => (t.destroy(), bird.destroy()) });
      break;
    }
    case "glitch": {
      const cam = scene.cameras.main;
      const bars: Phaser.GameObjects.Rectangle[] = [];
      for (let i = 0; i < 9; i++) {
        bars.push(
          scene.add
            .rectangle(Phaser.Math.Between(0, cam.width), Phaser.Math.Between(0, cam.height), Phaser.Math.Between(120, 520), Phaser.Math.Between(6, 26), [0xff3bd0, 0x3bfff0, 0xf0c35a][i % 3]!, 0.55)
            .setScrollFactor(0)
            .setDepth(90),
        );
      }
      cam.shake(240, 0.006);
      let n = 0;
      scene.time.addEvent({
        delay: 70,
        repeat: 6,
        callback: () => {
          n++;
          bars.forEach((b) => b.setPosition(Phaser.Math.Between(0, cam.width), Phaser.Math.Between(0, cam.height)).setVisible(n < 7));
          if (n >= 7) bars.forEach((b) => b.destroy());
        },
      });
      break;
    }
    case "sparks":
      dots(scene, x, y, [0xffb04a, 0xff7a2a, 0xfff1c4], 26, 220, 180, 600);
      break;
    case "ink": {
      const drop = scene.add.ellipse(x, y, 14, 22, 0x1c1618).setDepth(4);
      scene.tweens.add({
        targets: drop,
        y: floor - 6,
        duration: 650,
        ease: "Quad.In",
        onComplete: () => {
          drop.setSize(70, 14).setDisplaySize(70, 14);
          dots(scene, x, floor - 10, [0x1c1618], 8, 90, 30, 400);
          scene.tweens.add({ targets: drop, alpha: 0, delay: 1500, duration: 400, onComplete: () => drop.destroy() });
        },
      });
      break;
    }
    case "glove": {
      const g = scene.add.image(x, y, "sp-glove_0").setDepth(4).setFlipX(true);
      const spring = scene.add.line(0, 0, x, y, x, y, 0x9aa6b2).setOrigin(0, 0).setLineWidth(6).setDepth(3);
      const d = { v: 0 };
      scene.tweens.add({
        targets: d,
        v: 260,
        duration: 160,
        ease: "Back.Out",
        yoyo: true,
        hold: 500,
        onUpdate: () => {
          g.setX(x - d.v);
          spring.setTo(x + 20, y, x - d.v + 40, y);
        },
        onComplete: () => (g.destroy(), spring.destroy()),
      });
      scene.cameras.main.shake(120, 0.005);
      break;
    }
    case "paper": {
      const b = scene.add.circle(x, y, 14, 0xfffaf0).setStrokeStyle(3, 0x1c1618).setDepth(4);
      scene.tweens.add({ targets: b, x: x + 420, duration: 900 });
      scene.tweens.add({ targets: b, y: y - 140, duration: 420, ease: "Quad.Out", yoyo: true, onComplete: () => scene.tweens.add({ targets: b, y: floor - 12, duration: 260, ease: "Bounce.Out" }) });
      scene.tweens.add({ targets: b, alpha: 0, delay: 2600, duration: 400, onComplete: () => b.destroy() });
      break;
    }
    case "confetti":
      dots(scene, x, y, [0xe0528a, 0xf0c35a, 0x7ec4a8, 0x7e5ce0, 0x4fc3e0], 40, 400, 120, 1200);
      break;
    case "bubbleup":
      for (let i = 0; i < 10; i++) {
        const b = scene.add.circle(x + Phaser.Math.Between(-50, 50), y, Phaser.Math.Between(6, 14)).setStrokeStyle(3, 0xcfe0ff).setDepth(4);
        scene.tweens.add({ targets: b, y: y - Phaser.Math.Between(120, 260), alpha: 0, delay: i * 80, duration: 900, onComplete: () => b.destroy() });
      }
      break;
  }
}

// ------------------------------------------------------------- ambient

function ambient(scene: Phaser.Scene, kind: Ambient, p: { x: number; y: number }) {
  switch (kind) {
    case "fireflies":
      for (let i = 0; i < 9; i++) {
        const f = scene.add.circle(p.x + Phaser.Math.Between(-160, 160), p.y + Phaser.Math.Between(-100, 100), 4, 0xe9ff8a).setDepth(4);
        scene.tweens.add({ targets: f, x: f.x + Phaser.Math.Between(-60, 60), y: f.y + Phaser.Math.Between(-40, 40), duration: Phaser.Math.Between(1600, 2600), yoyo: true, repeat: -1, ease: "Sine.InOut" });
        scene.tweens.add({ targets: f, alpha: 0.15, duration: Phaser.Math.Between(400, 900), yoyo: true, repeat: -1 });
      }
      break;
    case "bubbles":
      scene.time.addEvent({
        delay: 450,
        loop: true,
        callback: () => {
          const b = scene.add.circle(p.x + Phaser.Math.Between(-90, 90), p.y, Phaser.Math.Between(4, 9)).setStrokeStyle(2, 0xffffff, 0.9).setDepth(2);
          scene.tweens.add({ targets: b, y: p.y - Phaser.Math.Between(90, 140), alpha: 0, duration: 1500, onComplete: () => b.destroy() });
        },
      });
      break;
    case "gears": {
      const a = scene.add.image(p.x - 40, p.y - 30, "sp-gear_0").setDepth(2).setScale(0.8);
      const b = scene.add.image(p.x + 62, p.y + 40, "sp-gear_0").setDepth(2).setScale(0.55);
      scene.tweens.add({ targets: a, angle: 360, duration: 4000, repeat: -1 });
      scene.tweens.add({ targets: b, angle: -360, duration: 2800, repeat: -1 });
      break;
    }
    case "portal": {
      const a = scene.add.image(p.x, p.y, "sp-portal_0").setDepth(2).setAlpha(0.9);
      scene.tweens.add({ targets: a, angle: -360, duration: 3200, repeat: -1 });
      scene.tweens.add({ targets: a, scale: 1.08, duration: 900, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      break;
    }
    case "flicker": {
      const g = scene.add.circle(p.x, p.y, 46, 0xffb04a, 0.25).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: g, alpha: 0.08, scale: 0.85, duration: Phaser.Math.Between(120, 260), yoyo: true, repeat: -1 });
      break;
    }
    case "steam":
      scene.time.addEvent({
        delay: 380,
        loop: true,
        callback: () => {
          const c = scene.add.circle(p.x + Phaser.Math.Between(-40, 40), p.y, Phaser.Math.Between(12, 22), 0xffffff, 0.5).setDepth(2);
          scene.tweens.add({ targets: c, y: p.y - 160, scale: 2, alpha: 0, duration: 1600, onComplete: () => c.destroy() });
        },
      });
      break;
    case "embers":
      scene.time.addEvent({
        delay: 160,
        loop: true,
        callback: () => {
          const e = scene.add.circle(p.x + Phaser.Math.Between(-120, 120), p.y, Phaser.Math.Between(2, 4), 0xffb04a).setDepth(2);
          scene.tweens.add({ targets: e, y: p.y - Phaser.Math.Between(100, 260), x: e.x + Phaser.Math.Between(-30, 30), alpha: 0, duration: 1300, onComplete: () => e.destroy() });
        },
      });
      break;
    case "drips":
      scene.time.addEvent({
        delay: 1400,
        loop: true,
        callback: () => {
          const r = scene.add.ellipse(p.x + Phaser.Math.Between(-120, 120), p.y, 20, 6).setStrokeStyle(2, 0x5a4d50).setDepth(2);
          scene.tweens.add({ targets: r, scaleX: 3, scaleY: 2, alpha: 0, duration: 900, onComplete: () => r.destroy() });
        },
      });
      break;
  }
}
