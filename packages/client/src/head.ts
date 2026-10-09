// Die-cut sticker head made in the browser from a Chog cut-out: anything the
// NFT crop cut flat becomes a smooth arc, then a white border and an ink rim.
import { INK } from "./art.js";

export const HEAD_PX = 300;
const BORDER = 10;
const RIM = 6;

function ringStamp(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, r: number, color: string, x: number, y: number) {
  const tmp = document.createElement("canvas");
  tmp.width = src.width + r * 2;
  tmp.height = src.height + r * 2;
  const t = tmp.getContext("2d")!;
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2;
    t.drawImage(src, r + Math.cos(ang) * r, r + Math.sin(ang) * r);
  }
  t.drawImage(src, r, r);
  t.globalCompositeOperation = "source-in";
  t.fillStyle = color;
  t.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(tmp, x - r, y - r);
}

export function makeStickerHead(scene: Phaser.Scene, sourceKey: string, outKey: string) {
  const img = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
  const S = HEAD_PX;
  // 1. cut-out clipped to a circle so frame-edge crops become arcs
  const clip = document.createElement("canvas");
  clip.width = S;
  clip.height = S;
  const c = clip.getContext("2d")!;
  c.beginPath();
  c.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  c.clip();
  c.drawImage(img, 0, 0, S, S);

  // 2. ink rim, white die-cut border, then the art
  const pad = BORDER + RIM + 4;
  const out = document.createElement("canvas");
  out.width = S + pad * 2;
  out.height = S + pad * 2;
  const o = out.getContext("2d")!;
  ringStamp(o, clip, BORDER + RIM, INK, pad, pad);
  ringStamp(o, clip, BORDER, "#fffaf0", pad, pad);
  o.drawImage(clip, pad, pad);
  scene.textures.addCanvas(outKey, out);
}
