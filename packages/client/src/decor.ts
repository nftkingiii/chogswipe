// Set dressing for each lore heist: wallpaper, floor, the view out of the windows and
// the furniture in all six rooms, so every location looks like the monanimal who lives there.
// Player hideouts keep the plain house look in rooms.ts.
//
// Rooms share the sim floor plan, so props keep clear of what every hideout has in the same
// spot: the lounge stairs (room 0, x 440–820), the kitchen stairs (room 2, x 160–540), the
// stairwells upstairs (room 3, x 240–460; room 5, x 340–560), the vent (rooms 1 and 4 at x 480),
// the front door (room 0, left), the locked door (room 4, right) and the vault (room 5, right).
import type { Options } from "roughjs/bin/core";
import { FLOOR_Y, INK, VIEW_H, coinDoodle, ink, type RC } from "./art.js";

export type WallKind = "reeds" | "splatter" | "awning" | "bark" | "waves" | "rivets" | "bricks";
export type FloorKind = "boardwalk" | "concrete" | "checker" | "branches" | "wetstone" | "grate" | "ironplates";
export type SkyKind = "city" | "swamp" | "dusk" | "jungle" | "river" | "vortex" | "inferno";

export interface Paint {
  ctx: CanvasRenderingContext2D;
  rc: RC;
  s: number;
  /** this room's wall tint */
  wall: string;
  accent: string;
}

export interface Decor {
  wall: WallKind;
  floor: FloorKind;
  /** ceiling band colour */
  ceiling: string;
  sky: SkyKind;
  /** window frame and curtain colours; null curtain for none */
  frame: string;
  curtain: string | null;
  /** wall colour per room */
  walls: string[];
  /** extra darkness over the whole room, by room */
  dim?: number[];
  rooms: ((p: Paint) => void)[];
  /** the thing in the foreground the Chog walks behind (220×300 canvas, standing on y 300) */
  fg?: (ctx: CanvasRenderingContext2D, rc: RC, s: number) => void;
}

const W = 968;
const CEIL = 58;

// ----------------------------------------------------------------- helpers

const solid = (s: number, fill: string, extra: Options = {}) => ink(s, { fill, fillStyle: "solid", ...extra });
const thin = (s: number, stroke = "rgba(28,22,24,0.25)", w = 2) => ink(s, { stroke, strokeWidth: w, roughness: 2 });

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 22, color = INK, font = "'Luckiest Guy'") {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.textAlign = "start";
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a = 0.35) {
  const g = ctx.createRadialGradient(x, y, 4, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A cheap repeatable random so wallpaper doodles sit in the same place on every boil frame. */
function rand(seed: number) {
  let r = seed >>> 0;
  return () => ((r = (r * 1103515245 + 12345) >>> 0) % 10_000) / 10_000;
}

function frameArt(p: Paint, x: number, y: number, w: number, h: number, fill: string, wood = "#c79a4a") {
  p.rc.rectangle(x - 12, y - 12, w + 24, h + 24, solid(p.s + x, wood, { strokeWidth: 4 }));
  p.rc.rectangle(x, y, w, h, solid(p.s + x + 1, fill, { strokeWidth: 3 }));
}

function shelfBoard(p: Paint, x: number, y: number, w: number, wood = "#8a5a3c") {
  p.rc.rectangle(x, y, w, 14, solid(p.s + x + y, wood, { strokeWidth: 3 }));
  p.rc.line(x + 16, y + 14, x + 30, y + 40, ink(p.s + x + 1, { strokeWidth: 3 }));
  p.rc.line(x + w - 16, y + 14, x + w - 30, y + 40, ink(p.s + x + 2, { strokeWidth: 3 }));
}

function jar(p: Paint, x: number, base: number, w: number, h: number, fill: string, lid = "#c96a5a") {
  p.rc.rectangle(x - w / 2, base - h, w, h, solid(p.s + x + base, fill, { strokeWidth: 3 }));
  p.rc.rectangle(x - w / 2 - 4, base - h - 12, w + 8, 12, solid(p.s + x + 3, lid, { strokeWidth: 2.5 }));
  p.ctx.fillStyle = "rgba(255,255,255,0.45)";
  p.ctx.fillRect(x - w / 2 + 6, base - h + 8, 6, h - 16);
}

function crate(p: Paint, x: number, w: number, h: number, fill = "#b8916a", base = FLOOR_Y) {
  p.rc.rectangle(x, base - h, w, h, solid(p.s + x + h, fill));
  p.rc.line(x, base - h, x + w, base, ink(p.s + x + 1, { strokeWidth: 2.5 }));
  p.rc.line(x + w, base - h, x, base, ink(p.s + x + 2, { strokeWidth: 2.5 }));
}

function candle(p: Paint, x: number, base: number, h = 40) {
  p.rc.rectangle(x - 7, base - h, 14, h, solid(p.s + x, "#f3eadb", { strokeWidth: 2.5 }));
  p.rc.ellipse(x, base - h - 12, 12, 20, solid(p.s + x + 1, "#f6b84a", { strokeWidth: 2 }));
  glow(p.ctx, x, base - h - 14, 70, "255,200,110", 0.3);
}

function banner(p: Paint, x: number, y: number, w: number, h: number, fill: string, art?: () => void) {
  p.rc.line(x - 10, y, x + w + 10, y, ink(p.s + x, { strokeWidth: 6, stroke: "#5a3a26" }));
  p.rc.polygon(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x + w / 2, y + h - 30],
      [x, y + h],
    ],
    solid(p.s + x + 1, fill),
  );
  art?.();
}

// ----------------------------------------------------------------- walls

