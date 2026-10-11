// Raids against your hideout, with replays.
import Phaser from "phaser";
import { formatUnits } from "viem";
import { INK } from "./art.js";
import { raidsAgainst, type Replay } from "./api.js";
import { needsWallet, nav } from "./nav.js";
import { selectedChog } from "./session.js";
import { FONT_BODY, FONT_TITLE, button, notice, panel, paperBackground } from "./ui.js";

export class HistoryScene extends Phaser.Scene {
  constructor() {
    super("history");
  }

  create() {
    paperBackground(this);
    nav(this, "history");
    if (needsWallet(this, "See who raided your hideout, what they took, and watch the replay.")) return;
    const me = selectedChog();
    this.add.text(42, 100, `Raids on Chog #${me.id}'s hideout`, { fontFamily: FONT_BODY, fontSize: "24px", color: "#5a4d50" });
    const loading = notice(this, "Loading raids…");
    raidsAgainst(me.id)
      .then(({ raids }) => {
        loading.destroy();
        if (!raids.length) {
          notice(this, "Nobody has raided this hideout yet.\nSet your traps in the Hideout tab and fund your vault to attract raiders.");
          return;
        }
        raids.slice(0, 6).forEach((r, i) => this.row(r, i));
      })
      .catch((e) => loading.setText(`Couldn't load raids: ${(e as Error).message}`));
  }

  private row(r: Replay, i: number) {
    const me = selectedChog();
    const y = 150 + i * 88;
    panel(this, 42, y, 1196, 74);
    const when = new Date(r.startedAt).toLocaleString();
    const got = r.amount !== "0";
    const result = r.outcome?.result ?? "unfinished";
    this.add.text(66, y + 12, `Chog #${r.raiderToken}`, { fontFamily: FONT_TITLE, fontSize: "22px", color: INK });
    this.add.text(66, y + 42, when, { fontFamily: FONT_BODY, fontSize: "16px", color: "#8a7d70" });
    this.add.text(300, y + 22, result === "escaped" ? "escaped" : result === "knocked-out" ? "knocked out by your traps" : result === "caught" ? "caught by your guard" : result === "timeout" ? "ran out of time" : "left mid-raid", {
      fontFamily: FONT_BODY,
      fontSize: "21px",
      color: result === "escaped" ? "#c0392b" : "#3fa34d",
    });
    this.add.text(640, y + 20, got ? `took ${Number(formatUnits(BigInt(r.amount), 18)).toLocaleString()} $CHOG` : "took nothing", {
      fontFamily: FONT_TITLE,
      fontSize: "20px",
      color: got ? "#c79a2a" : "#8a7d70",
    });
    if (r.inputs)
      button(this, 1110, y + 37, 180, "Watch", () =>
        this.scene.start("raid", {
          replay: { inputs: r.inputs, seed: r.seed, traps: r.traps, raider: r.raider, defender: me, name: `Raid on Chog #${me.id}` },
        }),
      false);
  }
}
