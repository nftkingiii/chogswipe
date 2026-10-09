// Hand-inked art generated at runtime with rough.js. Every texture is drawn
// in BOIL_FRAMES variants with different seeds; cycling them gives the line
// "boil" of hand-drawn animation.
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { TrapKind } from "@chogswipe/sim";

export const BOIL_FRAMES = 3;
export const INK = "#1c1618";
export const PAPER = "#f3eadb";
export const ACCENT = "#e0528a";

export const WALL_TINTS = ["#c9d3b8", "#ebcfc4", "#efdda8"];

type Draw = (ctx: CanvasRenderingContext2D, rc: ReturnType<typeof rough.canvas>, seed: number) => void;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

const ink = (seed: number, extra: Options = {}): Options => ({
  seed,
  stroke: INK,
  strokeWidth: 4,
  roughness: 1.6,
  bowing: 1.2,
  ...extra,
});

/** Draw `fn` into BOIL_FRAMES canvases and register them as Phaser textures key_0..key_n. */
export function bake(scene: Phaser.Scene, key: string, w: number, h: number, fn: Draw) {
  for (let f = 0; f < BOIL_FRAMES; f++) {
    const c = canvas(w, h);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    fn(ctx, rough.canvas(c), 1000 + f * 7919 + hash(key));
    scene.textures.addCanvas(`${key}_${f}`, c);
  }
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 100_000;
}

/** Paper grain so flat fills read like printed ink on paper. */
export function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount = 18, seed = 7) {
  const img = ctx.getImageData(0, 0, w, h);
  let s = seed;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s >>> 24) / 255 - 0.5) * amount;
    img.data[i] = img.data[i]! + n;
    img.data[i + 1] = img.data[i + 1]! + n;
    img.data[i + 2] = img.data[i + 2]! + n;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- rooms

export const ROOM_PX = 960;
export const VIEW_H = 720;
export const FLOOR_Y = 590;

export function bakeRoom(scene: Phaser.Scene, index: number, last: boolean) {
  const W = ROOM_PX + 8;
  const H = VIEW_H;
  bake(scene, `room${index}`, W, H, (ctx, rc, seed) => {
    const tint = WALL_TINTS[index % WALL_TINTS.length]!;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, FLOOR_Y);
    // wallpaper stripes
    for (let x = 40; x < W; x += 64) {
      rc.line(x, 70, x, FLOOR_Y - 70, ink(seed + x, { strokeWidth: 1.4, stroke: "rgba(28,22,24,0.18)", roughness: 2.2 }));
    }
    // dado rail
    rc.line(0, FLOOR_Y - 120, W, FLOOR_Y - 120, ink(seed + 1, { strokeWidth: 3 }));
    // ceiling
    ctx.fillStyle = "#2a2124";
    ctx.fillRect(0, 0, W, 58);
    rc.line(0, 58, W, 58, ink(seed + 2, { strokeWidth: 5 }));
    // floorboards
    ctx.fillStyle = "#b8916a";
    ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    rc.line(0, FLOOR_Y, W, FLOOR_Y, ink(seed + 3, { strokeWidth: 6 }));
    for (let y = FLOOR_Y + 34; y < H; y += 34) rc.line(0, y, W, y, ink(seed + y, { strokeWidth: 2, stroke: "rgba(28,22,24,0.45)" }));
    for (let x = 90; x < W; x += 180) {
      const off = ((x / 180) % 2) * 34;
      rc.line(x, FLOOR_Y + off, x, FLOOR_Y + off + 34, ink(seed + x * 3, { strokeWidth: 2, stroke: "rgba(28,22,24,0.45)" }));
    }
    // skirting board shadow
    ctx.fillStyle = "rgba(28,22,24,0.12)";
    ctx.fillRect(0, FLOOR_Y - 18, W, 18);

    // props differ per room
    if (index === 0) {
      rug(rc, seed, 120, 520, "#c96a5a");
      frame(rc, seed, 120, 160, 150, 120, "#6f8fb3", (x, y, w, h) => fwogDoodle(rc, seed + 40, x + w / 2, y + h / 2 + 8));
      couch(rc, seed, 180);
      lamp(rc, ctx, seed, 600);
    } else if (index === 1) {
      shelf(rc, seed, 90);
      frame(rc, seed + 9, 520, 150, 150, 170, "#f3eadb", (x, y, w) => wanted(ctx, rc, seed + 60, x, y, w));
      plant(rc, seed, 820);
    } else {
      rug(rc, seed, 360, 640, "#6f8fb3");
      frame(rc, seed, 120, 150, 130, 130, "#efdda8", (x, y, w, h) => coinDoodle(ctx, rc, seed + 70, x + w / 2, y + h / 2));
      lamp(rc, ctx, seed, 470);
    }
    // partition walls with open doorways between rooms
    if (index > 0) wall(rc, ctx, seed + 80, 0, false);
    if (!last) wall(rc, ctx, seed + 90, W - 60, true);
    vignette(ctx, W, H);
    grain(ctx, W, H, 16, seed);
  });
}

