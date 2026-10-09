// The heist map: lore locations along a jungle path, unlocked in order.
import Phaser from "phaser";
import { LOCATIONS, loadoutFor, type Location } from "@chogswipe/sim";
import { bake, grain, ink, INK, PAPER } from "./art.js";
import { cleared } from "./progress.js";
import { DEMO_ROSTER, type RosterChog } from "./roster.js";
import { themeFor } from "./theme.js";
import { ACCENT_N, FONT_BODY, FONT_TITLE, INK_N, button, panel } from "./ui.js";

// node positions along the path, left to right, winding up and down
const NODES: [number, number][] = [
  [120, 520],
  [270, 360],
  [420, 520],
  [560, 330],
  [700, 500],
  [820, 300],
  [930, 470],
];

const GUIDE_TIPS = [
  "Traps hide until you scout. Press Q to use your eyes.",
  "Space jumps traps. It also jumps the guard if you time it.",
  "Hold F at the vault to swipe. Hold F at a locked door to pick it.",
  "↑ at the stairs goes up, ↓ comes back down. Vents need a Plumber hat.",
  "You keep the loot only if you make it back out of the front door.",
];

export class MapScene extends Phaser.Scene {
  private chog!: RosterChog;
  private card: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("map");
  }

  init(data: { chog?: RosterChog }) {
    this.chog = data.chog ?? DEMO_ROSTER[0]!;
    this.card = [];
  }

  create() {
    const { width: W, height: H } = this.scale;
    bake(this, "jungle", W, H, (ctx, rc, s) => {
      ctx.fillStyle = "#cfe0b4";
      ctx.fillRect(0, 0, W, H);
      // river
      rc.path(`M -20 ${H * 0.86} C 300 ${H * 0.7}, 600 ${H * 0.98}, 1300 ${H * 0.8}`, ink(s, { stroke: "#7fc0d6", strokeWidth: 46, roughness: 2 }));
      // trees and bushes
      for (let i = 0; i < 40; i++) {
        const x = (i * 157) % W;
        const y = 150 + ((i * 89) % (H - 220));
        rc.circle(x, y, 40 + (i % 5) * 12, ink(s + i, { fill: i % 3 ? "#8fbf6a" : "#6fa65a", fillStyle: "solid", strokeWidth: 3 }));
      }
      // the Elder Tree at the end
      rc.rectangle(1010, 260, 60, 220, ink(s + 99, { fill: "#7a5638", fillStyle: "solid" }));
      rc.circle(1040, 220, 220, ink(s + 100, { fill: "#4f8a4a", fillStyle: "solid" }));
      // dotted path between nodes
      for (let i = 0; i < NODES.length - 1; i++) {
        const [x0, y0] = NODES[i]!, [x1, y1] = NODES[i + 1]!;
        rc.line(x0, y0, x1, y1, ink(s + 200 + i, { strokeWidth: 6, stroke: "#f3eadb", roughness: 2.4 }));
      }
      grain(ctx, W, H, 14, s);
    });
    const bg = this.add.image(0, 0, "jungle_0").setOrigin(0, 0);
    let f = 0;
    this.time.addEvent({ delay: 200, loop: true, callback: () => bg.setTexture(`jungle_${(f = (f + 1) % 3)}`) });

    this.add.text(40, 26, "THE MONADVERSE HEISTS", { fontFamily: FONT_TITLE, fontSize: "44px", color: INK });
    this.add.text(42, 78, `Raiding as Chog #${this.chog.id}. Clear a heist to unlock the next.`, { fontFamily: FONT_BODY, fontSize: "24px", color: "#3b3033" });
    button(this, 1150, 60, 200, "Change Chog", () => this.scene.start("loadout", { chog: this.chog }), false);

    const done = cleared();
    const unlocked = (l: Location) => !l.unlockAfter || done.has(l.unlockAfter);
    let next = LOCATIONS.findIndex((l) => unlocked(l) && !done.has(l.slug));
    if (next < 0) next = LOCATIONS.length - 1;

    LOCATIONS.forEach((loc, i) => {
      const [x, y] = NODES[i]!;
      const open = unlocked(loc);
      const won = done.has(loc.slug);
      const color = Number.parseInt(themeFor(loc.traits.Background).accent.slice(1), 16);
      const g = this.add.graphics();
      g.fillStyle(INK_N, 1).fillCircle(x + 4, y + 6, 38);
      g.fillStyle(open ? color : 0x9a948c, 1).fillCircle(x, y, 38);
      g.lineStyle(5, INK_N, 1).strokeCircle(x, y, 38);
      this.add.text(x, y, won ? "✓" : open ? String(i + 1) : "🔒", { fontFamily: FONT_TITLE, fontSize: won || open ? "34px" : "26px", color: PAPER }).setOrigin(0.5);
      this.add
        .text(x, y + 46, loc.name, { fontFamily: FONT_TITLE, fontSize: "17px", color: INK, backgroundColor: "rgba(243,234,219,0.85)", padding: { x: 6, y: 2 } })
        .setOrigin(0.5, 0);
      if (i === next) {
        const ring = this.add.circle(x, y, 46).setStrokeStyle(5, ACCENT_N);
        this.tweens.add({ targets: ring, scale: 1.25, alpha: 0, duration: 1100, repeat: -1 });
      }
      const hit = this.add.zone(x, y, 90, 90).setInteractive({ useHandCursor: open });
      hit.on("pointerdown", () => open && this.showCard(loc, i));
    });

    this.guide();
    this.showCard(LOCATIONS[next]!, next);
  }

  private showCard(loc: Location, i: number) {
    this.card.forEach((o) => o.destroy());
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.card.push(o), o);
    const x = 990, y = 130, w = 270, h = 440;
    keep(panel(this, x, y, w, h));
    keep(this.add.text(x + 20, y + 18, `HEIST ${i + 1}`, { fontFamily: FONT_BODY, fontSize: "18px", color: "#8a7d70" }));
    keep(this.add.text(x + 20, y + 42, loc.name, { fontFamily: FONT_TITLE, fontSize: "26px", color: INK, wordWrap: { width: w - 40 } }));
    keep(this.add.text(x + 20, y + 108, loc.blurb, { fontFamily: FONT_BODY, fontSize: "18px", color: "#3b3033", wordWrap: { width: w - 40 } }));
    const d = loadoutFor(loc.traits);
    const facts = [
      `Defender: ${d.tier}`,
      `Traps: ${loc.traps.length} · mostly ${d.trap}`,
      `Loot: ${loc.loot}`,
    ];
    keep(this.add.text(x + 20, y + 268, facts.join("\n"), { fontFamily: FONT_BODY, fontSize: "18px", color: INK, lineSpacing: 6, wordWrap: { width: w - 40 } }));
    keep(button(this, x + w / 2, y + h - 46, w - 40, "Start heist", () => this.scene.start("raid", { chog: this.chog, location: loc })));
  }

  /** The guide's hint box. Molandak's art goes in the frame once the monanimal sheet is ready. */
  private guide() {
    const tip = GUIDE_TIPS[Math.floor(Math.random() * GUIDE_TIPS.length)]!;
    panel(this, 40, 600, 600, 96, 0xfffaf0);
    const frame = this.add.graphics();
    frame.fillStyle(0x7e5ce0, 1).fillCircle(96, 648, 34);
    frame.lineStyle(4, INK_N, 1).strokeCircle(96, 648, 34);
    this.add.text(96, 648, "M", { fontFamily: FONT_TITLE, fontSize: "30px", color: PAPER }).setOrigin(0.5);
    this.add.text(144, 614, "MOLANDAK SAYS", { fontFamily: FONT_TITLE, fontSize: "16px", color: "#7e5ce0" });
    this.add.text(144, 638, tip, { fontFamily: FONT_BODY, fontSize: "20px", color: INK, wordWrap: { width: 480 } });
  }
}
