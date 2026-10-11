// The top bar for menu screens, wired to the session (demo vs signed-in holder).
import Phaser from "phaser";
import { HOLDER_MODE, goDemo, goLive, session } from "./session.js";
import { DESIGN_W, notice, topNav } from "./ui.js";
import { showGuide } from "./guide.js";
import { onAccountsChanged } from "./wallet.js";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

let watching = false;

export function nav(scene: Phaser.Scene, active: string) {
  if (!watching) {
    watching = true;
    // switching accounts in the wallet signs this one out; the player reconnects as the new one
    onAccountsChanged(() => {
      if (session.mode !== "live") return;
      goDemo();
      for (const s of scene.game.scene.getScenes(true)) if (s.scene.key !== "raid") s.scene.restart();
    });
  }
  const live = session.mode === "live" && session.address;
  topNav(scene, active, {
    label: live ? short(session.address!) : "Connect wallet",
    disabled: !HOLDER_MODE,
    onClick: async () => {
      if (!HOLDER_MODE) {
        // public demo: the button is there, faint, until holder mode launches
        const msg = notice(scene, "Wallets open at full launch, for Chog holders.\nUntil then the demo is open to everyone: play, and tell us what you think!");
        scene.time.delayedCall(3500, () => msg.destroy());
        return;
      }
      if (live) {
        goDemo();
        scene.scene.restart();
        return;
      }
      const msg = notice(scene, "Check your wallet: connect, switch to Monad, then sign the free sign-in message.");
      try {
        await goLive();
        scene.scene.restart();
      } catch (e) {
        msg.setText(`Couldn't sign in: ${(e as Error).message}`);
        scene.time.delayedCall(4000, () => msg.destroy());
      }
    },
  }, () => showGuide(scene));
  if (!live) {
    scene.add
      .text(DESIGN_W - 40, 76, HOLDER_MODE ? "DEMO · connect a wallet holding a Chog to play for real" : "PUBLIC DEMO · open to everyone · holder mode launches soon", {
        fontFamily: "'Patrick Hand', sans-serif",
        fontSize: "16px",
        color: "#1c1618",
        backgroundColor: "#f0c35a",
        padding: { x: 8, y: 2 },
      })
      .setOrigin(1, 0);
  }
}

/** Shown on tabs that need a signed-in holder. */
export function needsWallet(scene: Phaser.Scene, what: string): boolean {
  if (session.mode === "live") return false;
  notice(
    scene,
    HOLDER_MODE
      ? `${what}\n\nConnect a wallet that holds a Chog (top right) to use this tab.`
      : `${what}\n\nThis opens to Chog holders at full launch. For now, try the heists: the demo is open to everyone.`,
  );
  return true;
}
