import Phaser from "phaser";
import { RaidScene } from "./raidScene.js";

async function start() {
  // Hand-drawn fonts are used inside canvas textures, so wait for them first.
  await Promise.all([document.fonts.load("32px 'Luckiest Guy'"), document.fonts.load("20px 'Patrick Hand'")]).catch(() => {});
  const game = new Phaser.Game({
    type: new URLSearchParams(location.search).has("canvas") ? Phaser.CANVAS : Phaser.AUTO,
    parent: "game",
    width: 1280,
    height: 720,
    backgroundColor: "#1c1618",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [RaidScene],
  });
  (window as unknown as { game: Phaser.Game }).game = game;
}

void start();