export function paintWall(p: Paint, kind: WallKind) {
  const { ctx, rc, s } = p;
  const r = rand(s % 997);
  switch (kind) {
    case "reeds":
      // cattails and reeds rising from the skirting, ripples near the top
      for (let x = 30; x < W; x += 58) {
        const h = 150 + r() * 150;
        rc.line(x, FLOOR_Y - 120, x + 8, FLOOR_Y - 120 - h, thin(s + x, "rgba(48,92,60,0.35)", 3));
        rc.ellipse(x + 8, FLOOR_Y - 120 - h, 10, 34, ink(s + x + 1, { fill: "rgba(122,82,52,0.45)", fillStyle: "solid", stroke: "rgba(28,22,24,0.2)", strokeWidth: 1.5 }));
      }
      for (let x = 0; x < W; x += 120) rc.arc(x + 60, 110, 90, 20, 0, Math.PI, false, thin(s + x + 5, "rgba(255,255,255,0.4)", 2));
      break;
    case "splatter":
      // gallery white with paint flicks
      for (let i = 0; i < 22; i++) {
        const x = r() * W, y = CEIL + 40 + r() * (FLOOR_Y - 220);
        const c = ["rgba(224,82,138,0.35)", "rgba(126,92,224,0.3)", "rgba(240,195,90,0.4)", "rgba(79,195,224,0.3)"][i % 4]!;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, 6 + r() * 14, 0, Math.PI * 2);
        ctx.fill();
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(x + (r() - 0.5) * 60, y + (r() - 0.5) * 40, 2 + r() * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case "awning":
      // bakery stripes with a scalloped top
      for (let x = 0; x < W; x += 64) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(x, CEIL, 32, FLOOR_Y - 120 - CEIL);
      }
      for (let x = 0; x < W; x += 48) rc.arc(x + 24, CEIL + 20, 48, 40, 0, Math.PI, true, solid(s + x, x % 96 ? "#e0528a" : "#f3eadb", { strokeWidth: 2.5 }));
      break;
    case "bark":
      // treehouse planks with knots and hanging leaves
      for (let x = 0; x < W; x += 72) {
        rc.line(x, CEIL, x + 4, FLOOR_Y - 120, thin(s + x, "rgba(28,22,24,0.35)", 3));
        if (r() < 0.6) rc.ellipse(x + 36, CEIL + 80 + r() * 300, 16, 26, thin(s + x + 2, "rgba(28,22,24,0.35)", 2));
      }
      for (let x = 20; x < W; x += 90) {
        rc.line(x, CEIL, x + 30, CEIL + 50, ink(s + x + 7, { stroke: "#3f6b34", strokeWidth: 3 }));
        rc.ellipse(x + 34, CEIL + 58, 22, 34, solid(s + x + 8, "#6fa65a", { strokeWidth: 2 }));
      }
      break;
    case "waves":
      // stone blocks with a wave frieze
      for (let y = CEIL + 70; y < FLOOR_Y - 120; y += 60) {
        rc.line(0, y, W, y, thin(s + y));
        for (let x = (y / 60) % 2 ? 0 : 60; x < W; x += 120) rc.line(x, y - 60, x, y, thin(s + x + y));
      }
      for (let x = 0; x < W; x += 80) rc.arc(x + 40, CEIL + 40, 70, 46, Math.PI, Math.PI * 2, false, ink(s + x, { stroke: "rgba(79,195,224,0.7)", strokeWidth: 4 }));
      break;
    case "rivets":
      // steel panels with rivets and a pipe
      for (let x = 0; x < W; x += 160) {
        rc.rectangle(x + 8, CEIL + 16, 144, FLOOR_Y - 120 - CEIL - 32, thin(s + x, "rgba(28,22,24,0.35)", 2.5));
        for (const [dx, dy] of [
          [20, 30],
          [140, 30],
          [20, FLOOR_Y - 150 - CEIL],
          [140, FLOOR_Y - 150 - CEIL],
        ] as const) {
          ctx.fillStyle = "rgba(28,22,24,0.35)";
          ctx.beginPath();
          ctx.arc(x + dx, CEIL + dy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      rc.line(0, CEIL + 28, W, CEIL + 28, ink(s + 9, { stroke: "#9aa6b2", strokeWidth: 10, roughness: 0.6 }));
      break;
    case "bricks":
      for (let y = CEIL + 30; y < FLOOR_Y - 120; y += 40) {
        rc.line(0, y, W, y, thin(s + y, "rgba(0,0,0,0.4)", 2));
        for (let x = (y / 40) % 2 ? 0 : 50; x < W; x += 100) rc.line(x, y, x, y + 40, thin(s + x + y, "rgba(0,0,0,0.4)", 2));
      }
      // hanging chains
      for (let x = 140; x < W; x += 300) {
        for (let y = CEIL; y < CEIL + 160; y += 18) rc.ellipse(x, y, 10, 18, ink(s + x + y, { stroke: "#9aa6b2", strokeWidth: 2 }));
      }
      break;
  }
}

// ----------------------------------------------------------------- floors

const FLOOR_FILL: Record<FloorKind, string> = {
  boardwalk: "#9c7a52",
  concrete: "#b9b2a6",
  checker: "#f3eadb",
  branches: "#8a6242",
  wetstone: "#6f7a8c",
  grate: "#5c6670",
  ironplates: "#4a3d40",
};

export function paintFloor(p: Paint, kind: FloorKind, upper: boolean) {
  const { ctx, rc, s } = p;
  ctx.fillStyle = FLOOR_FILL[kind];
  ctx.fillRect(0, FLOOR_Y, W, VIEW_H - FLOOR_Y);
  const r = rand(s % 991);
  switch (kind) {
    case "boardwalk":
      // planks across the water, gaps showing pond below
      if (!upper) {
        ctx.fillStyle = "#4f8fa0";
        ctx.fillRect(0, VIEW_H - 40, W, 40);
      }
      for (let x = 0; x < W; x += 46) rc.line(x, FLOOR_Y, x - 20, upper ? VIEW_H : VIEW_H - 40, thin(s + x, "rgba(28,22,24,0.5)", 2.5));
      break;
    case "concrete":
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = ["rgba(224,82,138,0.5)", "rgba(126,92,224,0.45)", "rgba(240,195,90,0.55)"][i % 3]!;
        ctx.beginPath();
        ctx.ellipse(r() * W, FLOOR_Y + 20 + r() * 100, 10 + r() * 22, 4 + r() * 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "checker":
      for (let x = 0; x < W; x += 48) {
        for (let y = FLOOR_Y; y < VIEW_H; y += 32) {
          if (((x / 48) | 0) % 2 === (((y - FLOOR_Y) / 32) | 0) % 2) {
            ctx.fillStyle = "#c96a5a";
            ctx.fillRect(x, y, 48, 32);
          }
        }
      }
      break;
    case "branches":
      for (let y = FLOOR_Y + 24; y < VIEW_H; y += 30) rc.line(0, y + r() * 6, W, y + r() * 6, thin(s + y, "rgba(28,22,24,0.5)", 3));
      for (let i = 0; i < 10; i++) rc.ellipse(r() * W, FLOOR_Y + 30 + r() * 90, 18, 10, solid(s + i, "#6fa65a", { strokeWidth: 1.5 }));
      break;
    case "wetstone":
      for (let x = 0; x < W; x += 90) rc.line(x, FLOOR_Y, x + 30, VIEW_H, thin(s + x, "rgba(0,0,0,0.35)", 2.5));
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = "rgba(160,200,230,0.35)";
        ctx.beginPath();
        ctx.ellipse(r() * W, FLOOR_Y + 40 + r() * 70, 40 + r() * 40, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "grate":
      for (let x = 0; x < W; x += 22) rc.line(x, FLOOR_Y, x, VIEW_H, thin(s + x, "rgba(0,0,0,0.5)", 2));
      for (let y = FLOOR_Y + 30; y < VIEW_H; y += 30) rc.line(0, y, W, y, thin(s + y, "rgba(0,0,0,0.5)", 2));
      glow(ctx, W / 2, VIEW_H + 40, 500, "120,170,255", 0.18);
      break;
    case "ironplates":
      for (let x = 0; x < W; x += 120) {
        rc.rectangle(x + 4, FLOOR_Y + 6, 112, VIEW_H - FLOOR_Y - 12, thin(s + x, "rgba(0,0,0,0.6)", 3));
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        for (const [dx, dy] of [
          [14, 18],
          [104, 18],
        ] as const) ctx.fillRect(x + dx, FLOOR_Y + dy, 5, 5);
      }
      glow(ctx, W / 2, VIEW_H, 400, "255,90,40", 0.15);
      break;
  }
  rc.line(0, FLOOR_Y, W, FLOOR_Y, ink(s + 3, { strokeWidth: 6 }));
  ctx.fillStyle = "rgba(28,22,24,0.12)";
  ctx.fillRect(0, FLOOR_Y - 18, W, 18);
}

// ----------------------------------------------------------------- skies

/** The view through the windows. Drawn once per kind and scrolled slowly behind the rooms. */
export function paintSky(ctx: CanvasRenderingContext2D, rc: RC, s: number, kind: SkyKind, w: number, h: number) {
  const r = rand(77);
  const grad = (stops: string[]) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  const stars = (n: number, color = "#fff6d8") => {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) ctx.fillRect(r() * w, r() * h * 0.6, 2, 2);
  };
  const hills = (base: number, color: string, amp: number, seed: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 40) ctx.lineTo(x, base - Math.sin((x + seed) / 140) * amp - Math.sin((x + seed) / 53) * amp * 0.3);
    ctx.lineTo(w, h);
    ctx.fill();
  };
  switch (kind) {
    case "swamp":
      grad(["#14263a", "#24485a", "#3f6f6a"]);
      stars(90);
      rc.circle(w * 0.7, h * 0.18, 110, solid(s, "#f6f0c4", { strokeWidth: 3 }));
      hills(h * 0.6, "#1d3a33", 30, 0);
      // cattail silhouettes and fireflies
      for (let x = 0; x < w; x += 26) {
        const top = h * 0.55 - r() * 120;
        ctx.fillStyle = "#10241f";
        ctx.fillRect(x, top, 4, h - top);
        ctx.fillRect(x - 3, top - 26, 10, 30);
      }
      ctx.fillStyle = "#e9ff8a";
      for (let i = 0; i < 70; i++) ctx.fillRect(r() * w, h * 0.3 + r() * h * 0.5, 3, 3);
      ctx.fillStyle = "#2d6a73";
      ctx.fillRect(0, h * 0.82, w, h);
      break;
    case "dusk":
      grad(["#3a2d6b", "#c45a8a", "#f6b16a"]);
      rc.circle(w * 0.35, h * 0.55, 160, solid(s, "#ffd98a", { strokeWidth: 3 }));
      for (let x = -20, i = 0; x < w; i++) {
        const bw = 70 + r() * 120, bh = 120 + r() * 240;
        rc.rectangle(x, h * 0.75 - bh, bw, bh + h, solid(s + i, "#2a2148", { strokeWidth: 3, stroke: "#160f28" }));
        x += bw + 12;
      }
      ctx.font = "50px 'Luckiest Guy'";
      ctx.fillStyle = "#ffe08a";
      ctx.fillText("RAYJ ARTS", w * 0.52, h * 0.4);
      break;
    case "jungle":
      grad(["#0f2a24", "#1f4b3a", "#2f6b4a"]);
      stars(40);
      for (let i = 0; i < 60; i++) {
        const x = r() * w, y = r() * h;
        rc.ellipse(x, y, 140 + r() * 120, 90 + r() * 60, solid(s + i, i % 3 ? "#1d4434" : "#245640", { strokeWidth: 2, stroke: "#0b1c16" }));
      }
      for (let x = 30; x < w; x += 190) rc.line(x, 0, x + 30, h * 0.7, ink(s + x, { stroke: "#3b6b3a", strokeWidth: 5 }));
      ctx.fillStyle = "#e9ff8a";
      for (let i = 0; i < 50; i++) ctx.fillRect(r() * w, r() * h, 3, 3);
      break;
    case "river":
      grad(["#1b1440", "#3a2a7a", "#5b3f9a"]);
      stars(110, "#e6d8ff");
      rc.circle(w * 0.25, h * 0.15, 90, solid(s, "#e6d8ff", { strokeWidth: 3 }));
      hills(h * 0.55, "#2a1f5a", 40, 100);
      ctx.fillStyle = "#4b3a9a";
      ctx.fillRect(0, h * 0.62, w, h);
      for (let y = h * 0.66; y < h; y += 26) {
        for (let x = (y % 52) * 2; x < w; x += 110) rc.line(x, y, x + 50, y, ink(s + x + y, { stroke: "#a99aff", strokeWidth: 3 }));
      }
      // a salmon silhouette mid-leap
      rc.ellipse(w * 0.6, h * 0.55, 90, 36, solid(s + 9, "#e0528a", { strokeWidth: 3 }));
      break;
    case "vortex": {
      grad(["#0a1030", "#1c2a6a", "#0a1030"]);
      const cx = w / 2, cy = h * 0.42;
      for (let i = 0; i < 14; i++) {
        rc.ellipse(cx, cy, 120 + i * 120, 60 + i * 60, ink(s + i, { stroke: i % 2 ? "#5b7cff" : "#a07cff", strokeWidth: 4 }));
      }
      stars(120, "#cfe0ff");
      // clock faces flying into the vortex
      for (let i = 0; i < 12; i++) {
        const x = r() * w, y = r() * h, rr = 30 + r() * 40;
        rc.circle(x, y, rr, solid(s + 30 + i, "#e9e2ff", { strokeWidth: 3 }));
        rc.line(x, y, x, y - rr * 0.35, ink(s + 50 + i, { strokeWidth: 2 }));
        rc.line(x, y, x + rr * 0.25, y, ink(s + 70 + i, { strokeWidth: 2 }));
      }
      break;
    }
    case "inferno":
      grad(["#1a0606", "#5a1410", "#c0391b"]);
      for (let i = 0; i < 18; i++) rc.ellipse(r() * w, r() * h * 0.5, 260, 80, ink(s + i, { fill: "rgba(40,20,20,0.6)", fillStyle: "solid", stroke: "#2a0f0f", strokeWidth: 2 }));
      hills(h * 0.62, "#2a0d0d", 80, 300);
      // Mongrod's tower with one red eye
      rc.rectangle(w * 0.62, h * 0.18, 120, h, solid(s + 2, "#1a0a0a", { stroke: "#000" }));
      rc.circle(w * 0.62 + 60, h * 0.26, 46, solid(s + 3, "#ff3b2a", { strokeWidth: 3 }));
      ctx.fillStyle = "#ffb04a";
      for (let i = 0; i < 80; i++) ctx.fillRect(r() * w, h * 0.4 + r() * h * 0.6, 3, 3);
      break;
    case "city":
      break; // the original night city is drawn by rooms.ts
  }
}

// ----------------------------------------------------------------- the heists

// --- The Fwog Pond: Toad's pond house. Reeds, lily pads, flies on the menu.
const fwog: Decor = {
  fg: (_ctx, rc, s) => {
    // cattails
    for (let i = 0; i < 7; i++) {
      const x = 40 + i * 24, top = 40 + (i % 3) * 40;
      rc.line(x, 300, x + 6, top, ink(s + i, { stroke: "#2f4a2a", strokeWidth: 6 }));
      rc.ellipse(x + 6, top + 10, 16, 50, solid(s + 10 + i, "#6e4e34", { strokeWidth: 2 }));
      rc.ellipse(x + 20, 200 - i * 6, 18, 90, solid(s + 20 + i, "#3f6b34", { strokeWidth: 2 }));
    }
  },
  walls: ["#cfe6d2", "#d8ead0", "#c6e0d8", "#d4e8c8", "#cde4e0", "#bcd8cc"],
  wall: "reeds",
  floor: "boardwalk",
  ceiling: "#1d3a33",
  sky: "swamp",
  frame: "#6b4a2a",
  curtain: "#7ec4a8",
  rooms: [
    // Lily Lounge: Dad's portrait, a lily-pad rug, a fishing rod rack
    (p) => {
      frameArt(p, 270, 150, 150, 130, "#a8d8c0");
      p.rc.ellipse(345, 225, 96, 64, solid(p.s + 1, "#7cc36a"));
      p.rc.circle(320, 192, 30, solid(p.s + 2, "#fff", { strokeWidth: 3 }));
      p.rc.circle(370, 192, 30, solid(p.s + 3, "#fff", { strokeWidth: 3 }));
      p.rc.rectangle(318, 160, 54, 18, solid(p.s + 4, INK, { strokeWidth: 2 })); // top hat
      label(p.ctx, "DAD", 345, 310, 18);
      p.rc.ellipse(300, FLOOR_Y + 48, 300, 50, ink(p.s + 5, { fill: "#5e9f4e", fillStyle: "hachure", hachureGap: 8, strokeWidth: 3 }));
      for (let i = 0; i < 3; i++) p.rc.line(150 + i * 28, FLOOR_Y, 190 + i * 40, FLOOR_Y - 260, ink(p.s + 6 + i, { stroke: "#8a5a3c", strokeWidth: 5 }));
      p.rc.rectangle(130, FLOOR_Y - 40, 130, 40, solid(p.s + 9, "#6b4a2a"));
      label(p.ctx, "GONE FISHIN'", 340, FLOOR_Y - 200, 16, "#2d4f3a", "'Patrick Hand'");
    },
    // Reed Library: a tadpole aquarium (a frog lives in it) and jars of flies
    (p) => {
      p.rc.rectangle(90, FLOOR_Y - 110, 260, 110, solid(p.s, "#6b4a2a"));
      p.rc.rectangle(100, FLOOR_Y - 280, 240, 170, ink(p.s + 1, { fill: "rgba(120,200,220,0.65)", fillStyle: "solid", strokeWidth: 5 }));
      for (let i = 0; i < 6; i++) p.rc.ellipse(140 + i * 34, FLOOR_Y - 180 - (i % 3) * 28, 18, 12, solid(p.s + 2 + i, "#2a2124", { strokeWidth: 1 }));
      p.rc.ellipse(220, FLOOR_Y - 128, 200, 18, solid(p.s + 9, "#d9b46a", { strokeWidth: 2 }));
      shelfBoard(p, 620, 220, 280);
      shelfBoard(p, 620, 360, 280);
      for (let i = 0; i < 5; i++) jar(p, 650 + i * 56, 220, 40, 60, "rgba(200,230,200,0.8)");
      for (let i = 0; i < 4; i++) jar(p, 660 + i * 70, 360, 46, 70, "rgba(240,220,160,0.8)", "#7cc36a");
      label(p.ctx, "FLIES", 760, 460, 20, "#2d4f3a");
    },
    // Fly Kitchen: a cauldron of fly soup and the menu board
    (p) => {
      p.rc.rectangle(600, 150, 200, 130, solid(p.s, "#2a3a30"));
      label(p.ctx, "TODAY", 700, 190, 20, "#f3eadb");
      label(p.ctx, "fly soup", 700, 224, 22, "#f3eadb", "'Patrick Hand'");
      label(p.ctx, "fly pie", 700, 256, 22, "#f3eadb", "'Patrick Hand'");
      p.rc.arc(680, FLOOR_Y - 20, 200, 180, 0, Math.PI, false, solid(p.s + 1, "#3b3033"));
      p.rc.ellipse(680, FLOOR_Y - 20, 200, 40, solid(p.s + 2, "#7cc36a", { strokeWidth: 3 }));
      for (let i = 0; i < 5; i++) p.rc.circle(620 + i * 30, FLOOR_Y - 26, 8, solid(p.s + 3 + i, INK, { strokeWidth: 1 }));
      p.rc.rectangle(820, FLOOR_Y - 260, 100, 260, solid(p.s + 9, "#9fd4c0"));
      p.rc.line(900, FLOOR_Y - 220, 900, FLOOR_Y - 160, ink(p.s + 10, { strokeWidth: 5 }));
    },
    // Toad's Study: a map of the pond and a lily-pad desk lamp
    (p) => {
      frameArt(p, 150, 150, 180, 120, "#e8dcb0", "#6b4a2a");
      p.rc.ellipse(240, 210, 120, 70, ink(p.s, { fill: "#7fc0d6", fillStyle: "hachure", strokeWidth: 2 }));
      label(p.ctx, "X", 262, 220, 22, "#c0392b");
      p.rc.rectangle(80, FLOOR_Y - 120, 300, 20, solid(p.s + 1, "#6b4a2a"));
      p.rc.rectangle(92, FLOOR_Y - 100, 20, 100, solid(p.s + 2, "#4f3420"));
      p.rc.rectangle(348, FLOOR_Y - 100, 20, 100, solid(p.s + 3, "#4f3420"));
      p.rc.line(140, FLOOR_Y - 120, 180, FLOOR_Y - 220, ink(p.s + 4, { strokeWidth: 4 }));
      p.rc.ellipse(200, FLOOR_Y - 226, 90, 30, solid(p.s + 5, "#7cc36a"));
      glow(p.ctx, 200, FLOOR_Y - 200, 160, "255,240,160", 0.3);
      for (let i = 0; i < 3; i++) p.rc.rectangle(260 + i * 30, FLOOR_Y - 150, 24, 30, solid(p.s + 6 + i, ["#e0528a", "#f0c35a", "#6f8fb3"][i]!, { strokeWidth: 2 }));
      p.rc.ellipse(800, FLOOR_Y - 30, 160, 60, solid(p.s + 12, "#7cc36a"));
      label(p.ctx, "lily-pad beanbag", 800, FLOOR_Y - 80, 18, "#2d4f3a", "'Patrick Hand'");
    },
    // Lily-pad Bedroom: a waterbed lily pad under a mosquito net
    (p) => {
      p.rc.ellipse(720, FLOOR_Y - 40, 320, 80, solid(p.s, "#5e9f4e"));
      p.rc.ellipse(720, FLOOR_Y - 52, 300, 50, solid(p.s + 1, "#7cc36a", { strokeWidth: 3 }));
      p.rc.ellipse(640, FLOOR_Y - 76, 70, 30, solid(p.s + 2, "#f3eadb", { strokeWidth: 2 }));
      p.rc.polygon(
        [
          [720, CEIL + 10],
          [560, FLOOR_Y - 60],
          [880, FLOOR_Y - 60],
        ],
        ink(p.s + 3, { fill: "rgba(255,255,255,0.25)", fillStyle: "solid", stroke: "rgba(28,22,24,0.4)", strokeWidth: 2 }),
      );
      label(p.ctx, "zZz", 780, FLOOR_Y - 150, 26, "rgba(28,22,24,0.5)");
      p.rc.ellipse(110, FLOOR_Y - 30, 90, 60, solid(p.s + 4, "#7cc36a"));
    },
    // Savings Pond: lily pads piled with coins, a frog money box
    (p) => {
      p.rc.ellipse(200, FLOOR_Y + 40, 260, 60, solid(p.s, "#4f8fa0"));
      for (let i = 0; i < 3; i++) p.rc.ellipse(130 + i * 70, FLOOR_Y + 34, 70, 24, solid(p.s + 1 + i, "#7cc36a", { strokeWidth: 2 }));
      for (let i = 0; i < 4; i++) p.rc.circle(140 + i * 46, FLOOR_Y + 22 - (i % 2) * 10, 24, solid(p.s + 5 + i, "#f0c35a", { strokeWidth: 2 }));
      p.rc.ellipse(680, FLOOR_Y - 60, 140, 110, solid(p.s + 10, "#7cc36a"));
      p.rc.circle(650, FLOOR_Y - 120, 34, solid(p.s + 11, "#fff", { strokeWidth: 3 }));
      p.rc.circle(710, FLOOR_Y - 120, 34, solid(p.s + 12, "#fff", { strokeWidth: 3 }));
      p.rc.rectangle(660, FLOOR_Y - 76, 40, 8, solid(p.s + 13, INK, { strokeWidth: 1 }));
      label(p.ctx, "SAVINGS", 680, FLOOR_Y - 180, 18, "#2d4f3a");
      frameArt(p, 120, 150, 140, 120, "#efdda8");
      coinDoodle(p.ctx, p.rc, p.s + 20, 190, 210);
    },
  ],
};

// --- RayJ's Studio: the artist's loft where Chog was sketched (and glitched) into being.
const rayj: Decor = {
  fg: (_ctx, rc, s) => {
    // a lumpy plaster sculpture of Chog on a plinth
    rc.rectangle(60, 200, 100, 100, solid(s, "#fffaf0"));
    rc.ellipse(110, 150, 110, 100, solid(s + 1, "#e8e2f2"));
    rc.ellipse(110, 80, 80, 70, solid(s + 2, "#e8e2f2"));
    rc.polygon([[80, 60], [92, 20], [104, 54]], solid(s + 3, "#e8e2f2", { strokeWidth: 2 }));
    rc.polygon([[116, 54], [128, 20], [140, 60]], solid(s + 4, "#e8e2f2", { strokeWidth: 2 }));
  },
  walls: ["#f4efe8", "#efe8f4", "#f6ece4", "#ece6f6", "#f2eef0", "#e8e2f2"],
  wall: "splatter",
  floor: "concrete",
  ceiling: "#2a2148",
  sky: "dusk",
  frame: "#2a2124",
  curtain: null,
  rooms: [
    // Gallery: framed Chog sketches behind a velvet rope
    (p) => {
      const x = 260;
      frameArt(p, x, 150, 150, 150, "#fffaf0", "#2a2124");
      p.rc.circle(x + 75, 220, 80, ink(p.s + 1, { stroke: "#e0528a", strokeWidth: 3 }));
      p.rc.line(x + 45, 210, x + 60, 205, ink(p.s + 2, { strokeWidth: 3 }));
      p.rc.line(x + 90, 205, x + 105, 210, ink(p.s + 3, { strokeWidth: 3 }));
      p.rc.arc(x + 75, 236, 30, 16, 0, Math.PI, false, ink(p.s + 4, { strokeWidth: 3 }));
      label(p.ctx, "CHOG, v0.1", 335, 330, 16, INK, "'Patrick Hand'");
      for (const x of [150, 380]) {
        p.rc.rectangle(x - 6, FLOOR_Y - 100, 12, 100, solid(p.s + x, "#c79a4a"));
        p.rc.circle(x, FLOOR_Y - 106, 20, solid(p.s + x + 1, "#f0c35a", { strokeWidth: 2 }));
      }
      p.rc.curve(
        [
          [150, FLOOR_Y - 90],
          [265, FLOOR_Y - 50],
          [380, FLOOR_Y - 90],
        ],
        ink(p.s + 9, { stroke: "#b8323a", strokeWidth: 8 }),
      );
      p.rc.rectangle(834, FLOOR_Y - 190, 68, 120, solid(p.s + 10, "#fffaf0"));
      p.rc.line(868, FLOOR_Y - 70, 868, FLOOR_Y, ink(p.s + 11, { strokeWidth: 5 }));
      label(p.ctx, "MONALD", 868, FLOOR_Y - 150, 14);
      label(p.ctx, "not", 868, FLOOR_Y - 124, 15, "#5a4d50", "'Patrick Hand'");
      label(p.ctx, "RayJ", 868, FLOOR_Y - 104, 15, "#5a4d50", "'Patrick Hand'");
    },
    // Sketch Room: an easel with a half-drawn Chog, paper balls everywhere
    (p) => {
      p.rc.line(180, FLOOR_Y, 240, FLOOR_Y - 330, ink(p.s, { strokeWidth: 6, stroke: "#8a5a3c" }));
      p.rc.line(300, FLOOR_Y, 240, FLOOR_Y - 330, ink(p.s + 1, { strokeWidth: 6, stroke: "#8a5a3c" }));
      p.rc.rectangle(150, FLOOR_Y - 300, 180, 200, solid(p.s + 2, "#fffaf0"));
      p.rc.arc(240, FLOOR_Y - 190, 120, 120, Math.PI, Math.PI * 2.5, false, ink(p.s + 3, { strokeWidth: 3 }));
      p.rc.line(200, FLOOR_Y - 250, 218, FLOOR_Y - 280, ink(p.s + 4, { strokeWidth: 3 }));
      p.rc.line(262, FLOOR_Y - 280, 280, FLOOR_Y - 250, ink(p.s + 5, { strokeWidth: 3 }));
      for (let i = 0; i < 9; i++) p.rc.circle(80 + ((i * 97) % 300) + (i > 4 ? 520 : 0), FLOOR_Y + 30 + (i % 3) * 22, 26, solid(p.s + 10 + i, "#fffaf0", { strokeWidth: 2 }));
      p.rc.rectangle(640, FLOOR_Y - 140, 240, 18, solid(p.s + 20, "#8a5a3c"));
      p.rc.rectangle(660, FLOOR_Y - 122, 16, 122, solid(p.s + 21, "#6e462e"));
      p.rc.rectangle(844, FLOOR_Y - 122, 16, 122, solid(p.s + 22, "#6e462e"));
      p.rc.rectangle(700, FLOOR_Y - 190, 44, 50, solid(p.s + 23, "#6f8fb3"));
      for (let i = 0; i < 4; i++) p.rc.line(712 + i * 8, FLOOR_Y - 190, 706 + i * 12, FLOOR_Y - 240, ink(p.s + 24 + i, { stroke: ["#e0528a", "#f0c35a", "#7ec4a8", INK][i]!, strokeWidth: 4 }));
    },
    // Snack Bar: espresso machine, a tower of pizza boxes, a fridge of energy drinks
    (p) => {
      p.rc.rectangle(560, FLOOR_Y - 130, 230, 130, solid(p.s, "#3b3033"));
      p.rc.rectangle(550, FLOOR_Y - 146, 250, 18, solid(p.s + 1, "#c79a4a"));
      p.rc.rectangle(600, FLOOR_Y - 250, 90, 104, solid(p.s + 2, "#9aa6b2"));
      p.rc.circle(645, FLOOR_Y - 220, 26, solid(p.s + 3, "#2a2124", { strokeWidth: 2 }));
      p.rc.rectangle(720, FLOOR_Y - 176, 30, 30, solid(p.s + 4, "#fffaf0", { strokeWidth: 2 }));
      for (let i = 0; i < 6; i++) p.rc.rectangle(820, FLOOR_Y - 20 - i * 20, 110, 20, solid(p.s + 5 + i, "#e8c890", { strokeWidth: 2.5 }));
      label(p.ctx, "PIZZA", 875, FLOOR_Y - 128, 16, "#b8323a");
      label(p.ctx, "deadline fuel", 675, FLOOR_Y - 270, 18, INK, "'Patrick Hand'");
    },
    // Glitch Lab: CRT monitors that never stop glitching, cables everywhere
    (p) => {
      for (let i = 0; i < 2; i++) {
        const x = 60 + i * 90, y = FLOOR_Y - 120 - i * 110;
        p.rc.rectangle(x, y, 120, 100, solid(p.s + i, "#d9cbb3"));
        p.rc.rectangle(x + 10, y + 10, 100, 70, solid(p.s + 5 + i, "#1d1438", { strokeWidth: 2 }));
        for (let k = 0; k < 4; k++) {
          p.ctx.fillStyle = ["#ff3bd0", "#3bfff0", "#f0c35a", "#7e5ce0"][k]!;
          p.ctx.fillRect(x + 12 + k * 6, y + 20 + k * 14, 70 - k * 10, 6);
        }
      }
      p.rc.rectangle(670, FLOOR_Y - 100, 230, 100, solid(p.s + 10, "#3b3033"));
      for (let i = 0; i < 4; i++) {
        p.ctx.fillStyle = i % 2 ? "#3bfff0" : "#ff3bd0";
        p.ctx.fillRect(686 + i * 54, FLOOR_Y - 80, 30, 10);
      }
      // cables snake up the wall beside the window
      for (let i = 0; i < 3; i++) p.rc.curve(
        [
          [860 - i * 20, FLOOR_Y - 100],
          [880 + i * 6, FLOOR_Y - 220],
          [870 + i * 8, CEIL + 120],
          [884 + i * 8, CEIL],
        ],
        ink(p.s + 20 + i, { stroke: ["#e0528a", "#4fc3e0", "#f0c35a"][i]!, strokeWidth: 4 }),
      );
      label(p.ctx, "ERROR: TOO CUTE", 780, FLOOR_Y - 130, 20, "#ff3bd0");
    },
    // Ink Room: a giant ink spill, bottles, sketches drying on a line
    (p) => {
      p.rc.line(520, 170, 900, 170, ink(p.s, { strokeWidth: 2.5 }));
      for (let i = 0; i < 4; i++) {
        p.rc.rectangle(540 + i * 90, 176, 70, 90, solid(p.s + 1 + i, "#fffaf0", { strokeWidth: 2 }));
        p.rc.circle(575 + i * 90, 220, 36, ink(p.s + 6 + i, { strokeWidth: 2 }));
      }
      p.ctx.fillStyle = "#1c1618";
      p.ctx.beginPath();
      p.ctx.ellipse(680, FLOOR_Y + 50, 180, 34, 0, 0, Math.PI * 2);
      p.ctx.fill();
      for (let i = 0; i < 5; i++) {
        p.ctx.beginPath();
        p.ctx.arc(500 + i * 90, FLOOR_Y + 70 - (i % 2) * 30, 10, 0, Math.PI * 2);
        p.ctx.fill();
      }
      for (let i = 0; i < 3; i++) {
        const x = 90 + i * 48;
        p.rc.rectangle(x, FLOOR_Y - 70, 36, 70, solid(p.s + 20 + i, "#2a2124"));
        p.rc.rectangle(x + 10, FLOOR_Y - 92, 16, 22, solid(p.s + 30 + i, "#c79a4a", { strokeWidth: 2 }));
      }
      p.rc.polygon(
        [
          [820, FLOOR_Y],
          [850, FLOOR_Y - 60],
          [880, FLOOR_Y],
        ],
        solid(p.s + 40, "#2a2124"),
      );
    },
    // Sketch Safe: a spotlit pedestal for the original sketch
    (p) => {
      glow(p.ctx, 200, 200, 260, "255,240,180", 0.4);
      p.rc.polygon(
        [
          [180, CEIL],
          [220, CEIL],
          [320, FLOOR_Y],
          [80, FLOOR_Y],
        ],
        ink(p.s, { fill: "rgba(255,240,180,0.25)", fillStyle: "solid", stroke: "rgba(0,0,0,0)" }),
      );
      p.rc.rectangle(150, FLOOR_Y - 120, 100, 120, solid(p.s + 1, "#fffaf0"));
      p.rc.rectangle(160, FLOOR_Y - 200, 80, 80, ink(p.s + 2, { fill: "rgba(180,220,255,0.5)", fillStyle: "solid", strokeWidth: 3 }));
      p.rc.rectangle(178, FLOOR_Y - 180, 44, 50, solid(p.s + 3, "#fffaf0", { strokeWidth: 2 }));
      label(p.ctx, "DO NOT TOUCH", 200, FLOOR_Y - 220, 16, "#b8323a");
      frameArt(p, 600, 150, 150, 120, "#fffaf0", "#2a2124");
      label(p.ctx, "the very first", 675, 200, 18, INK, "'Patrick Hand'");
      label(p.ctx, "glitch", 675, 232, 26, "#ff3bd0");
    },
  ],
};

// --- Moyaki's Bakery: the bread-like cook's shop. Flour, ovens and buttered floors.
const moyaki: Decor = {
  fg: (_ctx, rc, s) => {
    // a bread rack
    rc.rectangle(40, 60, 140, 240, ink(s, { strokeWidth: 5, stroke: "#8a5a3c" }));
    for (let r = 0; r < 3; r++) {
      rc.line(40, 120 + r * 70, 180, 120 + r * 70, ink(s + 1 + r, { strokeWidth: 4, stroke: "#8a5a3c" }));
      for (let i = 0; i < 2; i++) rc.ellipse(76 + i * 66, 104 + r * 70, 58, 30, solid(s + 5 + r * 2 + i, ["#d9a05a", "#c47a3a", "#e8c070"][r]!, { strokeWidth: 2.5 }));
    }
  },
  walls: ["#f8e6c8", "#f6dcc8", "#f4d4c0", "#f8ecd0", "#f6e0d4", "#f0e2c4"],
  wall: "awning",
  floor: "checker",
  ceiling: "#6b3a2a",
  sky: "city",
  frame: "#f3eadb",
  curtain: "#e0528a",
  rooms: [
    // Shopfront: display counter full of bread and a chalkboard menu
    (p) => {
      p.rc.rectangle(140, FLOOR_Y - 150, 280, 150, solid(p.s, "#f3eadb"));
      p.rc.rectangle(150, FLOOR_Y - 140, 260, 70, ink(p.s + 1, { fill: "rgba(180,220,255,0.5)", fillStyle: "solid", strokeWidth: 3 }));
      for (let i = 0; i < 4; i++) p.rc.ellipse(185 + i * 62, FLOOR_Y - 92, 54, 30, solid(p.s + 2 + i, ["#d9a05a", "#c47a3a", "#e8c070", "#b8653a"][i]!, { strokeWidth: 2.5 }));
      p.rc.rectangle(270, 150, 150, 130, solid(p.s + 10, "#2a3a30"));
      label(p.ctx, "TODAY", 345, 186, 20, "#f3eadb");
      label(p.ctx, "buttered floors", 345, 220, 20, "#f3eadb", "'Patrick Hand'");
      label(p.ctx, "mind your step", 345, 250, 18, "#f0c35a", "'Patrick Hand'");
    },
    // Flour Store: sacks stacked to the ceiling, a dusting of flour
    (p) => {
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 3 - row; i++) {
          const x = 80 + i * 92 + row * 46, y = FLOOR_Y - 80 - row * 76;
          p.rc.ellipse(x + 44, y + 40, 90, 80, solid(p.s + row * 5 + i, "#efe6d2"));
          label(p.ctx, "FLOUR", x + 44, y + 48, 14, "#8a7d70");
        }
      }
      p.ctx.fillStyle = "rgba(255,255,255,0.55)";
      p.ctx.beginPath();
      p.ctx.ellipse(250, FLOOR_Y + 40, 220, 26, 0, 0, Math.PI * 2);
      p.ctx.fill();
      p.rc.rectangle(620, FLOOR_Y - 60, 260, 60, solid(p.s + 20, "#b8916a"));
      for (let i = 0; i < 4; i++) p.rc.circle(660 + i * 60, FLOOR_Y - 84, 46, solid(p.s + 21 + i, "#f0d9a0", { strokeWidth: 2.5 }));
      label(p.ctx, "EGGS", 750, FLOOR_Y - 20, 18, INK);
    },
    // Ovens: a brick oven glowing behind the counter, a bread peel
    (p) => {
      p.rc.rectangle(580, FLOOR_Y - 300, 260, 300, solid(p.s, "#b8653a"));
      for (let y = FLOOR_Y - 280; y < FLOOR_Y; y += 30) p.rc.line(580, y, 840, y, thin(p.s + y, "rgba(0,0,0,0.3)"));
      p.rc.arc(710, FLOOR_Y - 120, 170, 170, Math.PI, Math.PI * 2, false, solid(p.s + 1, "#2a1410"));
      p.ctx.fillStyle = "#2a1410";
      p.ctx.fillRect(625, FLOOR_Y - 120, 170, 40);
      glow(p.ctx, 710, FLOOR_Y - 120, 150, "255,140,60", 0.5);
      p.rc.line(860, FLOOR_Y, 900, FLOOR_Y - 320, ink(p.s + 2, { strokeWidth: 6, stroke: "#8a5a3c" }));
      p.rc.ellipse(902, FLOOR_Y - 336, 50, 40, solid(p.s + 3, "#c79a4a"));
      label(p.ctx, "HOT!", 710, FLOOR_Y - 230, 24, "#f3eadb");
    },
    // Pantry: jars of jam and butter, a cheese wheel
    (p) => {
      shelfBoard(p, 40, 210, 200);
      shelfBoard(p, 40, 340, 200);
      for (let i = 0; i < 4; i++) jar(p, 70 + i * 46, 210, 34, 50, ["#c0392b", "#e0528a", "#f0c35a", "#7e5ce0"][i]!, "#f3eadb");
      for (let i = 0; i < 3; i++) jar(p, 80 + i * 60, 340, 44, 60, "#f6e3a8", "#c79a4a");
      label(p.ctx, "BUTTER (lots)", 140, 400, 18, INK, "'Patrick Hand'");
      p.rc.circle(760, FLOOR_Y - 60, 120, solid(p.s + 9, "#f0c35a"));
      p.rc.circle(740, FLOOR_Y - 70, 14, solid(p.s + 10, "#e0b040", { strokeWidth: 1.5 }));
      p.rc.circle(780, FLOOR_Y - 40, 10, solid(p.s + 11, "#e0b040", { strokeWidth: 1.5 }));
      crate(p, 836, 70, 70);
      p.rc.rectangle(260, FLOOR_Y - 70, 120, 70, solid(p.s + 12, "#c96a5a"));
      label(p.ctx, "JAM", 320, FLOOR_Y - 26, 20, "#f3eadb");
    },
    // Proving Room: bowls of dough rising, proofing baskets on racks
    (p) => {
      p.rc.rectangle(560, FLOOR_Y - 300, 320, 300, ink(p.s, { strokeWidth: 4 }));
      for (let r = 0; r < 3; r++) {
        p.rc.line(560, FLOOR_Y - 90 - r * 90, 880, FLOOR_Y - 90 - r * 90, ink(p.s + 1 + r, { strokeWidth: 4 }));
        for (let i = 0; i < 3; i++) {
          const x = 610 + i * 100, y = FLOOR_Y - 90 - r * 90;
          p.rc.arc(x, y, 80, 50, 0, Math.PI, true, solid(p.s + 5 + r * 3 + i, "#f3e2c0", { strokeWidth: 2.5 }));
          p.rc.rectangle(x - 40, y, 80, 6, solid(p.s + 15 + r * 3 + i, "#c79a4a", { strokeWidth: 1.5 }));
        }
      }
      p.rc.ellipse(120, FLOOR_Y - 40, 120, 80, solid(p.s + 30, "#f3e2c0"));
      label(p.ctx, "shh, it's rising", 120, FLOOR_Y - 110, 18, "#5a4d50", "'Patrick Hand'");
    },
    // Recipe Safe: Venty's recipe under a glass dome, rolling pins crossed on the wall
    (p) => {
      p.rc.rectangle(160, FLOOR_Y - 110, 120, 110, solid(p.s, "#f3eadb"));
      p.rc.arc(220, FLOOR_Y - 110, 110, 140, Math.PI, Math.PI * 2, false, ink(p.s + 1, { fill: "rgba(180,220,255,0.45)", fillStyle: "solid", strokeWidth: 3 }));
      p.rc.rectangle(195, FLOOR_Y - 160, 50, 46, solid(p.s + 2, "#f6e3a8", { strokeWidth: 2 }));
      glow(p.ctx, 220, FLOOR_Y - 140, 120, "255,230,140", 0.45);
      p.rc.line(600, 170, 760, 290, ink(p.s + 3, { strokeWidth: 14, stroke: "#c79a4a" }));
      p.rc.line(760, 170, 600, 290, ink(p.s + 4, { strokeWidth: 14, stroke: "#c79a4a" }));
      label(p.ctx, "VENTY'S SECRET", 680, 330, 20, "#b8323a");
    },
  ],
};

// --- Mouch's Prank Nest: a treehouse full of tricks, leaves and webs.
const mouch: Decor = {
  walls: ["#d8c094", "#cfb88a", "#d4bc8c", "#c9b184", "#d8c496", "#c4ac80"],
  wall: "bark",
  floor: "branches",
  ceiling: "#2f4a2a",
  sky: "jungle",
  frame: "#6b4a2a",
  curtain: "#6fa65a",
  rooms: [
    // Leaf Pile: a huge pile of leaves (what's in it?), a warning sign
    (p) => {
      for (let i = 0; i < 26; i++) {
        const x = 150 + ((i * 53) % 260), y = FLOOR_Y - ((i * 37) % 110);
        p.rc.ellipse(x, y, 54, 30, solid(p.s + i, ["#6fa65a", "#8fbf6a", "#c9a44a", "#5e8f4e"][i % 4]!, { strokeWidth: 2 }));
      }
      p.rc.rectangle(270, 150, 150, 90, solid(p.s + 40, "#c9a46a"));
      label(p.ctx, "BEWARE", 345, 190, 22, "#b8323a");
      label(p.ctx, "of MOUCH", 345, 222, 20, INK, "'Patrick Hand'");
      p.rc.line(345, 240, 345, 290, ink(p.s + 41, { strokeWidth: 5, stroke: "#6b4a2a" }));
    },
    // Spider Larder: jars of spiders and webs in the corners
    (p) => {
      for (let i = 0; i < 6; i++) p.rc.line(70, CEIL + i * 26, 70 + i * 30, CEIL, thin(p.s + i, "rgba(255,255,255,0.7)", 1.5));
      shelfBoard(p, 90, 260, 260, "#6b4a2a");
      shelfBoard(p, 90, 400, 260, "#6b4a2a");
      for (let i = 0; i < 5; i++) {
        jar(p, 120 + i * 50, 260, 38, 54, "rgba(220,230,200,0.7)", "#6b4a2a");
        p.rc.circle(120 + i * 50, 236, 12, solid(p.s + 30 + i, INK, { strokeWidth: 1 }));
      }
      for (let i = 0; i < 4; i++) jar(p, 125 + i * 66, 400, 50, 64, "rgba(240,220,160,0.7)", "#6b4a2a");
      label(p.ctx, "SNACKS", 220, 460, 20, INK);
      for (let i = 0; i < 6; i++) p.rc.line(900, CEIL + i * 26, 900 - i * 30, CEIL, thin(p.s + 50 + i, "rgba(255,255,255,0.7)", 1.5));
      p.rc.ellipse(720, FLOOR_Y - 26, 160, 52, solid(p.s + 60, "#c9a44a"));
    },
    // Launch Pad: a giant slingshot aimed at a target
    (p) => {
      p.rc.line(640, FLOOR_Y, 660, FLOOR_Y - 180, ink(p.s, { strokeWidth: 12, stroke: "#6b4a2a" }));
      p.rc.line(660, FLOOR_Y - 180, 620, FLOOR_Y - 260, ink(p.s + 1, { strokeWidth: 10, stroke: "#6b4a2a" }));
      p.rc.line(660, FLOOR_Y - 180, 700, FLOOR_Y - 260, ink(p.s + 2, { strokeWidth: 10, stroke: "#6b4a2a" }));
      p.rc.curve(
        [
          [620, FLOOR_Y - 260],
          [600, FLOOR_Y - 200],
          [700, FLOOR_Y - 260],
        ],
        ink(p.s + 3, { stroke: "#e0528a", strokeWidth: 5 }),
      );
      for (let i = 0; i < 4; i++) p.rc.circle(856, 380, 120 - i * 28, solid(p.s + 4 + i, i % 2 ? "#f3eadb" : "#c0392b", { strokeWidth: 3 }));
      label(p.ctx, "LAUNCH", 620, FLOOR_Y - 20, 20, "#f3eadb");
    },
    // Web Loft: a giant web and a leaf hammock
    (p) => {
      const cx = 110, cy = 180;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.rc.line(cx, cy, cx + Math.cos(a) * 90, cy + Math.sin(a) * 90, thin(p.s + i, "rgba(255,255,255,0.8)", 2));
      }
      for (let r = 25; r <= 90; r += 22) p.rc.circle(cx, cy, r * 2, thin(p.s + r, "rgba(255,255,255,0.7)", 1.5));
      p.rc.curve(
        [
          [170, 330],
          [220, 420],
          [330, 430],
          [390, 330],
        ],
        solid(p.s + 30, "#6fa65a", { strokeWidth: 4 }),
      );
      p.rc.line(170, 330, 170, CEIL, ink(p.s + 31, { strokeWidth: 3 }));
      p.rc.line(390, 330, 390, CEIL, ink(p.s + 32, { strokeWidth: 3 }));
      label(p.ctx, "nap spot", 280, 470, 18, "#5a4d50", "'Patrick Hand'");
      for (let i = 0; i < 3; i++) {
        p.rc.rectangle(700 + i * 70, FLOOR_Y - 60 - (i === 1 ? 50 : 0), 60, 60, solid(p.s + 40 + i, ["#e0528a", "#f0c35a", "#7e5ce0"][i]!));
        label(p.ctx, "?", 730 + i * 70, FLOOR_Y - 20 - (i === 1 ? 50 : 0), 28, "#f3eadb");
      }
    },
    // Tail-Wing Shop: leaf wings on hooks with price tags
    (p) => {
      p.rc.line(560, 180, 900, 180, ink(p.s, { strokeWidth: 6, stroke: "#6b4a2a" }));
      for (let i = 0; i < 4; i++) {
        const x = 600 + i * 84;
        p.rc.line(x, 180, x, 210, ink(p.s + 1 + i, { strokeWidth: 3 }));
        p.rc.ellipse(x - 18, 260, 36, 90, solid(p.s + 10 + i, i % 2 ? "#8fbf6a" : "#6fa65a", { strokeWidth: 2.5 }));
        p.rc.ellipse(x + 18, 260, 36, 90, solid(p.s + 20 + i, i % 2 ? "#8fbf6a" : "#6fa65a", { strokeWidth: 2.5 }));
        p.rc.rectangle(x - 18, 314, 36, 22, solid(p.s + 30 + i, "#f3eadb", { strokeWidth: 2 }));
        label(p.ctx, `${(i + 1) * 5}`, x, 331, 14);
      }
      label(p.ctx, "FLY FASTER", 730, 160, 20, "#5a4d50");
      p.rc.rectangle(60, FLOOR_Y - 120, 150, 120, solid(p.s + 40, "#c9a46a"));
      label(p.ctx, "TRY ON", 135, FLOOR_Y - 60, 18);
    },
    // Prank Vault: the jar of stolen leaves and a rubber chicken on display
    (p) => {
      jar(p, 200, FLOOR_Y, 120, 150, "rgba(200,230,200,0.6)", "#6b4a2a");
      for (let i = 0; i < 6; i++) p.rc.ellipse(170 + (i % 3) * 30, FLOOR_Y - 40 - Math.floor(i / 3) * 40, 40, 22, solid(p.s + i, "#6fa65a", { strokeWidth: 1.5 }));
      label(p.ctx, "PINGPING'S", 200, FLOOR_Y - 180, 16);
      p.rc.line(640, 160, 640, 220, ink(p.s + 20, { strokeWidth: 3 }));
      p.rc.ellipse(640, 270, 50, 100, solid(p.s + 21, "#f0c35a"));
      p.rc.polygon(
        [
          [624, 220],
          [640, 200],
          [656, 220],
        ],
        solid(p.s + 22, "#c0392b", { strokeWidth: 2 }),
      );
      label(p.ctx, "honk", 700, 290, 20, "#5a4d50", "'Patrick Hand'");
    },
  ],
};

