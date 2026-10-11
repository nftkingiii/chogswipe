// The six hideout rooms, drawn to match the sim floor plan in @chogswipe/sim map.ts.
import {
  COLS,
  HOUSE_PLAN,
  ROOM_NAMES,
  ROOMS,
  ROOM_W,
  colOf,
  type FloorPlan,
  type Link,
} from "@chogswipe/sim";
import rough from "roughjs";
import {
  ACCENT,
  FLOOR_Y,
  INK,
  ROOM_PX,
  VIEW_H,
  bake,
  coinDoodle,
  couch,
  frame,
  fwogDoodle,
  grain,
  ink,
  lamp,
  plant,
  rug,
  shelf,
  vignette,
  wanted,
  type RC,
} from "./art.js";
import { paintFloor, paintSky, paintWall, type Decor, type SkyKind } from "./decor.js";

export interface Theme {
  walls: string[]; // one tint per room
  accent: string;
  names?: readonly string[]; // room signs
  /** a lore heist's own walls, floors, view and furniture; player hideouts have none */
  decor?: Decor;
}

export const DEFAULT_THEME: Theme = {
  walls: ["#c9d3b8", "#ebcfc4", "#efdda8", "#cfd6e6", "#e6d0e4", "#d9cfc0"],
  accent: ACCENT,
};

const px = (x: number) => (x / ROOM_W) * ROOM_PX;

export function bakeRooms(scene: Phaser.Scene, theme: Theme = DEFAULT_THEME, plan: FloorPlan = HOUSE_PLAN) {
  const windows = windowsFor(plan);
  for (let r = 0; r < 6; r++) bakeRoom(scene, r, theme, plan, windows[r]);
  bakeLockedDoor(scene);
  bakeFrontDoor(scene);
  bakeGuard(scene);
}

function bakeRoom(scene: Phaser.Scene, room: number, theme: Theme, plan: FloorPlan, win: Pane | undefined) {
  const W = ROOM_PX + 8;
  const H = VIEW_H;
  const col = colOf(room);
  const upper = room >= COLS;
  const decor = theme.decor;
  bake(scene, `room${room}`, W, H, (ctx, rc, seed) => {
    const paint = { ctx, rc, s: seed, wall: theme.walls[room]!, accent: theme.accent };
    ctx.fillStyle = theme.walls[room]!;
    ctx.fillRect(0, 0, W, FLOOR_Y);
    if (decor) paintWall(paint, decor.wall);
    else {
      for (let x = 40; x < W; x += 64) {
        rc.line(x, 70, x, FLOOR_Y - 70, ink(seed + x, { strokeWidth: 1.4, stroke: "rgba(28,22,24,0.18)", roughness: 2.2 }));
      }
    }
    rc.line(0, FLOOR_Y - 120, W, FLOOR_Y - 120, ink(seed + 1, { strokeWidth: 3 }));
    ctx.fillStyle = decor?.ceiling ?? "#2a2124";
    ctx.fillRect(0, 0, W, 58);
    rc.line(0, 58, W, 58, ink(seed + 2, { strokeWidth: 5 }));
    if (decor) paintFloor(paint, decor.floor, upper);
    else {
      ctx.fillStyle = upper ? "#a98462" : "#b8916a";
      ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
      rc.line(0, FLOOR_Y, W, FLOOR_Y, ink(seed + 3, { strokeWidth: 6 }));
      for (let y = FLOOR_Y + 34; y < H; y += 34) rc.line(0, y, W, y, ink(seed + y, { strokeWidth: 2, stroke: "rgba(28,22,24,0.45)" }));
      ctx.fillStyle = "rgba(28,22,24,0.12)";
      ctx.fillRect(0, FLOOR_Y - 18, W, 18);
    }

    if (win) window_(ctx, rc, seed + 400, win, decor?.frame ?? "#8a5a3c", decor ? decor.curtain : "#c96a5a");
    if (decor) decor.rooms[room]!(paint);
    else props(ctx, rc, seed, room, theme);
    drawHazards(ctx, rc, seed, room, plan);
    for (const l of plan.links) drawLink(ctx, rc, seed, room, l);

    // outer walls and partitions
    if (col === 0) sideWall(rc, ctx, seed + 70, 0);
    if (col === COLS - 1) sideWall(rc, ctx, seed + 71, W - 34);
    if (col > 0) partition(rc, ctx, seed + 80, 0, false, room === plan.lockedDoor?.right);
    if (col < COLS - 1) partition(rc, ctx, seed + 90, W - 60, true, room === plan.lockedDoor?.left);

    sign(ctx, rc, seed + 95, (theme.names ?? ROOM_NAMES)[room]!, room === 5 ? 520 : 470);
    const dim = (room === plan.vault.room ? 0.28 : 0) + (decor?.dim?.[room] ?? 0);
    if (dim > 0) {
      // the vault room is dim: harder to spot traps without scouting
      ctx.fillStyle = `rgba(20,14,30,${Math.min(0.42, dim)})`;
      ctx.fillRect(0, 0, W, H);
    }
    vignette(ctx, W, H);
    grain(ctx, W, H, 16, seed);
  }, true);
}

