// Pick a funded, unshielded hideout to raid: other holders and the lore houses.
import Phaser from "phaser";
import { LOCATIONS, loadoutFor } from "@chogswipe/sim";
import { formatUnits } from "viem";
import { INK } from "./art.js";
import { startRaid, targets, type Target } from "./api.js";
import { castReady, loadCast } from "./cast.js";
import { needsWallet, nav } from "./nav.js";
import { selectedChog } from "./session.js";
import { portraitImage } from "./portraits.js";
import { FONT_BODY, FONT_TITLE, INK_N, button, notice, panel, paperBackground } from "./ui.js";

const chog = (wei: string) => Number(formatUnits(BigInt(wei), 18)).toLocaleString(undefined, { maximumFractionDigits: 0 });

export class PlayersScene extends Phaser.Scene {
  constructor() {
    super("players");
  }

  preload() {
    loadCast(this);
  }

  create() {
    paperBackground(this);
    nav(this, "players");
    if (needsWallet(this, "Raid other holders' hideouts and swipe real $CHOG.")) return;
    const me = selectedChog();
    this.add.text(42, 100, `Raiding as Chog #${me.id}. Each raid can take up to 10% of a vault.`, { fontFamily: FONT_BODY, fontSize: "24px", color: "#5a4d50" });
    const loading = notice(this, "Finding hideouts…");
    targets()
      .then(({ targets }) => {
        loading.destroy();
        if (!targets.length) {
          notice(this, "No funded hideouts to raid right now. Check back soon, or fund your own vault to become a target.");
          return;
        }
        this.list(targets);
      })
      .catch((e) => loading.setText(`Couldn't load targets: ${(e as Error).message}`));
  }

  private list(list: Target[]) {
    const me = selectedChog();
    list.slice(0, 8).forEach((t, i) => {
      const x = 42 + (i % 4) * 302;
      const y = 150 + Math.floor(i / 4) * 270;
      panel(this, x, y, 284, 250);
      const loc = LOCATIONS.find((l) => l.id === t.id);
      if (t.image) portraitImage(this, x + 64, y + 66, `portrait:${t.id}`, t.image, 96);
      else if (loc && loc.guard !== "fwog" && castReady(this)) this.add.image(x + 64, y + 112, "cast", loc.guard).setOrigin(0.5, 1).setScale(0.32);
      else this.add.text(x + 64, y + 66, "🐸", { fontSize: "54px" }).setOrigin(0.5);
      this.add.graphics().lineStyle(4, INK_N, 1).strokeRoundedRect(x + 16, y + 18, 96, 96, 10);
      this.add.text(x + 126, y + 20, t.house ? t.name : `Chog #${t.id}`, { fontFamily: FONT_TITLE, fontSize: "20px", color: INK, wordWrap: { width: 148 } });
      const l = loadoutFor(t.traits);
      this.add.text(x + 126, y + 76, `${l.tier} · ${t.house ? "lore house" : "holder"}`, { fontFamily: FONT_BODY, fontSize: "17px", color: "#5a4d50" });
      this.add.text(x + 18, y + 128, `${chog(t.vault?.balance ?? "0")} $CHOG in the vault`, { fontFamily: FONT_TITLE, fontSize: "18px", color: "#c79a2a" });
      this.add.text(x + 18, y + 156, `Traps: mostly ${l.trap}`, { fontFamily: FONT_BODY, fontSize: "17px", color: "#5a4d50" });
      button(this, x + 142, y + 214, 248, "Raid", async () => {
        const msg = notice(this, "Asking the referee to open a raid…");
        try {
          const start = await startRaid(me.id, t.id);
          this.scene.start("raid", { chog: me, live: { start, target: { id: t.id, name: t.house ? t.name : `Chog #${t.id}'s hideout`, traits: t.traits } } });
        } catch (e) {
          msg.setText(`Can't raid: ${(e as Error).message}`);
          this.time.delayedCall(3500, () => msg.destroy());
        }
      });
    });
  }
}
