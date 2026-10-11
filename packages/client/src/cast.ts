// The monanimal cast (guards and the guide), cut from one sheet by tools/cut_cast.py.
import Phaser from "phaser";

export const CAST = ["molandak", "moyaki", "mouch", "salmonad", "mongrod"] as const;
export type CastName = (typeof CAST)[number];
const FRAME = 300;

export function loadCast(scene: Phaser.Scene) {
  if (!scene.textures.exists("cast")) scene.load.image("cast", "/sprites/monanimals.webp");
}

/** Register one frame per character. Returns false if the sheet isn't available. */
export function castReady(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists("cast")) return false;
  const tex = scene.textures.get("cast");
  CAST.forEach((name, i) => {
    if (!tex.has(name)) tex.add(name, 0, i * FRAME, 0, FRAME, FRAME);
  });
  return true;
}