function props(ctx: CanvasRenderingContext2D, rc: RC, seed: number, room: number, theme: Theme) {
  switch (room) {
    case 0: // Lounge
      rug(rc, seed, 120, 520, "#c96a5a");
      frame(rc, seed, 290, 160, 140, 120, "#6f8fb3", (x, y, w, h) => fwogDoodle(rc, seed + 40, x + w / 2, y + h / 2 + 8));
      couch(rc, seed, 180);
      break;
    case 1: // Library
      shelf(rc, seed, 90);
      frame(rc, seed + 9, 640, 150, 150, 170, "#f3eadb", (x, y, w) => wanted(ctx, rc, seed + 60, x, y, w));
      plant(rc, seed, 860);
      break;
    case 2: // Kitchen
      counter(rc, ctx, seed, 560);
      fridge(rc, seed, 856);
      clock(rc, ctx, seed, 560, 170);
      break;
    case 3: // Study
      desk(rc, ctx, seed, 160);
      frame(rc, seed, 440, 160, 130, 130, "#efdda8", (x, y, w, h) => coinDoodle(ctx, rc, seed + 70, x + w / 2, y + h / 2));
      lamp(rc, ctx, seed, 600);
      break;
    case 4: // Bedroom
      rug(rc, seed, 120, 420, theme.accent);
      bed(rc, seed, 120);
      frame(rc, seed, 640, 170, 120, 100, "#7ec4a8", (x, y, w, h) => fwogDoodle(rc, seed + 41, x + w / 2, y + h / 2 + 6));
      break;
    case 5: // Vault
      frame(rc, seed, 360, 150, 140, 120, "#efdda8", (x, y, w, h) => coinDoodle(ctx, rc, seed + 72, x + w / 2, y + h / 2));
      lamp(rc, ctx, seed, 600);
      break;
  }
}

// ------------------------------------------------------------- windows

type Pane = [number, number, number, number];

/** Window panes per room in the house (x, y, w, h). Panes are cut out so the view behind shows through. */
export const WINDOWS: Record<number, Pane | undefined> = {
  0: [60, 150, 170, 140],
  1: [380, 140, 180, 170],
  2: [640, 140, 150, 120],
  3: [660, 140, 190, 170],
  4: [220, 140, 180, 140],
};
const SPARE_PANES: Pane[] = [
  [380, 140, 180, 170],
  [660, 140, 190, 170],
  [220, 140, 180, 140],
  [640, 140, 150, 120],
  [100, 150, 160, 140],
];

/** Where a link takes up wall space in a room: [x0, x1]. Stairs run diagonally between their two ends. */
function linkSpans(plan: FloorPlan, room: number): [number, number][] {
  const out: [number, number][] = [];
  for (const l of plan.links) {
    for (const end of [l.a, l.b]) {
      if (end.room !== room) continue;
      if (l.kind === "stairs") out.push([Math.min(l.a.x, l.b.x) - 60, Math.max(l.a.x, l.b.x) + 60]);
      else out.push([end.x - 110, end.x + 110]);
    }
  }
  if (room === plan.vault.room) out.push([plan.vault.x - 140, plan.vault.x + 140]);
  return out;
}

/** One window per room, kept clear of this plan's stairs, pads, portals and vault. */
export function windowsFor(plan: FloorPlan): Record<number, Pane | undefined> {
  const out: Record<number, Pane | undefined> = {};
  for (let r = 0; r < ROOMS; r++) {
    const spans = linkSpans(plan, r);
    const free = (p: Pane) => spans.every(([a, b]) => p[0] + p[2] + 30 < a || p[0] - 30 > b);
    const home = WINDOWS[r];
    out[r] = home && free(home) ? home : r === plan.vault.room && plan === HOUSE_PLAN ? undefined : SPARE_PANES.find(free);
  }
  if (plan === HOUSE_PLAN) out[5] = undefined; // the house vault room has no window
  return out;
}