// --- Salmonad's River Shrine: the purple prophet's temple on the river.
const salmonad: Decor = {
  fg: (_ctx, rc, s) => {
    // reeds and a stone lantern
    rc.rectangle(70, 170, 70, 130, solid(s, "#8a8fa0"));
    rc.polygon([[50, 170], [160, 170], [105, 120]], solid(s + 1, "#6f7a8c"));
    rc.rectangle(88, 186, 34, 40, solid(s + 2, "#f6d27a", { strokeWidth: 2 }));
    for (let i = 0; i < 5; i++) rc.line(150 + i * 12, 300, 156 + i * 14, 120 + i * 18, ink(s + 10 + i, { stroke: "#3f6b34", strokeWidth: 5 }));
  },
  walls: ["#9fc8c8", "#a8b8d8", "#b0a8d8", "#98c0cc", "#a8a8d4", "#9a8cc8"],
  wall: "waves",
  floor: "wetstone",
  ceiling: "#2a1f5a",
  sky: "river",
  frame: "#6a45b8",
  curtain: "#3fa7b0",
  dim: [0, 0, 0.08, 0, 0.08, 0.2],
  rooms: [
    // Riverbank: the river runs in under the floor, reeds and stepping stones
    (p) => {
      p.ctx.fillStyle = "#4b6fc4";
      p.ctx.fillRect(120, FLOOR_Y + 10, 320, 110);
      for (let i = 0; i < 4; i++) p.rc.line(140 + i * 70, FLOOR_Y + 40 + (i % 2) * 30, 190 + i * 70, FLOOR_Y + 40 + (i % 2) * 30, ink(p.s + i, { stroke: "#a99aff", strokeWidth: 3 }));
      for (let i = 0; i < 3; i++) p.rc.ellipse(170 + i * 110, FLOOR_Y + 30, 70, 22, solid(p.s + 5 + i, "#8a8fa0", { strokeWidth: 2 }));
      for (let x = 860; x < 950; x += 22) p.rc.line(x, FLOOR_Y, x + 6, FLOOR_Y - 140 - (x % 40), ink(p.s + x, { stroke: "#3f6b34", strokeWidth: 4 }));
      p.rc.rectangle(260, 150, 160, 100, solid(p.s + 30, "#e9e2ff"));
      label(p.ctx, "NO FISHING", 340, 210, 22, "#6a45b8");
    },
    // Posting Hall: a board covered in "what about salmonad?" posts
    (p) => {
      p.rc.rectangle(80, 150, 280, 220, solid(p.s, "#b8916a"));
      const posts = ["what about", "salmonad?", "gm", "wen shrine", "🐟"];
      for (let i = 0; i < 5; i++) {
        const x = 96 + (i % 3) * 88, y = 166 + Math.floor(i / 3) * 104;
        p.rc.rectangle(x, y, 80, 86, solid(p.s + 1 + i, i % 2 ? "#fffaf0" : "#e9e2ff", { strokeWidth: 2 }));
        label(p.ctx, posts[i]!, x + 40, y + 48, 16, INK, "'Patrick Hand'");
        p.rc.circle(x + 40, y + 6, 10, solid(p.s + 10 + i, "#e0528a", { strokeWidth: 1.5 }));
      }
      p.rc.rectangle(640, FLOOR_Y - 90, 240, 90, solid(p.s + 20, "#6a45b8"));
      label(p.ctx, "SALMONPOST", 760, FLOOR_Y - 40, 20, "#f3eadb");
      p.rc.rectangle(700, FLOOR_Y - 140, 120, 50, solid(p.s + 21, "#fffaf0"));
    },
    // Altar: a salmon idol between candles
    (p) => {
      p.rc.rectangle(620, FLOOR_Y - 110, 240, 110, solid(p.s, "#6a45b8"));
      p.rc.rectangle(600, FLOOR_Y - 126, 280, 20, solid(p.s + 1, "#4b3a9a"));
      p.rc.ellipse(740, FLOOR_Y - 190, 150, 70, solid(p.s + 2, "#e0528a"));
      p.rc.polygon(
        [
          [810, FLOOR_Y - 190],
          [850, FLOOR_Y - 225],
          [850, FLOOR_Y - 155],
        ],
        solid(p.s + 3, "#e0528a"),
      );
      p.rc.circle(700, FLOOR_Y - 198, 14, solid(p.s + 4, "#fff", { strokeWidth: 2 }));
      glow(p.ctx, 740, FLOOR_Y - 190, 180, "200,140,255", 0.35);
      candle(p, 630, FLOOR_Y - 126);
      candle(p, 850, FLOOR_Y - 126, 50);
    },
    // Shallows: knee-deep water, lily pads, a little bridge rail
    (p) => {
      p.ctx.fillStyle = "rgba(75,111,196,0.55)";
      p.ctx.fillRect(650, FLOOR_Y - 30, 318, 140);
      for (let i = 0; i < 4; i++) p.rc.line(670 + i * 70, FLOOR_Y - 14 + (i % 2) * 18, 710 + i * 70, FLOOR_Y - 14 + (i % 2) * 18, ink(p.s + i, { stroke: "#cfe0ff", strokeWidth: 3 }));
      for (let i = 0; i < 2; i++) p.rc.ellipse(720 + i * 120, FLOOR_Y + 30, 80, 24, solid(p.s + 10 + i, "#7cc36a", { strokeWidth: 2 }));
      for (let x = 70; x < 390; x += 26) p.rc.line(x, FLOOR_Y, x + 8, FLOOR_Y - 90 - (x % 50), ink(p.s + x, { stroke: "#3f6b34", strokeWidth: 4 }));
      p.rc.rectangle(160, 150, 180, 110, solid(p.s + 20, "#e9e2ff"));
      label(p.ctx, "DEPTH: 1 fwog", 250, 212, 20, "#6a45b8", "'Patrick Hand'");
    },
    // Prophet's Den: scrolls and a crystal ball
    (p) => {
      p.rc.rectangle(600, FLOOR_Y - 120, 220, 20, solid(p.s, "#4b3a9a"));
      p.rc.rectangle(620, FLOOR_Y - 100, 18, 100, solid(p.s + 1, "#2a1f5a"));
      p.rc.rectangle(782, FLOOR_Y - 100, 18, 100, solid(p.s + 2, "#2a1f5a"));
      p.rc.circle(710, FLOOR_Y - 170, 90, solid(p.s + 3, "#b8a8ff"));
      glow(p.ctx, 710, FLOOR_Y - 170, 160, "180,160,255", 0.5);
      label(p.ctx, "?", 710, FLOOR_Y - 158, 34, "#2a1f5a");
      for (let i = 0; i < 4; i++) p.rc.ellipse(90 + i * 34, FLOOR_Y - 20 - (i % 2) * 24, 30, 70, solid(p.s + 10 + i, "#e8dcb0", { strokeWidth: 2 }));
    },
    // Shrine: a glowing purple salmon statue
    (p) => {
      p.rc.rectangle(130, FLOOR_Y - 80, 160, 80, solid(p.s, "#4b3a9a"));
      p.rc.ellipse(210, FLOOR_Y - 180, 200, 90, solid(p.s + 1, "#8e6ee8"));
      p.rc.polygon(
        [
          [300, FLOOR_Y - 180],
          [350, FLOOR_Y - 225],
          [350, FLOOR_Y - 135],
        ],
        solid(p.s + 2, "#8e6ee8"),
      );
      glow(p.ctx, 210, FLOOR_Y - 180, 240, "160,120,255", 0.5);
      candle(p, 100, FLOOR_Y);
      candle(p, 320, FLOOR_Y, 56);
      label(p.ctx, "the first salmonpost", 680, 200, 20, "#e9e2ff", "'Patrick Hand'");
    },
  ],
};