type RC = ReturnType<typeof rough.canvas>;

function frame(rc: RC, seed: number, x: number, y: number, w: number, h: number, fill: string, art?: (x: number, y: number, w: number, h: number) => void) {
  rc.rectangle(x - 12, y - 12, w + 24, h + 24, ink(seed, { fill: "#c79a4a", fillStyle: "solid", strokeWidth: 4 }));
  rc.rectangle(x, y, w, h, ink(seed + 1, { fill, fillStyle: "solid", strokeWidth: 3 }));
  art?.(x, y, w, h);
}

function fwogDoodle(rc: RC, seed: number, cx: number, cy: number) {
  rc.ellipse(cx, cy + 10, 90, 56, ink(seed, { fill: "#7cc36a", fillStyle: "solid", strokeWidth: 3 }));
  rc.circle(cx - 22, cy - 18, 30, ink(seed + 1, { fill: "#fff", fillStyle: "solid", strokeWidth: 3 }));
  rc.circle(cx + 22, cy - 18, 30, ink(seed + 2, { fill: "#fff", fillStyle: "solid", strokeWidth: 3 }));
  rc.circle(cx - 20, cy - 16, 9, ink(seed + 3, { fill: INK, fillStyle: "solid", strokeWidth: 1 }));
  rc.circle(cx + 24, cy - 16, 9, ink(seed + 4, { fill: INK, fillStyle: "solid", strokeWidth: 1 }));
  rc.arc(cx, cy + 12, 34, 16, 0, Math.PI, false, ink(seed + 5, { strokeWidth: 3 }));
}

function coinDoodle(ctx: CanvasRenderingContext2D, rc: RC, seed: number, cx: number, cy: number) {
  rc.circle(cx, cy, 78, ink(seed, { fill: "#f0c35a", fillStyle: "solid" }));
  rc.circle(cx, cy, 56, ink(seed + 1, { strokeWidth: 2 }));
  ctx.font = "34px 'Luckiest Guy'";
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.fillText("C", cx, cy + 13);
  ctx.textAlign = "start";
}

function wanted(ctx: CanvasRenderingContext2D, rc: RC, seed: number, x: number, y: number, w: number) {
  ctx.font = "26px 'Luckiest Guy'";
  ctx.fillStyle = "#c0392b";
  ctx.textAlign = "center";
  ctx.fillText("WANTED", x + w / 2, y + 34);
  rc.rectangle(x + 30, y + 46, w - 60, 80, ink(seed, { fill: "#d9cbb3", fillStyle: "hachure", hachureGap: 6, strokeWidth: 2 }));
  ctx.font = "34px 'Luckiest Guy'";
  ctx.fillStyle = INK;
  ctx.fillText("?", x + w / 2, y + 100);
  ctx.font = "16px 'Patrick Hand'";
  ctx.fillText("for swiping $CHOG", x + w / 2, y + 150);
  ctx.textAlign = "start";
}

function couch(rc: RC, seed: number, x: number) {
  const y = FLOOR_Y;
  rc.rectangle(x, y - 150, 300, 80, ink(seed + 100, { fill: "#8f6bb0", fillStyle: "solid" }));
  rc.rectangle(x - 20, y - 100, 340, 70, ink(seed + 101, { fill: "#a07fc0", fillStyle: "solid" }));
  rc.rectangle(x - 34, y - 130, 40, 100, ink(seed + 102, { fill: "#8f6bb0", fillStyle: "solid" }));
  rc.rectangle(x + 294, y - 130, 40, 100, ink(seed + 103, { fill: "#8f6bb0", fillStyle: "solid" }));
  rc.line(x + 150, y - 100, x + 150, y - 30, ink(seed + 104, { strokeWidth: 2 }));
  rc.rectangle(x - 10, y - 30, 14, 30, ink(seed + 105, { fill: INK, fillStyle: "solid", strokeWidth: 2 }));
  rc.rectangle(x + 296, y - 30, 14, 30, ink(seed + 106, { fill: INK, fillStyle: "solid", strokeWidth: 2 }));
}

