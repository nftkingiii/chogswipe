// Set your hideout's traps. Click a room to place the selected trap; click a trap to remove it.
import Phaser from "phaser";
import {
  COLS,
  FLOORS,
  LINKS,
  LOCATIONS,
  LOCKED_DOOR,
  ROOMS,
  ROOM_NAMES,
  ROOM_W,
  VAULT_ROOM,
  VAULT_X,
  blockedSpots,
  colOf,
  floorOf,
  loadoutFor,
  validateHideout,
  type Location,
  type TrapKind,
  type TrapPlacement,
} from "@chogswipe/sim";
import { INK } from "./art.js";
import { saveHideout } from "./api.js";
import { bakeTraps } from "./art.js";
import { nav } from "./nav.js";
import { refresh, selectedChog, session } from "./session.js";
import { GADGET_INFO } from "./gadgetInfo.js";
import { ACCENT_N, FONT_BODY, FONT_TITLE, INK_N, button, panel, paperBackground } from "./ui.js";

const BOX_W = 360;
const BOX_H = 170;
const X0 = 48;
const Y0 = 150;

const boxX = (room: number) => X0 + colOf(room) * (BOX_W + 14);
const boxY = (room: number) => Y0 + (FLOORS - 1 - floorOf(room)) * (BOX_H + 18);
const toBox = (x: number) => (x / ROOM_W) * BOX_W;

