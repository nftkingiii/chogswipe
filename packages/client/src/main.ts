import Phaser from "phaser";
import { finishLoader, startLoader } from "./loader.js";
import { LoadoutScene } from "./loadoutScene.js";
import { MapScene } from "./mapScene.js";
import { RaidScene } from "./raidScene.js";
import { HideoutScene } from "./hideoutScene.js";
import { PlayersScene } from "./playersScene.js";
import { VaultScene } from "./vaultScene.js";
import { HistoryScene } from "./historyScene.js";
import { GAME_H, fitToWindow, gameWidth, phoneFullscreen } from "./screen.js";

startLoader();
phoneFullscreen();

async function start() {
  // Hand-drawn fonts are used inside canvas textures, so wait for them first.
  await Promise.all([document.fonts.load("32px 'Luckiest Guy'"), document.fonts.load("20px 'Patrick Hand'")]).catch(() => {});
  const game = new Phaser.Game({
    type: new URLSearchParams(location.search).has("canvas") ? Phaser.CANVAS : Phaser.AUTO,
    parent: "game",
    width: gameWidth(),
    height: GAME_H,
    backgroundColor: "#1c1618",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // ?autopilot jumps straight into a demo raid; otherwise start at the loadout screen
    scene: new URLSearchParams(location.search).has("autopilot") ? [RaidScene, LoadoutScene, MapScene, PlayersScene, HideoutScene, VaultScene, HistoryScene]
      : [LoadoutScene, MapScene, RaidScene, PlayersScene, HideoutScene, VaultScene, HistoryScene],
  });
  (window as unknown as { game: Phaser.Game }).game = game;
  fitToWindow(game);
  finishLoader(game);
}

void start();