function shelf(rc: RC, seed: number, x: number) {
  const y = FLOOR_Y;
  rc.rectangle(x, y - 330, 220, 330, ink(seed + 110, { fill: "#9a6a44", fillStyle: "solid" }));
  const books = ["#e0528a", "#6f8fb3", "#f0c35a", "#7ec4a8", "#c96a5a", "#a07fc0"];
  for (let row = 0; row < 3; row++) {
    const by = y - 320 + row * 106;
    rc.line(x, by + 100, x + 220, by + 100, ink(seed + 111 + row, { strokeWidth: 4 }));
    let bx = x + 12;
    for (let b = 0; b < 7; b++) {
      const bw = 18 + ((b * 7 + row * 3) % 4) * 4;
      const bh = 60 + ((b * 5 + row) % 4) * 9;
      rc.rectangle(bx, by + 100 - bh, bw, bh, ink(seed + 120 + row * 10 + b, { fill: books[(b + row) % books.length], fillStyle: "solid", strokeWidth: 2.5 }));
      bx += bw + 6;
      if (bx > x + 200) break;
    }
  }
}

function rug(rc: RC, seed: number, x0: number, x1: number, fill: string) {
  rc.ellipse((x0 + x1) / 2, FLOOR_Y + 48, x1 - x0, 46, ink(seed + 130, { fill, fillStyle: "zigzag", hachureGap: 9, fillWeight: 2.5, strokeWidth: 3 }));
}

function wall(rc: RC, ctx: CanvasRenderingContext2D, seed: number, x: number, right: boolean) {
  ctx.fillStyle = "#3b3033";
  ctx.fillRect(x, 58, 60, FLOOR_Y - 58 - 270);
  rc.rectangle(x, 58, 60, FLOOR_Y - 58 - 270, ink(seed, { strokeWidth: 5, fill: "#4a3d40", fillStyle: "hachure", hachureGap: 10 }));
  rc.rectangle(x - (right ? 10 : 0), FLOOR_Y - 280, 70, 22, ink(seed + 1, { fill: "#8a5a3c", fillStyle: "solid", strokeWidth: 4 }));
  rc.line(x + (right ? 0 : 60), FLOOR_Y - 260, x + (right ? 0 : 60), FLOOR_Y, ink(seed + 2, { strokeWidth: 6 }));
}

function vignette(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, "rgba(28,22,24,0)");
  g.addColorStop(1, "rgba(28,22,24,0.28)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function lamp(rc: ReturnType<typeof rough.canvas>, ctx: CanvasRenderingContext2D, seed: number, x: number) {
  rc.line(x, 58, x, 140, ink(seed + 11, { strokeWidth: 3 }));
  rc.polygon(
    [
      [x - 46, 200],
      [x + 46, 200],
      [x + 24, 140],
      [x - 24, 140],
    ],
    ink(seed + 12, { fill: "#f0c35a", fillStyle: "solid" }),
  );
  const g = ctx.createRadialGradient(x, 210, 10, x, 260, 260);
  g.addColorStop(0, "rgba(255,226,140,0.35)");
  g.addColorStop(1, "rgba(255,226,140,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - 280, 200, 560, 420);
}

function plant(rc: ReturnType<typeof rough.canvas>, seed: number, x: number) {
  rc.polygon(
    [
      [x - 40, FLOOR_Y - 90],
      [x + 40, FLOOR_Y - 90],
      [x + 30, FLOOR_Y],
      [x - 30, FLOOR_Y],
    ],
    ink(seed + 20, { fill: "#c8643c", fillStyle: "solid" }),
  );
  for (let i = -2; i <= 2; i++) {
    rc.ellipse(x + i * 22, FLOOR_Y - 150 - Math.abs(i) * -12, 34, 90, ink(seed + 21 + i, { fill: "#5e8f4e", fillStyle: "solid", strokeWidth: 3 }));
  }
}

function door(rc: ReturnType<typeof rough.canvas>, ctx: CanvasRenderingContext2D, seed: number, x: number, fill: string) {
  ctx.fillStyle = "rgba(28,22,24,0.85)";
  ctx.fillRect(x, FLOOR_Y - 250, 96, 250);
  rc.rectangle(x, FLOOR_Y - 250, 96, 250, ink(seed + 30, { strokeWidth: 5 }));
  rc.rectangle(x + 10, FLOOR_Y - 240, 76, 240, ink(seed + 31, { fill, fillStyle: "solid", strokeWidth: 3 }));
  rc.circle(x + 72, FLOOR_Y - 120, 12, ink(seed + 32, { fill: "#f0c35a", fillStyle: "solid", strokeWidth: 2 }));
}

// ---------------------------------------------------------------- vault

export function bakeVault(scene: Phaser.Scene) {
  bake(scene, "vault", 220, 260, (ctx, rc, seed) => {
    rc.rectangle(10, 20, 200, 230, ink(seed, { fill: "#4b5a6b", fillStyle: "solid", strokeWidth: 5 }));
    rc.rectangle(28, 38, 164, 194, ink(seed + 1, { fill: "#66788c", fillStyle: "solid", strokeWidth: 3 }));
    rc.circle(110, 120, 80, ink(seed + 2, { fill: "#d7dde3", fillStyle: "solid", strokeWidth: 4 }));
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      rc.line(110 + Math.cos(t) * 28, 120 + Math.sin(t) * 28, 110 + Math.cos(t) * 36, 120 + Math.sin(t) * 36, ink(seed + 3 + a, { strokeWidth: 2 }));
    }
    rc.line(110, 120, 128, 104, ink(seed + 20, { strokeWidth: 4, stroke: ACCENT }));
    rc.rectangle(150, 160, 30, 50, ink(seed + 21, { fill: "#f0c35a", fillStyle: "solid", strokeWidth: 3 }));
    ctx.font = "26px 'Luckiest Guy'";
    ctx.fillStyle = "#f3eadb";
    ctx.fillText("$CHOG", 58, 222);
    grain(ctx, 220, 260, 12, seed);
  });
}

