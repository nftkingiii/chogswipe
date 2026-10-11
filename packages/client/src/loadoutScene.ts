// Pick a Chog. Its NFT traits become its gadgets, and its look comes from them too.
import Phaser from "phaser";
import { loadoutFor, type Loadout } from "@chogswipe/sim";
import { INK, PAPER } from "./art.js";
import { ChogSprite, makeChogTexture } from "./chogSprite.js";
import { GADGET_INFO } from "./gadgetInfo.js";
import { bakeFx } from "./puppet.js";
import type { RosterChog } from "./roster.js";
import { imageUrl, selectChog, session } from "./session.js";
import { nav } from "./nav.js";
import { advance, onboardStep } from "./onboarding.js";
import { castReady, loadCast } from "./cast.js";
import { portraitImage } from "./portraits.js";
import { guideSeen, showGuide } from "./guide.js";
import { ACCENT_N, DESIGN_W, FONT_BODY, FONT_TITLE, INK_N, button, panel, paperBackground, poseState } from "./ui.js";

const TIER_COLOR: Record<string, string> = {
  Common: "#8a7d70",
  Uncommon: "#3fa34d",
  Rare: "#4a7fd6",
  Epic: "#7e5ce0",
  Legendary: "#e09a1a",
};

export class LoadoutScene extends Phaser.Scene {
  private selected = 0;
  private preview: ChogSprite | null = null;
  private detail: Phaser.GameObjects.GameObject[] = [];
  private cards: Phaser.GameObjects.Graphics[] = [];
  private t = 0;

  constructor() {
    super("loadout");
  }

  init(data: { chog?: RosterChog }) {
    if (data.chog) selectChog(data.chog.id);
    this.selected = session.selected;
    this.preview = null;
    this.detail = [];
    this.cards = [];
  }

  preload() {
    this.load.image("chog-sheet", "/sprites/chog.webp");
    loadCast(this);
    // NFT portraits load in the background (portraitImage), so a slow IPFS gateway never blanks the screen
  }

  create() {
    paperBackground(this);
    bakeFx(this);
    const W = DESIGN_W;

    nav(this, "loadout");
    this.add.text(42, 100, session.mode === "live" ? "Your Chogs. Their traits become their gadgets." : "Pick a Chog. Its traits become its gadgets.", {
      fontFamily: FONT_BODY,
      fontSize: "24px",
      color: "#5a4d50",
    });
    if (session.chogs.length === 0) {
      this.add.text(W / 2, 360, "This wallet holds no Chogs yet.", { fontFamily: FONT_TITLE, fontSize: "30px", color: INK }).setOrigin(0.5);
      return;
    }

    // roster strip
    session.chogs.slice(0, 8).forEach((c, i) => {
      const x = 60 + i * 112;
      const y = 600;
      const g = this.add.graphics();
      this.cards.push(g);
      portraitImage(this, x + 48, y + 44, `portrait:${c.id}`, imageUrl(c), 86, true);
      this.add.text(x + 48, y + 98, `#${c.id}`, { fontFamily: FONT_TITLE, fontSize: "18px", color: INK }).setOrigin(0.5, 0);
      const hit = this.add.zone(x, y - 4, 96, 130).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.select(i));
    });