function window_(ctx: CanvasRenderingContext2D, rc: RC, seed: number, [x, y, w, h]: Pane, wood: string, curtain: string | null) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000"; // fully opaque, so the pane is fully erased
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  rc.rectangle(x - 10, y - 10, w + 20, h + 20, ink(seed, { strokeWidth: 5 }));
  rc.rectangle(x - 4, y - 4, w + 8, h + 8, ink(seed + 1, { stroke: wood, strokeWidth: 8, roughness: 1 }));
  rc.line(x + w / 2, y, x + w / 2, y + h, ink(seed + 2, { stroke: wood, strokeWidth: 7, roughness: 1 }));
  rc.line(x, y + h / 2, x + w, y + h / 2, ink(seed + 3, { stroke: wood, strokeWidth: 7, roughness: 1 }));
  rc.rectangle(x - 20, y + h + 6, w + 40, 16, ink(seed + 4, { fill: wood, fillStyle: "solid", strokeWidth: 3 }));
  if (!curtain) return;
  rc.path(`M ${x - 26} ${y - 16} C ${x - 6} ${y + h * 0.4}, ${x - 30} ${y + h * 0.8}, ${x - 10} ${y + h + 4} L ${x - 40} ${y + h + 4} L ${x - 40} ${y - 16} Z`, ink(seed + 5, { fill: curtain, fillStyle: "solid", strokeWidth: 3 }));
  rc.path(`M ${x + w + 26} ${y - 16} C ${x + w + 6} ${y + h * 0.4}, ${x + w + 30} ${y + h * 0.8}, ${x + w + 10} ${y + h + 4} L ${x + w + 40} ${y + h + 4} L ${x + w + 40} ${y - 16} Z`, ink(seed + 6, { fill: curtain, fillStyle: "solid", strokeWidth: 3 }));
}

/** The view through the windows (night city unless the heist has its own); drawn once and scrolled slower than the rooms. Returns its texture key. */
export function bakeSkyline(scene: Phaser.Scene, w: number, h: number, sky: SkyKind = "city"): string {
  const key = `skyline:${sky}`;
  if (scene.textures.exists(key)) return key;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const draw = (ctx: CanvasRenderingContext2D, rc: RC, s: number) => {
    if (sky !== "city") return paintSky(ctx, rc, s, sky, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1d1438");
    g.addColorStop(0.6, "#3a2766");
    g.addColorStop(1, "#6b3f7a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // stars and a moon
    let r = 99;
    const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) % 10_000) / 10_000;
    ctx.fillStyle = "#fff6d8";
    for (let i = 0; i < 160; i++) ctx.fillRect(rand() * w, rand() * h * 0.6, 2, 2);
    rc.circle(w * 0.3, h * 0.16, 90, ink(s, { fill: "#fff1c4", fillStyle: "solid", strokeWidth: 3 }));
    // two rows of buildings with lit windows
    for (const [row, base, color] of [
      [0, h * 0.62, "#2a1e40"],
      [1, h * 0.8, "#1c1530"],
    ] as const) {
      let x = -20;
      while (x < w) {
        const bw = 80 + rand() * 140;
        const bh = 140 + rand() * 260 + row * 40;
        rc.rectangle(x, base - bh, bw, bh + h, ink(s + Math.floor(x), { fill: color, fillStyle: "solid", strokeWidth: 3, stroke: "#120c1e" }));
        for (let wy = base - bh + 20; wy < base + 200; wy += 34) {
          for (let wx = x + 14; wx < x + bw - 20; wx += 28) {
            if (rand() < 0.35) {
              ctx.fillStyle = rand() < 0.2 ? "#b28cff" : "#f6d27a";
              ctx.fillRect(wx, wy, 12, 16);
            }
          }
        }
        x += bw + 10 + rand() * 30;
      }
    }
    // a Monad-purple neon sign on a rooftop
    ctx.font = "54px 'Luckiest Guy'";
    ctx.shadowColor = "#a07cff";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#c9b2ff";
    ctx.fillText("CHOG WORLD ORDER", w * 0.48, h * 0.42);
    ctx.shadowBlur = 0;
  };
  draw(c.getContext("2d")!, rough.canvas(c), 4242);
  scene.textures.addCanvas(key, c);
  return key;
}