// --- Molandak's Time Lab: clocks, gears and a portal to anywhen.
const molandak: Decor = {
  fg: (_ctx, rc, s) => {
    // a tesla coil
    rc.rectangle(80, 220, 60, 80, solid(s, "#5c6670"));
    rc.rectangle(96, 90, 28, 130, solid(s + 1, "#b87333"));
    for (let y = 100; y < 220; y += 14) rc.line(94, y, 126, y, ink(s + y, { strokeWidth: 2 }));
    rc.ellipse(110, 80, 90, 34, solid(s + 2, "#9aa6b2"));
    rc.linearPath([[110, 64], [90, 30], [120, 20], [96, -10]], ink(s + 3, { stroke: "#7fe0ff", strokeWidth: 4 }));
  },
  walls: ["#aab8d8", "#b4bcd8", "#a4b4cc", "#c0b8e0", "#b8c4d0", "#9ca8d0"],
  wall: "rivets",
  floor: "grate",
  ceiling: "#0a1030",
  sky: "vortex",
  frame: "#9aa6b2",
  curtain: null,
  rooms: [
    // Clock Hall: a wall of clocks that all disagree, and a grandfather clock
    (p) => {
      const clocks: [number, number, number][] = [
        [320, 180, 56],
        [410, 250, 40],
        [300, 300, 38],
        [420, 140, 30],
      ];
      clocks.forEach(([x, y, r], i) => {
        p.rc.circle(x, y, r * 2, solid(p.s + i, "#f3eadb"));
        const a = i * 1.3;
        p.rc.line(x, y, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, ink(p.s + 10 + i, { strokeWidth: 3 }));
        p.rc.line(x, y, x + Math.cos(a * 3) * r * 0.8, y + Math.sin(a * 3) * r * 0.8, ink(p.s + 20 + i, { strokeWidth: 2 }));
      });
      p.rc.rectangle(150, FLOOR_Y - 300, 90, 300, solid(p.s + 30, "#6e4e34"));
      p.rc.circle(195, FLOOR_Y - 250, 60, solid(p.s + 31, "#f3eadb"));
      p.rc.line(195, FLOOR_Y - 190, 195, FLOOR_Y - 90, ink(p.s + 32, { strokeWidth: 3 }));
      p.rc.circle(195, FLOOR_Y - 84, 26, solid(p.s + 33, "#f0c35a", { strokeWidth: 2 }));
      label(p.ctx, "IT IS: LATER", 330, 380, 18, "#cfe0ff");
    },
    // Paradox Archive: drawers labelled YESTERDAY and TOMORROW, an hourglass
    (p) => {
      for (let i = 0; i < 2; i++) {
        const x = 90 + i * 140;
        p.rc.rectangle(x, FLOOR_Y - 300, 120, 300, solid(p.s + i, "#5c6670"));
        for (let d = 0; d < 4; d++) {
          p.rc.rectangle(x + 10, FLOOR_Y - 290 + d * 72, 100, 60, solid(p.s + 10 + i * 4 + d, "#9aa6b2", { strokeWidth: 2 }));
          label(p.ctx, i ? "TMRW" : "YDAY", x + 60, FLOOR_Y - 254 + d * 72, 14);
        }
      }
      p.rc.polygon(
        [
          [700, FLOOR_Y - 220],
          [780, FLOOR_Y - 220],
          [740, FLOOR_Y - 120],
        ],
        solid(p.s + 30, "rgba(200,230,255,0.7)"),
      );
      p.rc.polygon(
        [
          [740, FLOOR_Y - 120],
          [700, FLOOR_Y - 20],
          [780, FLOOR_Y - 20],
        ],
        solid(p.s + 31, "rgba(200,230,255,0.7)"),
      );
      p.ctx.fillStyle = "#f0c35a";
      p.ctx.beginPath();
      p.ctx.moveTo(712, FLOOR_Y - 20);
      p.ctx.lineTo(740, FLOOR_Y - 60);
      p.ctx.lineTo(768, FLOOR_Y - 20);
      p.ctx.fill();
      p.rc.rectangle(690, FLOOR_Y - 236, 100, 16, solid(p.s + 32, "#6e4e34"));
      p.rc.rectangle(690, FLOOR_Y - 20, 100, 16, solid(p.s + 33, "#6e4e34"));
    },
    // Engine Room: the time engine, pipes and gauges
    (p) => {
      p.rc.rectangle(580, FLOOR_Y - 280, 300, 280, solid(p.s, "#5c6670"));
      p.rc.circle(730, FLOOR_Y - 170, 160, solid(p.s + 1, "#2a3a6a"));
      glow(p.ctx, 730, FLOOR_Y - 170, 140, "120,170,255", 0.6);
      for (let i = 0; i < 3; i++) {
        p.rc.circle(610 + i * 110, FLOOR_Y - 250, 40, solid(p.s + 2 + i, "#f3eadb", { strokeWidth: 2.5 }));
        p.rc.line(610 + i * 110, FLOOR_Y - 250, 620 + i * 110, FLOOR_Y - 262, ink(p.s + 6 + i, { strokeWidth: 2, stroke: "#c0392b" }));
      }
      for (let i = 0; i < 3; i++) p.rc.line(600 + i * 120, FLOOR_Y - 280, 600 + i * 120, CEIL, ink(p.s + 10 + i, { stroke: "#9aa6b2", strokeWidth: 12, roughness: 0.6 }));
      label(p.ctx, "DO NOT SET TO 1999", 730, FLOOR_Y - 30, 16, "#f0c35a");
    },
    // Future Wing: hologram screens and a hoverboard
    (p) => {
      // a hologram screen between the stairwell and the window
      p.ctx.fillStyle = "rgba(120,220,255,0.25)";
      p.ctx.fillRect(480, 160, 140, 110);
      p.rc.rectangle(480, 160, 140, 110, ink(p.s, { stroke: "#7fe0ff", strokeWidth: 3 }));
      for (let k = 0; k < 4; k++) p.rc.line(494, 184 + k * 22, 600 - k * 14, 184 + k * 22, ink(p.s + 5 + k, { stroke: "#7fe0ff", strokeWidth: 2 }));
      p.rc.ellipse(810, FLOOR_Y - 60, 200, 30, solid(p.s + 10, "#e0528a"));
      glow(p.ctx, 810, FLOOR_Y - 20, 140, "120,220,255", 0.6);
      p.rc.rectangle(80, FLOOR_Y - 140, 120, 140, solid(p.s + 11, "#9aa6b2"));
      label(p.ctx, "ROBO-BUTLER", 140, FLOOR_Y - 60, 14);
      p.rc.circle(140, FLOOR_Y - 170, 60, solid(p.s + 12, "#9aa6b2"));
      p.rc.rectangle(116, FLOOR_Y - 178, 48, 10, solid(p.s + 13, "#7fe0ff", { strokeWidth: 1.5 }));
      label(p.ctx, "$CHOG: 1,000,000", 140, 210, 20, "#7fe0ff");
      label(p.ctx, "(probably)", 140, 240, 18, "#cfe0ff", "'Patrick Hand'");
    },
    // Past Wing: a dino skull, a gramophone, a sundial
    (p) => {
      p.rc.ellipse(700, FLOOR_Y - 60, 180, 100, solid(p.s, "#efe6d2"));
      p.rc.circle(660, FLOOR_Y - 76, 26, solid(p.s + 1, INK, { strokeWidth: 1 }));
      for (let i = 0; i < 5; i++) p.rc.line(720 + i * 14, FLOOR_Y - 30, 722 + i * 14, FLOOR_Y - 10, ink(p.s + 2 + i, { strokeWidth: 3 }));
      p.rc.rectangle(60, FLOOR_Y - 90, 100, 90, solid(p.s + 10, "#6e4e34"));
      p.rc.polygon(
        [
          [110, FLOOR_Y - 90],
          [80, FLOOR_Y - 220],
          [200, FLOOR_Y - 190],
        ],
        solid(p.s + 11, "#c79a4a"),
      );
      label(p.ctx, "♪", 220, FLOOR_Y - 230, 34, INK);
      label(p.ctx, "BEFORE CHOG", 700, 200, 22, "#cfe0ff");
    },
    // Time Vault: a portal on the wall (it spins), stopped clocks
    (p) => {
      for (let i = 0; i < 5; i++) p.rc.circle(190, 260, 220 - i * 40, ink(p.s + i, { stroke: i % 2 ? "#5b7cff" : "#a07cff", strokeWidth: 5 }));
      glow(p.ctx, 190, 260, 200, "160,124,255", 0.55);
      label(p.ctx, "NOW", 190, 270, 24, "#f3eadb");
      p.rc.rectangle(620, FLOOR_Y - 100, 140, 100, solid(p.s + 10, "#5c6670"));
      label(p.ctx, "PARADOX", 690, FLOOR_Y - 46, 18, "#f0c35a");
    },
  ],
};