    button(this, W - 210, 650, 320, "Choose a heist →", () => {
      if (onboardStep() === "pick") advance("heist");
      this.scene.start("map", { chog: session.chogs[this.selected] });
    });
    if (onboardStep() === "pick") this.welcome();
    this.select(this.selected);
    if (!guideSeen()) showGuide(this); // first visit: how to play, once
  }

  /** First visit: Molandak explains the one thing to do here. */
  private welcome() {
    const g = this.add.graphics().setDepth(50);
    g.fillStyle(0x1c1618, 1).fillRoundedRect(620 + 6, 588 + 6, 280, 110, 18);
    g.fillStyle(0xfffaf0, 1).fillRoundedRect(620, 588, 280, 110, 18);
    g.lineStyle(4, 0x1c1618, 1).strokeRoundedRect(620, 588, 280, 110, 18);
    if (castReady(this)) this.add.image(664, 694, "cast", "molandak").setOrigin(0.5, 1).setScale(0.33).setDepth(51);
    this.add.text(706, 598, "MOLANDAK", { fontFamily: FONT_TITLE, fontSize: "15px", color: "#7e5ce0" }).setDepth(51);
    this.add
      .text(706, 618, "Welcome, thief! Tap a Chog to see its gadgets, then choose a heist.", { fontFamily: FONT_BODY, fontSize: "17px", color: INK, wordWrap: { width: 186 } })
      .setDepth(51);
  }

  private select(i: number) {
    this.selected = i;
    session.selected = i;
    this.cards.forEach((g, j) => {
      const x = 60 + j * 112;
      g.clear();
      g.fillStyle(j === i ? ACCENT_N : 0xfffaf0, 1).fillCircle(x + 48, 644, 50);
      g.lineStyle(4, INK_N, 1).strokeCircle(x + 48, 644, 50);
    });
    this.detail.forEach((o) => o.destroy());
    this.detail = [];
    const chog = session.chogs[i]!;
    const l = loadoutFor(chog.traits);

    // stage with the in-game Chog wearing its traits
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.detail.push(o), o);
    keep(panel(this, 48, 150, 420, 420, 0xf7efe2));
    keep(this.add.ellipse(258, 500, 240, 40, INK_N, 0.12));
    makeChogTexture(this, chog.traits.Skin, `chog-${chog.id}`);
    this.preview?.destroy();
    this.preview = new ChogSprite(this, `chog-${chog.id}`, 492, chog.traits);
    this.preview.root.setScale(1.35);
    keep(this.add.text(258, 172, "IN GAME", { fontFamily: FONT_BODY, fontSize: "18px", color: "#8a7d70" }).setOrigin(0.5, 0));

    // the NFT and how each trait turns into a gadget
    keep(panel(this, 500, 150, 732, 420));
    keep(portraitImage(this, 588, 238, `portrait:${chog.id}`, imageUrl(chog), 140));
    keep(this.add.graphics().lineStyle(4, INK_N, 1).strokeRoundedRect(518, 168, 140, 140, 10));
    keep(this.add.text(678, 172, `CHOG #${chog.id}`, { fontFamily: FONT_TITLE, fontSize: "34px", color: INK }));
    keep(
      this.add.text(680, 216, l.tier.toUpperCase(), {
        fontFamily: FONT_TITLE,
        fontSize: "18px",
        color: PAPER,
        backgroundColor: TIER_COLOR[l.tier],
        padding: { x: 10, y: 4 },
      }),
    );
    keep(
      this.add.text(680, 256, `${l.stats.trapSlots} trap slots · ×${(l.stats.power / 100).toFixed(2)} power · ${l.stats.raidsPerDay} raids a day`, {
        fontFamily: FONT_BODY,
        fontSize: "20px",
        color: "#5a4d50",
      }),
    );

    const rows: [string, string | undefined, string | null, string][] = [
      ["MOUTH", chog.traits.Mouth, l.trap, "trap"],
      ["EYES", chog.traits.Eyes, l.scout, "scout"],
      ["HEAD", chog.traits.Head, l.head, "perk"],
      ["BODY", chog.traits.Naked === "Yes" ? "Naked" : chog.traits.Body, l.body, "move"],
      ["ACCESSORY", chog.traits.Accessory, l.special, "special"],
      ["AURA", chog.traits.Aura, l.aura, "aura"],
    ];
    rows.forEach(([slot, trait, gadget, kind], r) => {
      const y = 330 + r * 38;
      const on = !!gadget;
      keep(this.add.text(524, y, slot, { fontFamily: FONT_TITLE, fontSize: "16px", color: "#8a7d70" }));
      keep(this.add.text(640, y - 2, trait ?? "—", { fontFamily: FONT_BODY, fontSize: "21px", color: on ? INK : "#b5aa9c" }));
      keep(this.add.text(842, y - 2, "→", { fontFamily: FONT_TITLE, fontSize: "20px", color: "#8a7d70" }));
      const g = keep(
        this.add.text(876, y - 4, gadget ?? "nothing", {
          fontFamily: FONT_TITLE,
          fontSize: "20px",
          color: on ? INK : "#b5aa9c",
          backgroundColor: on ? "#f6e3a8" : undefined,
          padding: on ? { x: 8, y: 2 } : undefined,
        }),
      );
      if (on) {
        const d = keep(this.add.text(876 + g.width + 12, y + 1, GADGET_INFO[gadget!] ?? "", { fontFamily: FONT_BODY, fontSize: "16px", color: "#5a4d50" }));
        // keep descriptions inside the panel
        const room = 1212 - d.x;
        if (d.width > room) d.setScale(Math.max(0.7, room / d.width), 1);
        void kind;
      }
    });
    void (l satisfies Loadout);
  }

  update(_t: number, dt: number) {
    if (!this.preview) return;
    this.t += dt / 33;
    const tick = Math.floor(this.t);
    // idle with an occasional victory hop
    this.preview.update(poseState(tick % 150 > 120 ? "win" : "idle", tick), 258, 492, dt);
  }
}