// ---------------------------------------------------------------- traps

export const TRAP_W = 120;
export const TRAP_H = 90;

const TRAP_ART: Record<TrapKind, Draw> = {
  Tripwire: (_ctx, rc, s) => {
    rc.rectangle(8, 30, 12, 56, ink(s, { fill: "#8a5a3c", fillStyle: "solid", strokeWidth: 3 }));
    rc.rectangle(100, 30, 12, 56, ink(s + 1, { fill: "#8a5a3c", fillStyle: "solid", strokeWidth: 3 }));
    rc.line(18, 52, 102, 54, ink(s + 2, { stroke: "#c0392b", strokeWidth: 3, roughness: 0.6 }));
  },
  "Gum Snare": (_ctx, rc, s) => {
    rc.ellipse(60, 74, 104, 28, ink(s, { fill: "#f29bc0", fillStyle: "solid" }));
    rc.ellipse(48, 54, 46, 40, ink(s + 1, { fill: "#f6b4d2", fillStyle: "solid", strokeWidth: 3 }));
    rc.circle(42, 46, 10, ink(s + 2, { fill: "#fff", fillStyle: "solid", strokeWidth: 1.5 }));
  },
  "Spring Plate": (_ctx, rc, s) => {
    for (let i = 0; i < 4; i++) rc.ellipse(60, 70 - i * 9, 54, 12, ink(s + i, { strokeWidth: 3 }));
    rc.rectangle(18, 30, 84, 12, ink(s + 9, { fill: "#9aa6b2", fillStyle: "solid", strokeWidth: 3 }));
    rc.rectangle(14, 78, 92, 10, ink(s + 10, { fill: "#6b7580", fillStyle: "solid", strokeWidth: 3 }));
  },
  "Slick Floor": (_ctx, rc, s) => {
    const cols = ["#e0528a", "#f0c35a", "#7ec4a8", "#6f8fb3"];
    cols.forEach((c, i) => rc.ellipse(60, 74, 110 - i * 22, 28 - i * 5, ink(s + i, { fill: c, fillStyle: "solid", strokeWidth: i === 0 ? 4 : 1.5 })));
  },
  "Bait Coin": (ctx, rc, s) => {
    rc.ellipse(60, 78, 90, 18, ink(s, { fill: "#c79a2a", fillStyle: "solid", strokeWidth: 3 }));
    rc.circle(60, 52, 46, ink(s + 1, { fill: "#f0c35a", fillStyle: "solid" }));
    ctx.font = "28px 'Luckiest Guy'";
    ctx.fillStyle = INK;
    ctx.fillText("B", 50, 64);
  },
  Chomper: (_ctx, rc, s) => {
    rc.ellipse(60, 76, 106, 22, ink(s, { fill: "#6b7580", fillStyle: "solid" }));
    const teeth = (y: number, dir: number, seed: number) =>
      rc.polygon(
        Array.from({ length: 9 }, (_, i) => [12 + i * 12, y + (i % 2 === 0 ? 0 : dir * 20)] as [number, number]),
        ink(seed, { fill: "#d7dde3", fillStyle: "solid", strokeWidth: 3 }),
      );
    teeth(66, -1, s + 1);
    rc.circle(60, 74, 14, ink(s + 2, { fill: "#c0392b", fillStyle: "solid", strokeWidth: 2 }));
  },
  "Crybaby Alarm": (_ctx, rc, s) => {
    rc.rectangle(40, 70, 40, 16, ink(s, { fill: "#6b7580", fillStyle: "solid", strokeWidth: 3 }));
    rc.arc(60, 70, 56, 70, Math.PI, Math.PI * 2, true, ink(s + 1, { fill: "#e74c3c", fillStyle: "solid" }));
    rc.line(14, 30, 26, 40, ink(s + 2, { strokeWidth: 3 }));
    rc.line(106, 30, 94, 40, ink(s + 3, { strokeWidth: 3 }));
    rc.line(60, 6, 60, 18, ink(s + 4, { strokeWidth: 3 }));
  },
  "Jack-in-the-Box": (ctx, rc, s) => {
    rc.rectangle(28, 34, 64, 52, ink(s, { fill: "#6f8fb3", fillStyle: "solid" }));
    rc.rectangle(28, 34, 64, 52, ink(s + 1, { fill: "#f0c35a", fillStyle: "cross-hatch", hachureGap: 10, strokeWidth: 0.1 }));
    rc.line(92, 56, 110, 56, ink(s + 2, { strokeWidth: 4 }));
    rc.circle(112, 50, 10, ink(s + 3, { fill: ACCENT, fillStyle: "solid", strokeWidth: 2 }));
    ctx.font = "22px 'Luckiest Guy'";
    ctx.fillStyle = INK;
    ctx.fillText("?", 52, 70);
  },
};

