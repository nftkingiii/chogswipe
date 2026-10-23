// Set your hideout's traps. Click a room to place the selected trap; click a trap to remove it.
import Phaser from "phaser";
import {
  COLS,
  FLOORS,
  HIDEOUT_PLANS,
  LOCATIONS,
  ROOMS,
  ROOM_NAMES,
  ROOM_W,
  blockedSpots,
  colOf,
  floorOf,
  hideoutPlan,
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
import { ACCENT_N, FONT_BODY, FONT_TITLE, INK_N, button, panel, paperBackground, startHeist } from "./ui.js";
import { PAPER } from "./art.js";

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
  private planId = "house";
  private rooms!: Phaser.GameObjects.Container;
  private planName!: Phaser.GameObjects.Text;
  private planBlurb!: Phaser.GameObjects.Text;

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
    this.planId = hideoutPlan(chog.plan).id;
    this.kind = l.trap;

    this.add.text(42, 96, `Chog #${chog.id}'s hideout · ${l.tier}: up to ${l.stats.trapSlots} traps`, { fontFamily: FONT_BODY, fontSize: "24px", color: "#5a4d50" });

    // floor plan picker: the house, or the layout of any lore heist
    const step = (d: number) => {
      const i = HIDEOUT_PLANS.findIndex((p) => p.id === this.planId);
      this.planId = HIDEOUT_PLANS[(i + d + HIDEOUT_PLANS.length) % HIDEOUT_PLANS.length]!.id;
      this.drawRooms();
      this.redraw();
    };
    const arrow = (x: number, label: string, d: number) => {
      const t = this.add
        .text(x, 96, label, { fontFamily: FONT_TITLE, fontSize: "22px", color: PAPER, backgroundColor: "#1c1618", padding: { x: 10, y: 3 } })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", () => step(d));
    };
    this.add.text(640, 102, "FLOOR PLAN", { fontFamily: FONT_TITLE, fontSize: "16px", color: "#8a7d70" });
    arrow(770, "◀", -1);
    this.planName = this.add.text(1002, 98, "", { fontFamily: FONT_TITLE, fontSize: "22px", color: INK }).setOrigin(0.5, 0);
    arrow(1232, "▶", 1);
    this.planBlurb = this.add.text(42, 126, "", { fontFamily: FONT_BODY, fontSize: "16px", color: "#8a7d70", wordWrap: { width: 1190 } });

    this.rooms = this.add.container(0, 0);
    for (let r = 0; r < ROOMS; r++) {
      const x = boxX(r), y = boxY(r);
      const zone = this.add.zone(x, y + 30, BOX_W, BOX_H - 30).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.on("pointerdown", (p: Phaser.Input.Pointer) => this.place(r, Math.round(((p.x - x) / BOX_W) * ROOM_W)));
    }
    this.drawRooms();
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
    button(this, 1130, 660, 200, session.mode === "live" ? "Save" : "Save (trial)", () => this.save());
    this.redraw();
  }

  /** The six rooms for the chosen plan: links, vault, locked door, guards, hazards and the no-trap zones. */
  private drawRooms() {
    this.rooms.removeAll(true);
    const hp = hideoutPlan(this.planId);
    const plan = hp.plan;
    this.planName.setText(hp.name);
    this.planBlurb.setText(hp.blurb);
    const note = (x: number, y: number, text: string, color = "#8a7d70", size = 14) =>
      this.rooms.add(this.add.text(x, y, text, { fontFamily: FONT_BODY, fontSize: `${size}px`, color, align: "center" }).setOrigin(0.5, 0));
    const LINK_LABEL = { stairs: ["stairs ↑", "stairs ↓"], vent: ["vent", "vent"], launch: ["launch pad ↑", "landing"], portal: ["portal", "portal"] } as const;
    for (let r = 0; r < ROOMS; r++) {
      const x = boxX(r), y = boxY(r);
      this.rooms.add(panel(this, x, y, BOX_W, BOX_H, r === plan.vault.room ? 0xf6e3a8 : 0xfffaf0));
      this.rooms.add(this.add.text(x + 14, y + 10, ROOM_NAMES[r]!.toUpperCase(), { fontFamily: FONT_TITLE, fontSize: "16px", color: "#8a7d70" }));
      // no-trap zones: doorways, stairs, vents, pads, portals, the vault
      const g = this.add.graphics();
      this.rooms.add(g);
      for (const b of blockedSpots(plan).filter((b) => b.room === r)) {
        const x0 = Math.max(0, toBox(b.x - b.r)), x1 = Math.min(BOX_W, toBox(b.x + b.r));
        g.fillStyle(0x1c1618, 0.08).fillRect(x + x0, y + 34, x1 - x0, BOX_H - 44);
      }
      for (const h of plan.hazards.filter((h) => h.room === r)) {
        g.fillStyle(h.kind === "water" ? 0x7fc0d6 : 0xd8d8d8, 0.5).fillRect(x + toBox(h.x0), y + BOX_H - 44, toBox(h.x1 - h.x0), 14);
        note(x + toBox((h.x0 + h.x1) / 2), y + BOX_H - 62, h.kind === "water" ? "river" : "steam vents", "#4a7c8c");
      }
      g.lineStyle(3, INK_N, 1).lineBetween(x + 8, y + BOX_H - 30, x + BOX_W - 8, y + BOX_H - 30);
      for (const link of plan.links) {
        const end = link.a.room === r ? link.a : link.b.room === r ? link.b : null;
        if (end) note(x + toBox(end.x), y + 40, LINK_LABEL[link.kind][link.a.room === r ? 0 : 1], "#8a7d70", 15);
      }
      if (r === plan.vault.room) note(x + toBox(plan.vault.x), y + 70, "$ VAULT", "#c79a2a", 16);
      const d = plan.lockedDoor;
      if (d && r === d.left) this.rooms.add(this.add.text(x + BOX_W - 12, y + 70, "locked\ndoor", { fontFamily: FONT_BODY, fontSize: "14px", color: "#8a2a2a", align: "right" }).setOrigin(1, 0));
      if (r === 0) this.rooms.add(this.add.text(x + 12, y + 70, "entrance", { fontFamily: FONT_BODY, fontSize: "14px", color: "#8a7d70" }));
      const guards = plan.guards.filter((gd) => gd.room === r);
      if (guards.length) note(x + BOX_W / 2, y + BOX_H - 27, guards.some((gd) => gd.flies) ? "flying guard patrols here" : "guard patrols here");
    }
  }

  private place(room: number, x: number) {
    const hit = this.traps.findIndex((t) => t.room === room && Math.abs(t.x - x) < 50);
    if (hit >= 0) this.traps.splice(hit, 1);
    else this.traps.push({ room, x: Math.max(60, Math.min(ROOM_W - 60, x)), kind: this.kind });
    this.redraw();
  }

  private errors(): string[] {
    return validateHideout({ defender: loadoutFor(selectedChog().traits), traps: this.traps, plan: hideoutPlan(this.planId).plan });
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
      chog.plan = this.planId;
      this.status.setText("Saved for this trial only. A hideout that raiders really hit needs your own Chog.");
      return;
    }
    this.status.setText("Saving…");
    try {
      await saveHideout(chog.id, this.traps, this.planId);
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
    const hp = hideoutPlan(this.planId);
    const loc: Location = {
      ...LOCATIONS[0]!,
      id: chog.id,
      slug: `test-${chog.id}`,
      name: `Your hideout (test)`,
      traits: chog.traits,
      traps: [...this.traps],
      rooms: [...ROOM_NAMES] as Location["rooms"],
      guard: hp.guard,
      plan: hp.plan,
      loot: "nothing, it's a test",
    };
    startHeist(this, { chog, location: loc });
  }
}

export { ACCENT_N, COLS };