export class HideoutScene extends Phaser.Scene {
  private traps: TrapPlacement[] = [];
  private kind: TrapKind = "Tripwire";
  private layer!: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Text;
  private palette: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("hideout");
  }

  create() {
    paperBackground(this);
    nav(this, "hideout");
    bakeTraps(this);
    const chog = selectedChog();
    const l = loadoutFor(chog.traits);
    this.traps = [...(chog.layout ?? [])];
    this.kind = l.trap;

    this.add.text(42, 100, `Chog #${chog.id}'s hideout · ${l.tier}: up to ${l.stats.trapSlots} traps`, { fontFamily: FONT_BODY, fontSize: "24px", color: "#5a4d50" });

    // floor plan
    for (let r = 0; r < ROOMS; r++) {
      const x = boxX(r), y = boxY(r);
      panel(this, x, y, BOX_W, BOX_H, r === VAULT_ROOM ? 0xf6e3a8 : 0xfffaf0);
      this.add.text(x + 14, y + 10, ROOM_NAMES[r]!.toUpperCase(), { fontFamily: FONT_TITLE, fontSize: "16px", color: "#8a7d70" });
      // no-trap zones: doorways, stairs, vents, the vault
      const g = this.add.graphics();
      for (const b of blockedSpots().filter((b) => b.room === r)) {
        g.fillStyle(0x1c1618, 0.08).fillRect(x + Math.max(0, toBox(b.x - b.r)), y + 34, Math.min(BOX_W, toBox(2 * b.r)), BOX_H - 44);
      }
      g.lineStyle(3, INK_N, 1).lineBetween(x + 8, y + BOX_H - 30, x + BOX_W - 8, y + BOX_H - 30);
      for (const link of LINKS) {
        const end = link.a.room === r ? link.a : link.b.room === r ? link.b : null;
        if (end) this.add.text(x + toBox(end.x), y + 40, link.kind === "vent" ? "vent" : link.a.room === r ? "stairs ↑" : "stairs ↓", { fontFamily: FONT_BODY, fontSize: "15px", color: "#8a7d70" }).setOrigin(0.5, 0);
      }
      if (r === VAULT_ROOM) this.add.text(x + toBox(VAULT_X), y + 70, "$ VAULT", { fontFamily: FONT_TITLE, fontSize: "16px", color: "#c79a2a" }).setOrigin(0.5, 0);
      if (r === LOCKED_DOOR.left) this.add.text(x + BOX_W - 12, y + 70, "locked\ndoor", { fontFamily: FONT_BODY, fontSize: "14px", color: "#8a2a2a", align: "right" }).setOrigin(1, 0);
      if (r === 0) this.add.text(x + 12, y + 70, "entrance", { fontFamily: FONT_BODY, fontSize: "14px", color: "#8a7d70" });
      if (r === 2) this.add.text(x + BOX_W / 2, y + 40, "guard patrols here", { fontFamily: FONT_BODY, fontSize: "14px", color: "#8a7d70" }).setOrigin(0.5, 0);
      const zone = this.add.zone(x, y + 30, BOX_W, BOX_H - 30).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.on("pointerdown", (p: Phaser.Input.Pointer) => this.place(r, Math.round(((p.x - x) / BOX_W) * ROOM_W)));
    }
    this.layer = this.add.container(0, 0);

    // trap palette
    panel(this, X0, 540, 700, 150);
    this.add.text(X0 + 20, 552, "PICK A TRAP", { fontFamily: FONT_TITLE, fontSize: "16px", color: "#8a7d70" });
    const kinds: TrapKind[] = l.trap === "Tripwire" ? ["Tripwire"] : [l.trap, "Tripwire"];
    kinds.forEach((k, i) => {
      const t = this.add
        .text(X0 + 20 + i * 250, 584, k, { fontFamily: FONT_TITLE, fontSize: "22px", color: INK, padding: { x: 10, y: 6 } })
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", () => {
        this.kind = k;
        this.redraw();
      });
      this.add.text(X0 + 30 + i * 250, 626, GADGET_INFO[k] ?? "", { fontFamily: FONT_BODY, fontSize: "17px", color: "#5a4d50", wordWrap: { width: 230 } });
      this.palette.push(t);
    });
    this.add.text(X0 + 20, 664, "Your Mouth trait gives you one signature trap. Tripwires are free for everyone.", { fontFamily: FONT_BODY, fontSize: "15px", color: "#8a7d70" });

    this.status = this.add.text(800, 552, "", { fontFamily: FONT_BODY, fontSize: "20px", color: INK, wordWrap: { width: 440 } });
    button(this, 900, 660, 200, "Test it", () => this.test(), false);
    button(this, 1130, 660, 200, session.mode === "live" ? "Save" : "Save (demo)", () => this.save());
    this.redraw();
  }

  private place(room: number, x: number) {
    const hit = this.traps.findIndex((t) => t.room === room && Math.abs(t.x - x) < 50);
    if (hit >= 0) this.traps.splice(hit, 1);
    else this.traps.push({ room, x: Math.max(60, Math.min(ROOM_W - 60, x)), kind: this.kind });
    this.redraw();
  }

  private errors(): string[] {
    return validateHideout({ defender: loadoutFor(selectedChog().traits), traps: this.traps });
  }

  private redraw() {
    this.layer.removeAll(true);
    this.traps.forEach((t) => {
      const img = this.add.image(boxX(t.room) + toBox(t.x), boxY(t.room) + BOX_H - 28, `trap:${t.kind}_0`).setOrigin(0.5, 1).setScale(0.62);
      this.layer.add(img);
    });
    this.palette.forEach((p) => p.setBackgroundColor(p.text === this.kind ? "#f6e3a8" : "#fffaf0"));
    const l = loadoutFor(selectedChog().traits);
    const errs = this.errors();
    this.status.setText(
      `${this.traps.length} / ${l.stats.trapSlots} traps placed\n` +
        (errs.length ? `⚠ ${errs[0]}` : this.traps.length ? "Layout is valid." : "Click a room to place a trap. Click a trap to remove it."),
    );
    this.status.setColor(errs.length ? "#c0392b" : INK);
  }

  private async save() {
    if (this.errors().length) return;
    const chog = selectedChog();
    if (session.mode !== "live") {
      chog.layout = [...this.traps];
      this.status.setText("Saved for this demo session. Connect a wallet to save it for real.");
      return;
    }
    this.status.setText("Saving…");
    try {
      await saveHideout(chog.id, this.traps);
      await refresh();
      this.status.setText("Saved. Raiders will face this layout.");
    } catch (e) {
      this.status.setText(`Not saved: ${(e as Error).message}`).setColor("#c0392b");
    }
  }

  /** Raid your own layout on autopilot-free play, as a demo heist. */
  private test() {
    if (this.errors().length) return;
    const chog = selectedChog();
    const loc: Location = {
      ...LOCATIONS[0]!,
      id: chog.id,
      slug: `test-${chog.id}`,
      name: `Your hideout (test)`,
      traits: chog.traits,
      traps: [...this.traps],
      rooms: [...ROOM_NAMES] as Location["rooms"],
      guard: "fwog",
      loot: "nothing, it's a test",
    };
    this.scene.start("raid", { chog, location: loc });
  }
}

export { ACCENT_N, COLS };
