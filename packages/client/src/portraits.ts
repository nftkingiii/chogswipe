// NFT portraits come from IPFS, which can be slow or hang outright. Screens never wait for them:
// they draw a placeholder straight away and swap the picture in when (if) it arrives.
import Phaser from "phaser";
import { roundTexture } from "./ui.js";

const TIMEOUT_MS = 10_000;
const PLACEHOLDER = "portrait:placeholder";
const failed = new Set<string>();
const inflight = new Map<string, Promise<boolean>>();

/** Fetch one portrait into the texture manager. Resolves false on error or timeout; never rejects. */
export function loadPortrait(scene: Phaser.Scene, key: string, url: string): Promise<boolean> {
  const textures = scene.textures;
  if (textures.exists(key)) return Promise.resolve(true);
  if (!url || failed.has(url)) return Promise.resolve(false);
  const known = inflight.get(key);
  if (known) return known;
  const p = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => done(false), TIMEOUT_MS);
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      img.onload = img.onerror = null;
      inflight.delete(key);
      if (!ok) {
        failed.add(url);
        img.src = "";
      } else if (!textures.exists(key)) textures.addImage(key, img);
      resolve(ok);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url;
  });
  inflight.set(key, p);
  return p;
}

function placeholder(scene: Phaser.Scene): string {
  if (scene.textures.exists(PLACEHOLDER)) return PLACEHOLDER;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e9dcc6";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#b5aa9c";
  ctx.beginPath();
  ctx.arc(64, 54, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(64, 122, 46, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(PLACEHOLDER, c);
  return PLACEHOLDER;
}

/** An image showing the portrait when it's ready, a silhouette until then. */
export function portraitImage(scene: Phaser.Scene, x: number, y: number, key: string, url: string, size: number, round = false) {
  const tex = () => (round ? roundTexture(scene, key) : key);
  const img = scene.add.image(x, y, scene.textures.exists(key) ? tex() : round ? roundTexture(scene, placeholder(scene)) : placeholder(scene));
  img.setDisplaySize(size, size);
  if (!scene.textures.exists(key)) {
    void loadPortrait(scene, key, url).then((ok) => {
      if (ok && img.active && img.scene) img.setTexture(tex()).setDisplaySize(size, size);
    });
  }
  return img;
}