export function bakeTraps(scene: Phaser.Scene) {
  for (const [kind, fn] of Object.entries(TRAP_ART)) bake(scene, `trap:${kind}`, TRAP_W, TRAP_H, fn as Draw);
  // "you sense something here" marker for Hunch
  bake(scene, "hunch", 60, 60, (ctx, rc, s) => {
    rc.circle(30, 30, 46, ink(s, { stroke: ACCENT, strokeWidth: 3, fill: "rgba(224,82,138,0.15)", fillStyle: "solid" }));
    ctx.font = "30px 'Luckiest Guy'";
    ctx.fillStyle = ACCENT;
    ctx.fillText("?", 22, 42);
  });
}

// ---------------------------------------------------------------- puppet body

export const SKIN: Record<string, string> = {
  Pink: "#f2b6c6",
  Origin: "#f3eadb",
  Red: "#e0614f",
  Black: "#3b3336",
  Yellow: "#f0d36a",
  Blue: "#7fb2e5",
  White: "#fbf8f2",
  Green: "#8cc084",
  Jade: "#5fae95",
  Purple: "#a787d6",
  Beige: "#e2cfae",
  Metal: "#9aa6b2",
  Grey: "#b5b0ab",
  "Multi Colored": "#f0c35a",
};

/** Torso blob the sticker head sits on; legs and arms are drawn live. */
export function bakeTorso(scene: Phaser.Scene, key: string, fill: string) {
  bake(scene, key, 150, 130, (_ctx, rc, s) => {
    rc.ellipse(75, 68, 124, 112, ink(s, { fill, fillStyle: "solid", strokeWidth: 5 }));
    rc.ellipse(75, 80, 70, 56, ink(s + 1, { fill: "rgba(255,255,255,0.4)", fillStyle: "solid", strokeWidth: 0.1 }));
  });
}

export function bakeSack(scene: Phaser.Scene) {
  bake(scene, "sack", 110, 110, (ctx, rc, s) => {
    rc.ellipse(55, 66, 86, 76, ink(s, { fill: "#c9a46a", fillStyle: "solid" }));
    rc.polygon(
      [
        [38, 28],
        [72, 28],
        [64, 38],
        [46, 38],
      ],
      ink(s + 1, { fill: "#b38b52", fillStyle: "solid", strokeWidth: 3 }),
    );
    rc.line(40, 36, 70, 36, ink(s + 2, { stroke: "#c0392b", strokeWidth: 4 }));
    ctx.font = "26px 'Luckiest Guy'";
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.fillText("$", 55, 80);
    ctx.textAlign = "start";
  });
}