/** Foreground piece that the Chog walks behind, for depth: the heist's own, or a potted plant. */
export function bakeForeground(scene: Phaser.Scene, decor?: Decor) {
  bake(scene, "fgplant", 220, 300, (ctx, rc, s) => {
    if (decor?.fg) return decor.fg(ctx, rc, s);
    rc.polygon(
      [
        [70, 210],
        [150, 210],
        [140, 300],
        [80, 300],
      ],
      ink(s, { fill: "#3b2a24", fillStyle: "solid" }),
    );
    for (let i = -3; i <= 3; i++) {
      rc.ellipse(110 + i * 26, 130 - Math.abs(i) * -14, 40, 170, ink(s + 10 + i, { fill: "#2f4a2a", fillStyle: "solid", strokeWidth: 3 }));
    }
  }, true);
}

/** Floor grates for steam vents and a sheen of water, in the rooms that have them. */
function drawHazards(ctx: CanvasRenderingContext2D, rc: RC, seed: number, room: number, plan: FloorPlan) {
  for (const h of plan.hazards) {
    if (h.room !== room) continue;
    if (h.kind === "water") {
      ctx.fillStyle = "rgba(75,111,196,0.5)";
      ctx.fillRect(px(h.x0), FLOOR_Y - 16, px(h.x1) - px(h.x0), 150);
      for (let x = h.x0 + 30; x < h.x1 - 40; x += 80) rc.line(px(x), FLOOR_Y + 10 + (x % 3) * 12, px(x + 40), FLOOR_Y + 10 + (x % 3) * 12, ink(seed + x, { stroke: "#cfe0ff", strokeWidth: 3 }));
    } else {
      for (let x = h.x0 + 20; x < h.x1 - 20; x += 70) {
        rc.rectangle(px(x), FLOOR_Y - 6, 50, 12, ink(seed + x, { fill: "#3b3033", fillStyle: "solid", strokeWidth: 2.5 }));
        for (let k = 8; k < 50; k += 10) rc.line(px(x) + k, FLOOR_Y - 5, px(x) + k, FLOOR_Y + 5, ink(seed + x + k, { strokeWidth: 1.5, stroke: "#9aa6b2" }));
      }
      arrowTag(ctx, px((h.x0 + h.x1) / 2) - 60, FLOOR_Y - 140, "STEAM VENTS");
    }
  }
}

// ------------------------------------------------------------- structure

function sideWall(rc: RC, ctx: CanvasRenderingContext2D, seed: number, x: number) {
  ctx.fillStyle = "#3b3033";
  ctx.fillRect(x, 58, 34, FLOOR_Y - 58);
  rc.rectangle(x, 58, 34, FLOOR_Y - 58, ink(seed, { strokeWidth: 5, fill: "#4a3d40", fillStyle: "hachure", hachureGap: 10 }));
}

function partition(rc: RC, ctx: CanvasRenderingContext2D, seed: number, x: number, right: boolean, locked: boolean) {
  ctx.fillStyle = "#3b3033";
  ctx.fillRect(x, 58, 60, FLOOR_Y - 58 - 270);
  rc.rectangle(x, 58, 60, FLOOR_Y - 58 - 270, ink(seed, { strokeWidth: 5, fill: "#4a3d40", fillStyle: "hachure", hachureGap: 10 }));
  rc.rectangle(x - (right ? 10 : 0), FLOOR_Y - 280, 70, 22, ink(seed + 1, { fill: locked ? "#6b2a2a" : "#8a5a3c", fillStyle: "solid", strokeWidth: 4 }));
  rc.line(x + (right ? 0 : 60), FLOOR_Y - 260, x + (right ? 0 : 60), FLOOR_Y, ink(seed + 2, { strokeWidth: 6 }));
}

