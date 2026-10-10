// The top bar for menu screens, wired to the session (demo vs signed-in holder).
import Phaser from "phaser";
import { goDemo, goLive, session } from "./session.js";
import { notice, topNav } from "./ui.js";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function nav(scene: Phaser.Scene, active: string) {
  const live = session.mode === "live" && session.address;
  topNav(scene, active, {
    label: live ? short(session.address!) : "Connect wallet",
    onClick: async () => {
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
  });
  if (!live) {
    scene.add
      .text(scene.scale.width - 40, 76, "DEMO · connect a wallet holding a Chog to play for real", {
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
  notice(scene, `${what}\n\nConnect a wallet that holds a Chog (top right) to use this tab.`);
  return true;
}
