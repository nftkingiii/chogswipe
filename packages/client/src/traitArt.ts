// Headwear and eyewear drawn on the in-game Chog from its NFT Head and Eyes traits.
import { bake, INK, ink } from "./art.js";

export type HeadFamily = "cap" | "beanie" | "crown" | "helmet" | "wizard" | "horns" | "band" | "bucket" | "nose" | "wig";
export type EyeFamily = "laser" | "glasses" | "shades" | "visor" | "mask";

export interface HeadItem {
  family: HeadFamily;
  color: string;
}
export interface EyeItem {
  family: EyeFamily;
  color: string;
}

const COLORS: [RegExp, string][] = [
  [/btc|bitcoin|orange/i, "#f7931a"],
  [/dollar|jeet|green|rh /i, "#3fa34d"],
  [/red|demon|devil|fire/i, "#d63a3a"],
  [/blue|wagmi|cyan|plasma/i, "#4a7fd6"],
  [/purple|mon|mcga|mmga|chog|10k|tps|void/i, "#7e5ce0"],
  [/gr[ae]y/i, "#9a9a9a"],
  [/star|thunder|gold|sunset/i, "#f0c35a"],
  [/cloud|white/i, "#dfe9f5"],
  [/boob|horny|balls|pink/i, "#e0528a"],
  [/peace/i, "#7ec4a8"],
  [/tism|black|mafia|robber|thug/i, "#2e2a2c"],
  [/russian|brown/i, "#7a5638"],
];

const colorOf = (v: string, fallback: string) => COLORS.find(([rx]) => rx.test(v))?.[1] ?? fallback;

export function headItem(head: string | undefined): HeadItem | null {
  if (!head) return null;
  const c = (f: string) => colorOf(head, f);
  if (/crown|wreath|thorn|seal|diamond/i.test(head)) return { family: "crown", color: /silver/i.test(head) ? "#c9ced6" : "#f0c35a" };
  if (/helmet/i.test(head)) return { family: "helmet", color: "#b9c0c9" };
  if (/wizard hat/i.test(head)) return { family: "wizard", color: "#6b4fc8" };
  if (/horn/i.test(head)) return { family: "horns", color: c("#d63a3a") };
  if (/beanie|russian|robber/i.test(head)) return { family: "beanie", color: c("#3b3336") };
  if (/bucket/i.test(head)) return { family: "bucket", color: c("#f08a30") };
  if (/band|durag|wrap|bandana/i.test(head)) return { family: "band", color: c("#d63a3a") };
  if (/clown nose/i.test(head)) return { family: "nose", color: "#e0302e" };
  if (/wig/i.test(head)) return { family: "wig", color: "#e0528a" };
  if (/cap|hat|mcga|plumber|neet/i.test(head)) return { family: "cap", color: c(/plumber/i.test(head) ? "#d63a3a" : "#e0528a") };
  return null;
}

export function eyeItem(eyes: string | undefined, head?: string): EyeItem | null {
  if (head && /robber|mafia/i.test(head)) return { family: "mask", color: "#2e2a2c" };
  if (!eyes) return null;
  if (/laser/i.test(eyes)) return { family: "laser", color: colorOf(eyes, "#e0302e") };
  if (/visor|vr/i.test(eyes)) return { family: "visor", color: /sunset/i.test(eyes) ? "#f08a30" : /plasma/i.test(eyes) ? "#7e5ce0" : "#4fc3e0" };
  if (/thug|viper|mog/i.test(eyes)) return { family: "shades", color: "#2e2a2c" };
  if (/glass/i.test(eyes)) return { family: "glasses", color: /btc/i.test(eyes) ? "#f7931a" : /3d/i.test(eyes) ? "#d63a3a" : "#9fd3f2" };
  return null;
}