function drawLink(ctx: CanvasRenderingContext2D, rc: RC, seed: number, room: number, l: Link) {
  const lower = l.a.room === room;
  const upper = l.b.room === room;
  if (!lower && !upper) return;
  const x = px(lower ? l.a.x : l.b.x);
  if (l.kind === "launch") {
    if (lower) {
      // a big spring pad on the floor with an arrow up
      rc.rectangle(x - 70, FLOOR_Y - 24, 140, 24, ink(seed + 210, { fill: "#e0528a", fillStyle: "solid", strokeWidth: 4 }));
      for (let i = -50; i <= 50; i += 25) rc.line(x + i, FLOOR_Y - 24, x + i + 12, FLOOR_Y - 60, ink(seed + 211 + i, { strokeWidth: 4, stroke: "#5c6670" }));
      rc.rectangle(x - 60, FLOOR_Y - 72, 120, 14, ink(seed + 230, { fill: "#f0c35a", fillStyle: "solid", strokeWidth: 3 }));
      arrowTag(ctx, x - 26, FLOOR_Y - 100, "UP!");
    } else {
      // the landing: a hatch in the floor with a target ring
      ctx.fillStyle = "#1c1618";
      ctx.fillRect(x - 70, FLOOR_Y, 140, 30);
      rc.ellipse(x, FLOOR_Y - 6, 160, 26, ink(seed + 240, { stroke: "#e0528a", strokeWidth: 4 }));
    }
    return;
  }
  if (l.kind === "portal") {
    // a swirl on the wall; the moving portal sprite is added by the raid scene
    const g = ctx.createRadialGradient(x, FLOOR_Y - 120, 10, x, FLOOR_Y - 120, 150);
    g.addColorStop(0, "rgba(160,124,255,0.55)");
    g.addColorStop(1, "rgba(160,124,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 150, FLOOR_Y - 270, 300, 300);
    rc.ellipse(x, FLOOR_Y - 120, 170, 230, ink(seed + 250, { stroke: "#5b7cff", strokeWidth: 6 }));
    arrowTag(ctx, x - 30, FLOOR_Y - 250, "PORTAL ↑");
    return;
  }
  if (l.kind === "vent") {
    const y = FLOOR_Y - (lower ? 60 : 300);
    rc.rectangle(x - 46, y - 30, 92, 60, ink(seed + 200, { fill: "#9aa6b2", fillStyle: "solid", strokeWidth: 4 }));
    for (let i = -30; i <= 30; i += 15) rc.line(x + i, y - 24, x + i, y + 24, ink(seed + 201 + i, { strokeWidth: 3 }));
    // duct running up or down the wall
    ctx.fillStyle = "rgba(154,166,178,0.55)";
    if (lower) ctx.fillRect(x - 20, 58, 40, y - 30 - 58);
    else ctx.fillRect(x - 20, y + 30, 40, FLOOR_Y - y - 30);
    return;
  }
  const foot = px(l.a.x);
  const top = px(l.b.x);
  const dir = Math.sign(top - foot) || 1;
  if (lower) drawStairs(ctx, rc, seed, foot, top, dir);
  else drawStairwell(ctx, rc, seed, top, dir);
}

const STEPS = 12;
const CEIL = 58;

/** A real staircase: treads and risers rising from the foot to the ceiling, a stringer, rail and balusters. */
function drawStairs(ctx: CanvasRenderingContext2D, rc: RC, seed: number, foot: number, top: number, dir: number) {
  const w = Math.abs(top - foot) / STEPS;
  const h = (FLOOR_Y - CEIL) / STEPS;
  const sx = (i: number) => foot + dir * i * w;
  // under-stair closet: the solid mass below the steps
  ctx.fillStyle = "#6e4e34";
  ctx.beginPath();
  ctx.moveTo(foot, FLOOR_Y);
  for (let i = 0; i < STEPS; i++) {
    ctx.lineTo(sx(i), FLOOR_Y - (i + 1) * h);
    ctx.lineTo(sx(i + 1), FLOOR_Y - (i + 1) * h);
  }
  ctx.lineTo(top, FLOOR_Y);
  ctx.closePath();
  ctx.fill();
  rc.line(foot + dir * w * 2, FLOOR_Y - 8, top - dir * 6, CEIL + h * 2, ink(seed + 300, { strokeWidth: 2, stroke: "rgba(28,22,24,0.35)" }));
  // steps: riser face plus a lit tread on top
  for (let i = 0; i < STEPS; i++) {
    const x0 = Math.min(sx(i), sx(i + 1));
    const yTop = FLOOR_Y - (i + 1) * h;
    ctx.fillStyle = "#8a6242";
    ctx.fillRect(x0, yTop, w, h);
    ctx.fillStyle = "#c9976a";
    ctx.fillRect(x0 - 3, yTop - 6, w + 6, 8);
    rc.rectangle(x0 - 3, yTop - 6, w + 6, 8, ink(seed + 310 + i, { strokeWidth: 2.5, roughness: 0.8 }));
    rc.line(sx(i), yTop + 2, sx(i), yTop + h, ink(seed + 330 + i, { strokeWidth: 3, roughness: 0.8 }));
  }
  // stringer along the underside
  rc.line(foot - dir * 4, FLOOR_Y, top, CEIL + 4, ink(seed + 350, { strokeWidth: 6 }));
  // handrail parallel to the stairs, balusters on every step
  const railLift = 118;
  const railY = (x: number) => FLOOR_Y - railLift - ((x - foot) / (top - foot)) * (FLOOR_Y - CEIL);
  const railEnd = foot + (top - foot) * ((FLOOR_Y - railLift - CEIL) / (FLOOR_Y - CEIL));
  for (let i = 0; i < STEPS; i++) {
    const bx = sx(i) + dir * w * 0.5;
    if ((bx - railEnd) * dir > 0) break;
    rc.line(bx, FLOOR_Y - (i + 1) * h - 6, bx, railY(bx), ink(seed + 360 + i, { strokeWidth: 2.5, roughness: 0.6 }));
  }
  rc.line(foot, railY(foot), railEnd, CEIL, ink(seed + 380, { strokeWidth: 7, stroke: "#5a3a26", roughness: 0.8 }));
  rc.line(foot, railY(foot) - 4, railEnd, CEIL - 4, ink(seed + 381, { strokeWidth: 2 }));
  // newel post at the foot
  const nx = foot - dir * 10;
  rc.rectangle(nx - 11, FLOOR_Y - 140, 22, 140, ink(seed + 390, { fill: "#7a5638", fillStyle: "solid", strokeWidth: 3 }));
  rc.circle(nx, FLOOR_Y - 148, 26, ink(seed + 391, { fill: "#c9976a", fillStyle: "solid", strokeWidth: 3 }));
  arrowTag(ctx, nx - dir * 40 - 20, FLOOR_Y - 170, "UP");
}

/** The top of the stairs seen from upstairs: an opening in the floor with the last steps and a railing. */
function drawStairwell(ctx: CanvasRenderingContext2D, rc: RC, seed: number, top: number, dir: number) {
  const len = 200;
  const x0 = Math.min(top - dir * len, top + dir * 20);
  const x1 = Math.max(top - dir * len, top + dir * 20);
  ctx.fillStyle = "#1c1618";
  ctx.fillRect(x0, FLOOR_Y, x1 - x0, 130);
  // the last steps disappearing down into the well
  for (let i = 1; i <= 4; i++) {
    const sx = top - dir * i * 40;
    ctx.fillStyle = `rgba(201,151,106,${0.75 - i * 0.15})`;
    ctx.fillRect(Math.min(sx, sx + dir * 40), FLOOR_Y + i * 22, 40, 7);
  }
  rc.rectangle(x0, FLOOR_Y, x1 - x0, 130, ink(seed + 400, { strokeWidth: 4 }));
  // railing along the well
  rc.line(x0, FLOOR_Y - 80, x1, FLOOR_Y - 80, ink(seed + 401, { strokeWidth: 6, stroke: "#5a3a26" }));
  for (let x = x0; x <= x1 + 1; x += 34) rc.line(x, FLOOR_Y - 80, x, FLOOR_Y, ink(seed + 402 + x, { strokeWidth: 2.5 }));
  rc.rectangle(x0 - 10, FLOOR_Y - 104, 20, 104, ink(seed + 450, { fill: "#7a5638", fillStyle: "solid", strokeWidth: 3 }));
  rc.rectangle(x1 - 10, FLOOR_Y - 104, 20, 104, ink(seed + 451, { fill: "#7a5638", fillStyle: "solid", strokeWidth: 3 }));
  arrowTag(ctx, (x0 + x1) / 2 - 30, FLOOR_Y - 96, "DOWN");
}

function arrowTag(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  ctx.font = "20px 'Luckiest Guy'";
  ctx.fillStyle = "rgba(28,22,24,0.55)";
  ctx.fillText(label, x, y);
}

function sign(ctx: CanvasRenderingContext2D, rc: RC, seed: number, name: string, x: number) {
  ctx.font = "26px 'Luckiest Guy'";
  const w = ctx.measureText(name).width + 40;
  rc.line(x - 20, 58, x - 30, 84, ink(seed, { strokeWidth: 2 }));
  rc.line(x + w - 20, 58, x + w - 10, 84, ink(seed + 1, { strokeWidth: 2 }));
  rc.rectangle(x - 40, 84, w + 40, 44, ink(seed + 2, { fill: "#f3eadb", fillStyle: "solid", strokeWidth: 3 }));
  ctx.fillStyle = INK;
  ctx.fillText(name.toUpperCase(), x - 20, 116);
}

// ------------------------------------------------------------- furniture

function counter(rc: RC, ctx: CanvasRenderingContext2D, seed: number, x: number) {
  const y = FLOOR_Y;
  rc.rectangle(x - 160, y - 130, 320, 130, ink(seed + 300, { fill: "#d9cbb3", fillStyle: "solid" }));
  rc.rectangle(x - 170, y - 146, 340, 20, ink(seed + 301, { fill: "#8a5a3c", fillStyle: "solid", strokeWidth: 3 }));
  for (let i = -1; i <= 1; i++) rc.rectangle(x + i * 104 - 44, y - 110, 88, 90, ink(seed + 302 + i, { strokeWidth: 2.5 }));
  // a pot and a pie
  rc.rectangle(x - 110, y - 196, 70, 50, ink(seed + 310, { fill: "#6b7580", fillStyle: "solid", strokeWidth: 3 }));
  rc.ellipse(x + 80, y - 156, 90, 26, ink(seed + 311, { fill: "#e0a35a", fillStyle: "solid", strokeWidth: 3 }));
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(x - 100, y - 214, 6, 14);
}

function fridge(rc: RC, seed: number, x: number) {
  const y = FLOOR_Y;
  rc.rectangle(x - 60, y - 300, 120, 300, ink(seed + 320, { fill: "#eef1f3", fillStyle: "solid" }));
  rc.line(x - 60, y - 190, x + 60, y - 190, ink(seed + 321, { strokeWidth: 3 }));
  rc.line(x + 40, y - 270, x + 40, y - 220, ink(seed + 322, { strokeWidth: 5 }));
  rc.line(x + 40, y - 160, x + 40, y - 100, ink(seed + 323, { strokeWidth: 5 }));
  rc.circle(x - 20, y - 250, 18, ink(seed + 324, { fill: "#e0528a", fillStyle: "solid", strokeWidth: 2 }));
}

function clock(rc: RC, ctx: CanvasRenderingContext2D, seed: number, x: number, y: number) {
  rc.circle(x, y, 80, ink(seed + 330, { fill: "#f3eadb", fillStyle: "solid" }));
  rc.line(x, y, x, y - 26, ink(seed + 331, { strokeWidth: 4 }));
  rc.line(x, y, x + 18, y + 8, ink(seed + 332, { strokeWidth: 4 }));
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function desk(rc: RC, ctx: CanvasRenderingContext2D, seed: number, x: number) {
  const y = FLOOR_Y;
  rc.rectangle(x, y - 120, 260, 20, ink(seed + 340, { fill: "#8a5a3c", fillStyle: "solid" }));
  rc.rectangle(x + 10, y - 100, 20, 100, ink(seed + 341, { fill: "#6e462e", fillStyle: "solid", strokeWidth: 3 }));
  rc.rectangle(x + 230, y - 100, 20, 100, ink(seed + 342, { fill: "#6e462e", fillStyle: "solid", strokeWidth: 3 }));
  // monitor with a candle chart
  rc.rectangle(x + 70, y - 230, 130, 96, ink(seed + 343, { fill: "#2a2124", fillStyle: "solid", strokeWidth: 4 }));
  const bars = [30, 50, 38, 62, 70];
  bars.forEach((b, i) =>
    rc.rectangle(x + 86 + i * 22, y - 146 - b, 12, b, ink(seed + 344 + i, { fill: i % 2 ? "#7ec4a8" : "#e0528a", fillStyle: "solid", strokeWidth: 1.5 })),
  );
  rc.line(x + 135, y - 134, x + 135, y - 120, ink(seed + 350, { strokeWidth: 5 }));
  ctx.font = "16px 'Patrick Hand'";
  ctx.fillStyle = "#f3eadb";
  ctx.fillText("$CHOG", x + 82, y - 212);
}

function bed(rc: RC, seed: number, x: number) {
  const y = FLOOR_Y;
  rc.rectangle(x, y - 110, 320, 70, ink(seed + 360, { fill: "#7aa0c8", fillStyle: "solid" }));
  rc.rectangle(x - 10, y - 190, 30, 190, ink(seed + 361, { fill: "#8a5a3c", fillStyle: "solid" }));
  rc.rectangle(x + 300, y - 140, 30, 140, ink(seed + 362, { fill: "#8a5a3c", fillStyle: "solid" }));
  rc.ellipse(x + 70, y - 122, 100, 40, ink(seed + 363, { fill: "#f3eadb", fillStyle: "solid", strokeWidth: 3 }));
  rc.rectangle(x + 130, y - 120, 170, 40, ink(seed + 364, { fill: "#a3c4e3", fillStyle: "cross-hatch", hachureGap: 12, strokeWidth: 3 }));
}

// ------------------------------------------------------------- door, guard

function bakeLockedDoor(scene: Phaser.Scene) {
  bake(scene, "lockdoor", 80, 270, (_ctx, rc, s) => {
    rc.rectangle(6, 6, 68, 258, ink(s, { fill: "#6b2a2a", fillStyle: "solid", strokeWidth: 5 }));
    rc.rectangle(16, 20, 48, 90, ink(s + 1, { strokeWidth: 3 }));
    rc.rectangle(16, 130, 48, 120, ink(s + 2, { strokeWidth: 3 }));
    rc.rectangle(24, 112, 32, 34, ink(s + 3, { fill: "#f0c35a", fillStyle: "solid", strokeWidth: 3 }));
    rc.arc(40, 112, 22, 26, Math.PI, Math.PI * 2, false, ink(s + 4, { strokeWidth: 4 }));
  });
  bake(scene, "lockdoor-open", 80, 270, (_ctx, rc, s) => {
    rc.polygon(
      [
        [6, 6],
        [30, 26],
        [30, 250],
        [6, 264],
      ],
      ink(s, { fill: "#6b2a2a", fillStyle: "solid", strokeWidth: 4 }),
    );
  });
}

/** The hideout's front door in the Lounge: closed, and swung open. */
function bakeFrontDoor(scene: Phaser.Scene) {
  bake(scene, "frontdoor", 120, 270, (_ctx, rc, s) => {
    rc.rectangle(6, 6, 108, 264, ink(s, { fill: "#2a2124", fillStyle: "solid", strokeWidth: 5 }));
    rc.rectangle(16, 16, 88, 254, ink(s + 1, { fill: "#8a5a3c", fillStyle: "solid", strokeWidth: 4 }));
    rc.rectangle(28, 34, 64, 80, ink(s + 2, { strokeWidth: 3 }));
    rc.rectangle(28, 140, 64, 110, ink(s + 3, { strokeWidth: 3 }));
    rc.circle(88, 140, 14, ink(s + 4, { fill: "#f0c35a", fillStyle: "solid", strokeWidth: 2 }));
    rc.rectangle(40, 58, 40, 14, ink(s + 5, { fill: "#f3eadb", fillStyle: "solid", strokeWidth: 2 }));
  });
  bake(scene, "frontdoor-open", 120, 270, (ctx, rc, s) => {
    // night outside the open doorway, the door swung against the wall
    ctx.fillStyle = "#1d1438";
    ctx.fillRect(10, 10, 100, 258);
    ctx.fillStyle = "#f6d27a";
    ctx.fillRect(70, 60, 10, 12);
    rc.rectangle(6, 6, 108, 264, ink(s, { strokeWidth: 5 }));
    rc.polygon(
      [
        [8, 10],
        [40, 30],
        [40, 250],
        [8, 268],
      ],
      ink(s + 1, { fill: "#8a5a3c", fillStyle: "solid", strokeWidth: 4 }),
    );
  });
}

function bakeGuard(scene: Phaser.Scene) {
  // a Fwog bouncer in shades and a SECURITY tee
  const draw = (ko: boolean) => (ctx: CanvasRenderingContext2D, rc: RC, s: number) => {
    const cx = 80;
    if (ko) {
      rc.ellipse(cx, 150, 150, 60, ink(s, { fill: "#7cc36a", fillStyle: "solid" }));
      ctx.font = "28px 'Luckiest Guy'";
      ctx.fillStyle = INK;
      ctx.fillText("zZz", cx + 40, 90);
      return;
    }
    rc.rectangle(cx - 46, 120, 92, 70, ink(s, { fill: "#2a2124", fillStyle: "solid" }));
    // badge reads the same both ways, so flipping the guard never mirrors text
    const star: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 16 : 7;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      star.push([cx + Math.cos(a) * r, 152 + Math.sin(a) * r]);
    }
    rc.polygon(star, ink(s + 9, { fill: "#f0c35a", fillStyle: "solid", strokeWidth: 2 }));
    rc.ellipse(cx, 90, 120, 80, ink(s + 1, { fill: "#7cc36a", fillStyle: "solid" }));
    rc.circle(cx - 28, 56, 34, ink(s + 2, { fill: "#7cc36a", fillStyle: "solid", strokeWidth: 3 }));
    rc.circle(cx + 28, 56, 34, ink(s + 3, { fill: "#7cc36a", fillStyle: "solid", strokeWidth: 3 }));
    rc.rectangle(cx - 52, 50, 104, 18, ink(s + 4, { fill: INK, fillStyle: "solid", strokeWidth: 2 }));
    rc.arc(cx, 104, 50, 20, 0, Math.PI, false, ink(s + 5, { strokeWidth: 3 }));
    rc.line(cx - 24, 190, cx - 28, 220, ink(s + 6, { strokeWidth: 10 }));
    rc.line(cx + 24, 190, cx + 28, 220, ink(s + 7, { strokeWidth: 10 }));
  };
  bake(scene, "guard", 160, 226, draw(false));
  bake(scene, "guard-ko", 200, 200, draw(true));
}
