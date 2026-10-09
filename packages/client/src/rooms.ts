// The six hideout rooms, drawn to match the sim floor plan in @chogswipe/sim map.ts.
import {
  COLS,
  LINKS,
  LOCKED_DOOR,
  ROOM_NAMES,
  ROOM_W,
  colOf,
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

export interface Theme {
  walls: string[]; // one tint per room
  accent: string;
  names?: readonly string[]; // room signs
}

export const DEFAULT_THEME: Theme = {
  walls: ["#c9d3b8", "#ebcfc4", "#efdda8", "#cfd6e6", "#e6d0e4", "#d9cfc0"],
  accent: ACCENT,
};

const px = (x: number) => (x / ROOM_W) * ROOM_PX;

export function bakeRooms(scene: Phaser.Scene, theme: Theme = DEFAULT_THEME) {
  for (let r = 0; r < 6; r++) bakeRoom(scene, r, theme);
  bakeLockedDoor(scene);
  bakeGuard(scene);
}

function bakeRoom(scene: Phaser.Scene, room: number, theme: Theme) {
  const W = ROOM_PX + 8;
  const H = VIEW_H;
  const col = colOf(room);
  const upper = room >= COLS;
  bake(scene, `room${room}`, W, H, (ctx, rc, seed) => {
    ctx.fillStyle = theme.walls[room]!;
    ctx.fillRect(0, 0, W, FLOOR_Y);
    for (let x = 40; x < W; x += 64) {
      rc.line(x, 70, x, FLOOR_Y - 70, ink(seed + x, { strokeWidth: 1.4, stroke: "rgba(28,22,24,0.18)", roughness: 2.2 }));
    }
    rc.line(0, FLOOR_Y - 120, W, FLOOR_Y - 120, ink(seed + 1, { strokeWidth: 3 }));
    ctx.fillStyle = "#2a2124";
    ctx.fillRect(0, 0, W, 58);
    rc.line(0, 58, W, 58, ink(seed + 2, { strokeWidth: 5 }));
    ctx.fillStyle = upper ? "#a98462" : "#b8916a";
    ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    rc.line(0, FLOOR_Y, W, FLOOR_Y, ink(seed + 3, { strokeWidth: 6 }));
    for (let y = FLOOR_Y + 34; y < H; y += 34) rc.line(0, y, W, y, ink(seed + y, { strokeWidth: 2, stroke: "rgba(28,22,24,0.45)" }));
    ctx.fillStyle = "rgba(28,22,24,0.12)";
    ctx.fillRect(0, FLOOR_Y - 18, W, 18);

    const win = WINDOWS[room];
    if (win) window_(ctx, rc, seed + 400, win);
    props(ctx, rc, seed, room, theme);
    for (const l of LINKS) drawLink(ctx, rc, seed, room, l);

    // outer walls and partitions
    if (col === 0) sideWall(rc, ctx, seed + 70, 0);
    if (col === COLS - 1) sideWall(rc, ctx, seed + 71, W - 34);
    if (col > 0) partition(rc, ctx, seed + 80, 0, false, room === LOCKED_DOOR.right);
    if (col < COLS - 1) partition(rc, ctx, seed + 90, W - 60, true, room === LOCKED_DOOR.left);

    sign(ctx, rc, seed + 95, (theme.names ?? ROOM_NAMES)[room]!, room === 5 ? 520 : 470);
    if (room === 5) {
      // the vault room is dim: harder to spot traps without scouting
      ctx.fillStyle = "rgba(20,14,30,0.28)";
      ctx.fillRect(0, 0, W, H);
    }
    vignette(ctx, W, H);
    grain(ctx, W, H, 16, seed);
  });
}

function props(ctx: CanvasRenderingContext2D, rc: RC, seed: number, room: number, theme: Theme) {
  switch (room) {
    case 0: // Lounge
      rug(rc, seed, 120, 520, "#c96a5a");
      frame(rc, seed, 140, 160, 150, 120, "#6f8fb3", (x, y, w, h) => fwogDoodle(rc, seed + 40, x + w / 2, y + h / 2 + 8));
      couch(rc, seed, 200);
      lamp(rc, ctx, seed, 600);
      break;
    case 1: // Library
      shelf(rc, seed, 90);
      frame(rc, seed + 9, 640, 150, 150, 170, "#f3eadb", (x, y, w) => wanted(ctx, rc, seed + 60, x, y, w));
      plant(rc, seed, 860);
      break;
    case 2: // Kitchen
      counter(rc, ctx, seed, 380);
      fridge(rc, seed, 800);
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

/** Window panes per room (x, y, w, h). Panes are cut out so the night city behind shows through. */
export const WINDOWS: Record<number, [number, number, number, number] | undefined> = {
  0: [330, 150, 190, 150],
  1: [380, 140, 180, 170],
  2: [250, 140, 220, 140],
  3: [660, 140, 190, 170],
  4: [220, 140, 180, 140],
};

function window_(ctx: CanvasRenderingContext2D, rc: RC, seed: number, [x, y, w, h]: [number, number, number, number]) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000"; // fully opaque, so the pane is fully erased
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  rc.rectangle(x - 10, y - 10, w + 20, h + 20, ink(seed, { strokeWidth: 5 }));
  rc.rectangle(x - 4, y - 4, w + 8, h + 8, ink(seed + 1, { stroke: "#8a5a3c", strokeWidth: 8, roughness: 1 }));
  rc.line(x + w / 2, y, x + w / 2, y + h, ink(seed + 2, { stroke: "#8a5a3c", strokeWidth: 7, roughness: 1 }));
  rc.line(x, y + h / 2, x + w, y + h / 2, ink(seed + 3, { stroke: "#8a5a3c", strokeWidth: 7, roughness: 1 }));
  rc.rectangle(x - 20, y + h + 6, w + 40, 16, ink(seed + 4, { fill: "#8a5a3c", fillStyle: "solid", strokeWidth: 3 }));
  // curtains
  rc.path(`M ${x - 26} ${y - 16} C ${x - 6} ${y + h * 0.4}, ${x - 30} ${y + h * 0.8}, ${x - 10} ${y + h + 4} L ${x - 40} ${y + h + 4} L ${x - 40} ${y - 16} Z`, ink(seed + 5, { fill: "#c96a5a", fillStyle: "solid", strokeWidth: 3 }));
  rc.path(`M ${x + w + 26} ${y - 16} C ${x + w + 6} ${y + h * 0.4}, ${x + w + 30} ${y + h * 0.8}, ${x + w + 10} ${y + h + 4} L ${x + w + 40} ${y + h + 4} L ${x + w + 40} ${y - 16} Z`, ink(seed + 6, { fill: "#c96a5a", fillStyle: "solid", strokeWidth: 3 }));
}

/** Night city seen through the windows; drawn once and scrolled slower than the rooms. */
export function bakeSkyline(scene: Phaser.Scene, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const draw = (ctx: CanvasRenderingContext2D, rc: RC, s: number) => {
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
  if (scene.textures.exists("skyline")) return;
  scene.textures.addCanvas("skyline", c);
}

/** Foreground plant that the Chog walks behind, for depth. */
export function bakeForeground(scene: Phaser.Scene) {
  bake(scene, "fgplant", 220, 300, (_ctx, rc, s) => {
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
  });
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
  if (lower) {
    // staircase rising to the right into the ceiling
    const steps = 9;
    const w = 26;
    const h = (FLOOR_Y - 58) / steps;
    const x0 = x - (steps * w) / 2;
    ctx.fillStyle = "#7a5638";
    ctx.beginPath();
    ctx.moveTo(x0, FLOOR_Y);
    for (let i = 0; i < steps; i++) {
      ctx.lineTo(x0 + i * w, FLOOR_Y - (i + 1) * h);
      ctx.lineTo(x0 + (i + 1) * w, FLOOR_Y - (i + 1) * h);
    }
    ctx.lineTo(x0 + steps * w, FLOOR_Y);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < steps; i++) {
      rc.line(x0 + i * w, FLOOR_Y - (i + 1) * h, x0 + (i + 1) * w, FLOOR_Y - (i + 1) * h, ink(seed + 210 + i, { strokeWidth: 4 }));
      rc.line(x0 + i * w, FLOOR_Y - i * h, x0 + i * w, FLOOR_Y - (i + 1) * h, ink(seed + 230 + i, { strokeWidth: 4 }));
    }
    rc.line(x0, FLOOR_Y - 90, x0 + steps * w, 58 - 20, ink(seed + 250, { strokeWidth: 5 })); // banister
    arrowTag(ctx, x0 - 10, FLOOR_Y - 160, "UP");
  } else {
    // stairwell opening in the floor with a railing
    ctx.fillStyle = "#1c1618";
    ctx.fillRect(x - 120, FLOOR_Y, 240, 34);
    rc.rectangle(x - 120, FLOOR_Y, 240, 34, ink(seed + 260, { strokeWidth: 4 }));
    rc.line(x - 120, FLOOR_Y - 70, x + 120, FLOOR_Y - 70, ink(seed + 261, { strokeWidth: 5 }));
    for (let i = -120; i <= 120; i += 40) rc.line(x + i, FLOOR_Y - 70, x + i, FLOOR_Y, ink(seed + 262 + i, { strokeWidth: 3 }));
    arrowTag(ctx, x - 40, FLOOR_Y - 110, "DOWN");
  }
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