/** Hats are drawn centred on x=80 with their brim at y=96 of a 160x110 texture. */
export function bakeHead(scene: Phaser.Scene, item: HeadItem): string {
  const key = `head:${item.family}:${item.color}`;
  if (scene.textures.exists(`${key}_0`)) return key;
  const c = item.color;
  bake(scene, key, 160, 110, (ctx, rc, s) => {
    const o = (seed: number, extra = {}) => ink(seed, { strokeWidth: 4, ...extra });
    switch (item.family) {
      case "cap":
        rc.path("M 30 96 C 30 40, 130 40, 130 96 Z", o(s, { fill: c, fillStyle: "solid" }));
        rc.path("M 120 92 C 145 92, 158 98, 156 104 L 118 104 Z", o(s + 1, { fill: c, fillStyle: "solid" }));
        rc.line(80, 50, 80, 92, o(s + 2, { strokeWidth: 2 }));
        rc.circle(80, 50, 8, o(s + 3, { fill: c, fillStyle: "solid", strokeWidth: 2 }));
        break;
      case "beanie":
        rc.path("M 30 96 C 28 30, 132 30, 130 96 Z", o(s, { fill: c, fillStyle: "solid" }));
        rc.rectangle(26, 84, 108, 18, o(s + 1, { fill: c, fillStyle: "cross-hatch", hachureGap: 6, strokeWidth: 3 }));
        rc.circle(80, 30, 22, o(s + 2, { fill: c, fillStyle: "solid", strokeWidth: 3 }));
        break;
      case "bucket":
        rc.path("M 44 86 C 44 42, 116 42, 116 86 Z", o(s, { fill: c, fillStyle: "solid" }));
        rc.ellipse(80, 92, 140, 22, o(s + 1, { fill: c, fillStyle: "solid" }));
        break;
      case "crown": {
        const pts: [number, number][] = [
          [32, 98], [32, 50], [52, 72], [66, 38], [80, 66], [94, 38], [108, 72], [128, 50], [128, 98],
        ];
        rc.polygon(pts, o(s, { fill: c, fillStyle: "solid" }));
        rc.circle(80, 84, 12, o(s + 1, { fill: "#e0302e", fillStyle: "solid", strokeWidth: 2 }));
        break;
      }
      case "helmet":
        rc.path("M 26 100 C 24 30, 136 30, 134 100 Z", o(s, { fill: c, fillStyle: "solid" }));
        rc.path("M 50 36 C 70 2, 110 2, 120 30 C 100 22, 70 24, 50 36 Z", o(s + 1, { fill: "#d63a3a", fillStyle: "solid", strokeWidth: 3 }));
        rc.line(80, 50, 80, 100, o(s + 2, { strokeWidth: 3 }));
        break;
      case "wizard":
        rc.polygon(
          [
            [34, 96], [126, 96], [96, 4], [74, 22],
          ],
          o(s, { fill: c, fillStyle: "solid" }),
        );
        rc.ellipse(80, 96, 140, 18, o(s + 1, { fill: c, fillStyle: "solid" }));
        ctx.fillStyle = "#f0c35a";
        ctx.font = "20px 'Luckiest Guy'";
        ctx.fillText("★", 70, 66);
        break;
      case "horns":
        rc.path("M 40 96 C 20 70, 24 40, 38 26 C 40 50, 52 70, 60 92 Z", o(s, { fill: c, fillStyle: "solid" }));
        rc.path("M 120 96 C 140 70, 136 40, 122 26 C 120 50, 108 70, 100 92 Z", o(s + 1, { fill: c, fillStyle: "solid" }));
        break;
      case "band":
        rc.rectangle(24, 82, 112, 18, o(s, { fill: c, fillStyle: "solid", strokeWidth: 3 }));
        rc.path("M 30 90 L 8 104 L 14 84 Z", o(s + 1, { fill: c, fillStyle: "solid", strokeWidth: 3 }));
        break;
      case "nose":
        rc.circle(118, 100, 22, o(s, { fill: c, fillStyle: "solid", strokeWidth: 3 }));
        break;
      case "wig":
        for (let i = 0; i < 7; i++) {
          const cols = ["#e0302e", "#f08a30", "#f0c35a", "#3fa34d", "#4a7fd6", "#7e5ce0", "#e0528a"];
          rc.circle(30 + i * 17, 70 - Math.sin((i / 6) * Math.PI) * 30, 40, o(s + i, { fill: cols[i], fillStyle: "solid", strokeWidth: 3 }));
        }
        break;
    }
  });
  return key;
}

/** Eyewear is drawn centred on (60, 30) of a 160x60 texture; lasers extend to the right. */
export function bakeEyes(scene: Phaser.Scene, item: EyeItem): string {
  const key = `eyes:${item.family}:${item.color}`;
  if (scene.textures.exists(`${key}_0`)) return key;
  const c = item.color;
  bake(scene, key, 160, 60, (ctx, rc, s) => {
    const o = (seed: number, extra = {}) => ink(seed, { strokeWidth: 3, roughness: 1, ...extra });
    switch (item.family) {
      case "glasses":
        rc.circle(38, 30, 36, o(s, { fill: c, fillStyle: "solid" }));
        rc.circle(82, 30, 36, o(s + 1, { fill: c, fillStyle: "solid" }));
        rc.line(56, 28, 64, 28, o(s + 2));
        if (c === "#f7931a") {
          ctx.fillStyle = "#fff";
          ctx.font = "18px 'Luckiest Guy'";
          ctx.fillText("B", 32, 37);
          ctx.fillText("B", 76, 37);
        }
        break;
      case "shades":
        rc.polygon(
          [
            [14, 18], [106, 18], [100, 40], [66, 40], [60, 28], [54, 40], [20, 40],
          ],
          o(s, { fill: c, fillStyle: "solid" }),
        );
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(26, 22, 10, 5);
        break;
      case "visor":
        rc.rectangle(10, 16, 104, 28, o(s, { fill: c, fillStyle: "solid", strokeWidth: 4 }));
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(18, 21, 60, 5);
        break;
      case "mask":
        rc.path("M 10 22 C 40 10, 80 10, 112 22 C 112 40, 80 44, 62 34 C 44 44, 10 40, 10 22 Z", o(s, { fill: c, fillStyle: "solid" }));
        ctx.fillStyle = "#fff";
        ctx.fillRect(30, 24, 12, 6);
        ctx.fillRect(76, 24, 12, 6);
        break;
      case "laser": {
        const g = ctx.createLinearGradient(60, 0, 160, 0);
        g.addColorStop(0, c);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(40, 20, 120, 7);
        ctx.fillRect(84, 34, 76, 7);
        ctx.shadowColor = c;
        ctx.shadowBlur = 16;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(40, 24, 10, 0, Math.PI * 2);
        ctx.arc(84, 38, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
    }
    void INK;
  });
  return key;
}
