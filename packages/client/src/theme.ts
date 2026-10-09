// Hideout colours come from the defender's Background trait, so every
// hideout looks like its owner's NFT.
import type { Theme } from "./rooms.js";

const BG_HEX: Record<string, string> = {
  "Light Purple": "#b9a3e3",
  Lemon: "#f2e27a",
  Aqua: "#7fd6d6",
  Mon: "#8e6ee8",
  Sunlight: "#f6c45a",
  "Lemon Yellow": "#f4e04d",
  Rosie: "#f0a6b8",
  "Coral Pink": "#f28b7d",
  Mint: "#a8e6c4",
  "Peach Pink": "#f6b8a0",
  "Light Magenta": "#e79ad8",
  "Soft Lavender": "#cdb9ec",
  "Sky Blue": "#8ec5f0",
  "Fresh Green": "#8fd47a",
  "Aqua Mint": "#8fe0cf",
  "Rosy Pink": "#ee9fb5",
  "Deep Aqua": "#3fa7b0",
  "Lime Green": "#b5e05a",
  "Deep Blue": "#4a6fc4",
  Radioactive: "#9cf05a",
  Gold: "#e6b84a",
  Magenta: "#d64fb4",
  "Deep Purple": "#6a45b8",
  "Red Sky": "#e2604a",
  "Royal Blue": "#3f5fd6",
  "Bright Yellow": "#ffd93a",
  "Supreme Purple": "#7d3fd0",
  "Blood Red": "#b8323a",
  "Aqua Blue": "#4fc3e0",
  "Rose Pink": "#f08aa8",
  "Noble Blue": "#3d5aa8",
  "Afternoon Orange": "#f29a4a",
};

const PAPER = [243, 234, 219];

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v!))).toString(16).padStart(2, "0")).join("")}`;
}

/** Blend a colour towards warm paper so walls stay soft behind the ink. */
function mix(hex: string, paper: number): string {
  const c = rgb(hex);
  return toHex(c.map((v, i) => v * (1 - paper) + PAPER[i]! * paper));
}

/** Rotate hue slightly so neighbouring rooms differ but stay one family. */
function shiftHue(hex: string, deg: number): string {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

export function themeFor(background: string | undefined, names?: readonly string[]): Theme {
  const base = BG_HEX[background ?? ""] ?? "#c9d3b8";
  const hues = [0, 14, -14, 24, -24, 0];
  const paper = [0.55, 0.62, 0.5, 0.58, 0.52, 0.7];
  return {
    walls: hues.map((h, i) => mix(shiftHue(base, h), paper[i]!)),
    accent: base,
    names,
  };
}