// --- Mongrod's Citadel: the cyber-tyrant's fortress wrapped round the Elder Tree's roots.
const mongrod: Decor = {
  fg: (ctx, rc, s) => {
    // an iron brazier with fire
    glow(ctx, 110, 110, 110, "255,120,40", 0.5);
    rc.polygon([[50, 140], [170, 140], [140, 200], [80, 200]], solid(s, "#3b3033"));
    rc.line(90, 200, 70, 300, ink(s + 1, { strokeWidth: 8 }));
    rc.line(130, 200, 150, 300, ink(s + 2, { strokeWidth: 8 }));
    rc.polygon([[60, 140], [80, 80], [100, 120], [112, 50], [128, 110], [146, 70], [160, 140]], solid(s + 3, "#ff7a2a", { strokeWidth: 2 }));
  },
  walls: ["#7a4038", "#6a3a36", "#7c4234", "#5e3430", "#6c3836", "#4e2a2a"],
  wall: "bricks",
  floor: "ironplates",
  ceiling: "#1a0a0a",
  sky: "inferno",
  frame: "#2a1414",
  curtain: "#b8323a",
  dim: [0.12, 0.12, 0.1, 0.14, 0.12, 0.18],
  rooms: [
    // Gate: a portcullis on the wall and wall torches
    (p) => {
      p.rc.rectangle(250, 140, 180, 220, ink(p.s, { fill: "#1a0a0a", fillStyle: "solid", strokeWidth: 4 }));
      for (let x = 262; x < 430; x += 28) p.rc.line(x, 140, x, 360, ink(p.s + x, { stroke: "#5c6670", strokeWidth: 6 }));
      for (let y = 170; y < 360; y += 50) p.rc.line(250, y, 430, y, ink(p.s + y, { stroke: "#5c6670", strokeWidth: 5 }));
      for (const x of [200, 900]) {
        p.rc.rectangle(x - 8, 220, 16, 70, solid(p.s + x, "#3b3033"));
        p.rc.ellipse(x, 204, 30, 44, solid(p.s + x + 1, "#ff7a2a", { strokeWidth: 2 }));
        glow(p.ctx, x, 204, 140, "255,120,40", 0.45);
      }
      label(p.ctx, "KEEP OUT. -M", 340, 400, 20, "#ff7a2a");
    },
    // Barracks: bunk beds and an armour stand
    (p) => {
      p.rc.rectangle(80, FLOOR_Y - 260, 260, 260, ink(p.s, { strokeWidth: 5, stroke: "#5c6670" }));
      for (const y of [FLOOR_Y - 60, FLOOR_Y - 190]) {
        p.rc.rectangle(84, y - 24, 252, 40, solid(p.s + y, "#5a1414"));
        p.rc.ellipse(120, y - 30, 60, 24, solid(p.s + y + 1, "#d9cbb3", { strokeWidth: 2 }));
      }
      p.rc.line(720, FLOOR_Y, 720, FLOOR_Y - 220, ink(p.s + 10, { strokeWidth: 6 }));
      p.rc.rectangle(670, FLOOR_Y - 220, 100, 110, solid(p.s + 11, "#9aa6b2"));
      p.rc.circle(720, FLOOR_Y - 250, 60, solid(p.s + 12, "#9aa6b2"));
      p.rc.rectangle(696, FLOOR_Y - 258, 48, 10, solid(p.s + 13, "#ff3b2a", { strokeWidth: 1.5 }));
      label(p.ctx, "LIGHTS OUT 9PM", 760, 200, 22, "#f3eadb");
    },
    // Forge: anvil, a glowing trough of molten metal, bellows
    (p) => {
      p.ctx.fillStyle = "#ff7a2a";
      p.ctx.fillRect(560, FLOOR_Y - 40, 260, 40);
      glow(p.ctx, 690, FLOOR_Y - 20, 260, "255,120,40", 0.55);
      p.rc.rectangle(560, FLOOR_Y - 40, 260, 40, ink(p.s, { strokeWidth: 5 }));
      p.rc.polygon(
        [
          [840, FLOOR_Y - 90],
          [940, FLOOR_Y - 90],
          [920, FLOOR_Y - 60],
          [905, FLOOR_Y],
          [875, FLOOR_Y],
          [860, FLOOR_Y - 60],
        ],
        solid(p.s + 1, "#3b3033"),
      );
      p.rc.ellipse(640, 220, 160, 90, solid(p.s + 2, "#6e4e34"));
      p.rc.line(720, 220, 780, 260, ink(p.s + 3, { strokeWidth: 8 }));
      label(p.ctx, "TREE-CUTTERS", 690, FLOOR_Y - 120, 22, "#ffb04a");
    },
    // Elder Roots: roots of the Elder Tree breaking through the walls, glowing
    (p) => {
      for (let i = 0; i < 5; i++) {
        p.rc.curve(
          [
            [660 + i * 60, CEIL],
            [700 + i * 50, 260],
            [650 + i * 64, 420],
            [680 + i * 60, FLOOR_Y],
          ],
          ink(p.s + i, { stroke: "#5a3a26", strokeWidth: 22, roughness: 1.4 }),
        );
      }
      glow(p.ctx, 790, 360, 240, "120,255,140", 0.3);
      for (let i = 0; i < 8; i++) {
        p.ctx.fillStyle = "#9cf05a";
        p.ctx.fillRect(660 + ((i * 53) % 260), 200 + ((i * 71) % 300), 6, 6);
      }
      p.rc.rectangle(260, FLOOR_Y - 90, 130, 90, solid(p.s + 30, "#3b3033"));
      p.rc.line(270, FLOOR_Y - 90, 330, FLOOR_Y - 200, ink(p.s + 31, { strokeWidth: 6, stroke: "#9aa6b2" }));
      p.rc.polygon(
        [
          [318, FLOOR_Y - 214],
          [350, FLOOR_Y - 196],
          [330, FLOOR_Y - 180],
        ],
        solid(p.s + 32, "#9aa6b2", { strokeWidth: 2 }),
      );
      p.rc.rectangle(60, 160, 160, 110, solid(p.s + 20, "#d9cbb3"));
      label(p.ctx, "DIG HERE", 140, 210, 22, "#b8323a");
      label(p.ctx, "-Mongrod", 140, 240, 16, INK, "'Patrick Hand'");
    },
    // Throne Room: red carpet, banners and a huge spiked throne
    (p) => {
      p.ctx.fillStyle = "#b8323a";
      p.ctx.fillRect(540, FLOOR_Y, 300, 130);
      banner(p, 570, 120, 90, 220, "#b8323a", () => p.rc.circle(615, 200, 50, solid(p.s + 5, "#1a0a0a", { strokeWidth: 2 })));
      banner(p, 800, 120, 90, 220, "#b8323a", () => p.rc.circle(845, 200, 50, solid(p.s + 6, "#1a0a0a", { strokeWidth: 2 })));
      p.rc.rectangle(670, FLOOR_Y - 320, 100, 320, solid(p.s + 1, "#3b3033"));
      for (let i = 0; i < 4; i++) {
        p.rc.polygon(
          [
            [670 + i * 25, FLOOR_Y - 320],
            [682 + i * 25, FLOOR_Y - 370],
            [695 + i * 25, FLOOR_Y - 320],
          ],
          solid(p.s + 10 + i, "#5c6670", { strokeWidth: 2 }),
        );
      }
      p.rc.rectangle(650, FLOOR_Y - 120, 140, 30, solid(p.s + 20, "#5a1414"));
      p.rc.circle(720, FLOOR_Y - 250, 40, solid(p.s + 21, "#ff3b2a", { strokeWidth: 2 }));
    },
    // Heart of the Tree: a glowing green heart cradled in roots
    (p) => {
      glow(p.ctx, 200, FLOOR_Y - 200, 280, "120,255,140", 0.5);
      for (let i = 0; i < 4; i++) {
        p.rc.curve(
          [
            [40 + i * 90, CEIL],
            [140 + i * 30, FLOOR_Y - 260],
            [80 + i * 70, FLOOR_Y],
          ],
          ink(p.s + i, { stroke: "#5a3a26", strokeWidth: 18 }),
        );
      }
      p.ctx.fillStyle = "#7cff8a";
      p.ctx.beginPath();
      const hx = 200, hy = FLOOR_Y - 200;
      p.ctx.moveTo(hx, hy + 50);
      p.ctx.bezierCurveTo(hx - 80, hy, hx - 50, hy - 60, hx, hy - 20);
      p.ctx.bezierCurveTo(hx + 50, hy - 60, hx + 80, hy, hx, hy + 50);
      p.ctx.fill();
      p.rc.circle(hx, hy, 6, ink(p.s + 9, { strokeWidth: 1 }));
      label(p.ctx, "the Elder Tree's heart", 680, 190, 20, "#9cf05a", "'Patrick Hand'");
    },
  ],
};

export const DECOR: Record<string, Decor> = {
  "fwog-pond": fwog,
  "rayj-studio": rayj,
  "moyaki-bakery": moyaki,
  "mouch-nest": mouch,
  "salmonad-shrine": salmonad,
  "molandak-lab": molandak,
  "mongrod-citadel": mongrod,
};
