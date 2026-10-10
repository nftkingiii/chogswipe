// Fitting the game to the screen. The game is always 720 tall; its width follows the
// screen's shape (1280 at 16:9, up to MAX_W on wide laptops and phones held sideways),
// so it fills the window instead of sitting between black bars.
import type Phaser from "phaser";

const H = 720;
const MIN_W = 1280;
const MAX_W = 1720;

export function gameWidth(): number {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  return Math.round(Math.min(MAX_W, Math.max(MIN_W, H * aspect)));
}

export const GAME_H = H;

/** Resize the game with the window. Menu screens are rebuilt for the new width; a raid keeps going. */
export function fitToWindow(game: Phaser.Game) {
  let timer = 0;
  const apply = () => {
    const w = gameWidth();
    if (w === game.scale.width) return game.scale.refresh();
    game.scale.setGameSize(w, H);
    for (const s of game.scene.getScenes(true)) if (s.scene.key !== "raid") s.scene.restart();
  };
  window.addEventListener("resize", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(apply, 150);
  });
}

const isPhone = () => matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;

/**
 * On phones, the first tap goes full screen and locks to landscape where the browser allows it
 * (Android Chrome does; iPhone Safari doesn't, so there the rotate prompt does the work).
 */
export function phoneFullscreen() {
  if (!isPhone()) return;
  document.documentElement.classList.add("phone");
  const go = async () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    try {
      if (!document.fullscreenElement) await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.());
    } catch {
      /* not allowed here; the game still fills the visible area */
    }
    try {
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
    } catch {
      /* orientation lock needs full screen and isn't supported everywhere */
    }
  };
  window.addEventListener("pointerup", go, { passive: true });
}
