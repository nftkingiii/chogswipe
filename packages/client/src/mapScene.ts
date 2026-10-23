// The heist map: lore locations along a jungle path, unlocked in order.
import Phaser from "phaser";
import { LOCATIONS, loadoutFor, type Location } from "@chogswipe/sim";
import { bake, grain, ink, INK, PAPER } from "./art.js";
import { bests, clock, cleared, starText } from "./progress.js";
import { getDaily, startDaily, type DailyView } from "./api.js";
import type { RosterChog } from "./roster.js";
import { OWN_CHOG_UNLOCKS, TRIAL_HEISTS, onTrial, selectedChog, trialLocked } from "./session.js";
import { nav } from "./nav.js";
import { themeFor } from "./theme.js";
import { castReady, loadCast } from "./cast.js";
import { advance, onboardStep } from "./onboarding.js";
import { ACCENT_N, FONT_BODY, FONT_TITLE, INK_N, button, centerStage, notice, panel, stageLeft, startHeist } from "./ui.js";

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
  "Space jumps traps. If the guard spots you it gives chase: jump it, or sneak up behind it.",
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
    this.chog = data.chog ?? selectedChog();
    this.card = [];
  }

  preload() {
    loadCast(this);
  }

  create() {
    centerStage(this);
    const { width: W, height: H } = this.scale;
    const ox = stageLeft(this);
    // the jungle fills the whole screen; the path and the Elder Tree sit on the centred 1280 stage
    bake(this, `jungle-${W}`, W, H, (ctx, rc, s) => {
      ctx.fillStyle = "#cfe0b4";
      ctx.fillRect(0, 0, W, H);
      // river
      rc.path(`M -20 ${H * 0.86} C 300 ${H * 0.7}, 600 ${H * 0.98}, ${W + 20} ${H * 0.8}`, ink(s, { stroke: "#7fc0d6", strokeWidth: 46, roughness: 2 }));
      // trees and bushes
      for (let i = 0; i < 40; i++) {
        const x = (i * 157) % W;
        const y = 150 + ((i * 89) % (H - 220));
        rc.circle(x, y, 40 + (i % 5) * 12, ink(s + i, { fill: i % 3 ? "#8fbf6a" : "#6fa65a", fillStyle: "solid", strokeWidth: 3 }));
      }
      ctx.save();
      ctx.translate(ox, 0);
      // the Elder Tree at the end
      rc.rectangle(1010, 260, 60, 220, ink(s + 99, { fill: "#7a5638", fillStyle: "solid" }));
      rc.circle(1040, 220, 220, ink(s + 100, { fill: "#4f8a4a", fillStyle: "solid" }));
      // dotted path between nodes
      for (let i = 0; i < NODES.length - 1; i++) {
        const [x0, y0] = NODES[i]!, [x1, y1] = NODES[i + 1]!;
        rc.line(x0, y0, x1, y1, ink(s + 200 + i, { strokeWidth: 6, stroke: "#f3eadb", roughness: 2.4 }));
      }
      ctx.restore();
      grain(ctx, W, H, 14, s);
    });
    const bg = this.add.image(-ox, 0, `jungle-${W}_0`).setOrigin(0, 0);
    let f = 0;
    this.time.addEvent({ delay: 200, loop: true, callback: () => bg.setTexture(`jungle-${W}_${(f = (f + 1) % 3)}`) });

    nav(this, "map");
    this.add.text(40, 96, "THE MONADVERSE HEISTS", { fontFamily: FONT_TITLE, fontSize: "34px", color: INK });
    this.add.text(
      42,
      136,
      onTrial() ? `Trying sample Chog #${this.chog.id}: the first ${TRIAL_HEISTS} heists are open. Your own Chog unlocks all 7.` : `Raiding as Chog #${this.chog.id}. Clear a heist to unlock the next.`,
      { fontFamily: FONT_BODY, fontSize: "22px", color: "#3b3033" },
    );

    const done = cleared();
    // on the trial, heists past the first few belong to Chog holders, whatever was cleared before
    const unlocked = (l: Location) => !trialLocked(LOCATIONS.indexOf(l)) && (!l.unlockAfter || done.has(l.unlockAfter));
    let next = LOCATIONS.findIndex((l) => unlocked(l) && !done.has(l.slug));
    if (next < 0) next = onTrial() ? TRIAL_HEISTS - 1 : LOCATIONS.length - 1;

    LOCATIONS.forEach((loc, i) => {
      const [x, y] = NODES[i]!;
      const open = unlocked(loc);
      const won = done.has(loc.slug) && open;
      const holdersOnly = trialLocked(i);
      const color = Number.parseInt(themeFor(loc.traits.Background).accent.slice(1), 16);
      const g = this.add.graphics();
      g.fillStyle(INK_N, 1).fillCircle(x + 4, y + 6, 38);
      g.fillStyle(open ? color : 0x9a948c, 1).fillCircle(x, y, 38);
      g.lineStyle(5, INK_N, 1).strokeCircle(x, y, 38);
      this.add.text(x, y, won ? "✓" : open ? String(i + 1) : "🔒", { fontFamily: FONT_TITLE, fontSize: won || open ? "34px" : "26px", color: PAPER }).setOrigin(0.5);
      const name = this.add
        .text(x, y + 46, loc.name, { fontFamily: FONT_TITLE, fontSize: "17px", color: INK, backgroundColor: "rgba(243,234,219,0.85)", padding: { x: 6, y: 2 } })
        .setOrigin(0.5, 0);
      const best = bests()[loc.slug];
      if (best) this.add.text(x, name.y + name.height, starText(best.stars), { fontFamily: FONT_BODY, fontSize: "20px", color: "#c7861a", stroke: "#1c1618", strokeThickness: 3 }).setOrigin(0.5, 0);
      if (i === next) {
        const ring = this.add.circle(x, y, 46).setStrokeStyle(5, ACCENT_N);
        this.tweens.add({ targets: ring, scale: 1.25, alpha: 0, duration: 1100, repeat: -1 });
      }
      if (holdersOnly) this.add.text(x, y - 52, "CHOG HOLDERS", { fontFamily: FONT_TITLE, fontSize: "13px", color: PAPER, backgroundColor: "#1c1618", padding: { x: 6, y: 2 } }).setOrigin(0.5);
      // holder-only heists still open their card, so a trial player can see what their own Chog unlocks
      const hit = this.add.zone(x, y, 90, 90).setInteractive({ useHandCursor: open || holdersOnly });
      hit.on("pointerdown", () => (open || holdersOnly) && this.showCard(loc, i));
    });

    this.guide();
    this.dailyPanel();
    this.showCard(LOCATIONS[next]!, next);
  }

  private showCard(loc: Location, i: number) {
    this.card.forEach((o) => o.destroy());
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.card.push(o), o);
    const x = 990, y = 150, w = 270, h = 446;
    keep(panel(this, x, y, w, h));
    keep(this.add.text(x + 20, y + 18, `HEIST ${i + 1}`, { fontFamily: FONT_BODY, fontSize: "18px", color: "#8a7d70" }));
    // each block sits under the one above it, so long names or blurbs never slide under the button
    const title = keep(this.add.text(x + 20, y + 42, loc.name, { fontFamily: FONT_TITLE, fontSize: "24px", color: INK, wordWrap: { width: w - 40 } }));
    const blurb = keep(
      this.add.text(x + 20, title.y + title.height + 10, loc.blurb, { fontFamily: FONT_BODY, fontSize: "17px", color: "#3b3033", wordWrap: { width: w - 40 } }),
    );
    const d = loadoutFor(loc.traits);
    const best = bests()[loc.slug];
    const facts = [
      `Defender: ${d.tier} · ${loc.traps.length} traps`,
      `${loc.plan.guards.length > 1 ? `${loc.plan.guards.length} guards` : "1 guard"} · ${loc.plan.seconds}s on the clock`,
      best ? `Best: ${clock(best.ticks)} ${starText(best.stars)} · par ${loc.par}s` : `Par: ${loc.par}s for the third ★`,
    ];
    const factText = keep(
      this.add.text(x + 20, blurb.y + blurb.height + 10, facts.join("\n"), { fontFamily: FONT_BODY, fontSize: "17px", color: INK, lineSpacing: 2, wordWrap: { width: w - 40 } }),
    );
    // what makes this heist different, on a gold sticky note
    keep(
      this.add.text(x + 14, factText.y + factText.height + 10, loc.twist, {
        fontFamily: FONT_BODY,
        fontSize: "16px",
        color: INK,
        backgroundColor: "#f6e3a8",
        padding: { x: 8, y: 6 },
        wordWrap: { width: w - 44 },
        lineSpacing: 1,
      }),
    );
    if (trialLocked(i)) {
      keep(
        button(this, x + w / 2, y + h - 46, w - 40, "Chog holders only", () => {
          const msg = notice(this, `${loc.name} is for Chog holders.\n${OWN_CHOG_UNLOCKS}`);
          this.time.delayedCall(3500, () => msg.destroy());
        }, false),
      );
    } else keep(button(this, x + w / 2, y + h - 46, w - 40, "Start heist", () => startHeist(this, { chog: this.chog, location: loc })));
  }

  /** Today's daily heist: same heist and seed for everyone, ranked by time on the server. */
  private dailyPanel() {
    const x = 672, y = 612, w = 568, h = 84;
    panel(this, x, y, w, h, 0xf6e3a8);
    this.add.text(x + 20, y + 12, "DAILY HEIST", { fontFamily: FONT_TITLE, fontSize: "20px", color: "#b8323a" });
    const line = this.add.text(x + 20, y + 40, "Loading today's heist…", { fontFamily: FONT_BODY, fontSize: "19px", color: INK, wordWrap: { width: 300 } });
    let view: DailyView | null = null;
    button(this, x + w - 196, y + h / 2, 110, "Board", () => view && this.board(view), false).setScale(0.9);
    button(this, x + w - 76, y + h / 2, 120, "Play", async () => {
      try {
        const ticket = await startDaily();
        startHeist(this, { chog: this.chog, daily: ticket });
      } catch (e) {
        const msg = notice(this, `The daily heist is offline right now: ${(e as Error).message}`);
        this.time.delayedCall(3000, () => msg.destroy());
      }
    }).setScale(0.9);
    getDaily()
      .then((v) => {
        if (!this.scene.isActive()) return;
        view = v;
        const loc = LOCATIONS.find((l) => l.slug === v.slug);
        const top = v.top[0];
        line.setText(
          onTrial()
            ? `${loc?.name ?? v.slug} · holders post times`
            : `${loc?.name ?? v.slug} · ${top ? `best ${clock(top.ticks)} by ${top.name}` : "no times yet: be first!"}`,
        );
      })
      .catch(() => this.scene.isActive() && line.setText("The board is offline right now."));
  }

  /** Today's top 20. */
  private board(v: DailyView) {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => (parts.push(o), o);
    const close = () => parts.forEach((o) => o.destroy());
    const D = 400;
    keep(this.add.rectangle(640, 360, 4000, 2000, INK_N, 0.6).setDepth(D).setInteractive()).on("pointerdown", close);
    const x = 340, y = 70, w = 600, h = 590;
    keep(panel(this, x, y, w, h).setDepth(D));
    keep(this.add.zone(x, y, w, h).setOrigin(0, 0).setDepth(D).setInteractive());
    const loc = LOCATIONS.find((l) => l.slug === v.slug);
    keep(this.add.text(x + 30, y + 24, "TODAY'S BOARD", { fontFamily: FONT_TITLE, fontSize: "34px", color: INK }).setDepth(D));
    keep(this.add.text(x + 30, y + 66, `${loc?.name ?? v.slug} · ${v.day} · resets at 00:00 UTC`, { fontFamily: FONT_BODY, fontSize: "19px", color: "#5a4d50" }).setDepth(D));
    const rows = v.top.length
      ? v.top.map((r) => `${String(r.rank).padStart(2, " ")}. ${r.name.padEnd(16, " ")} ${clock(r.ticks)}  ${starText(r.stars)}`).join("\n")
      : "No times yet today. Be the first on the board!";
    keep(this.add.text(x + 30, y + 104, rows, { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: "19px", color: INK, lineSpacing: 2 }).setDepth(D));
    keep(button(this, x + w - 100, y + h - 44, 150, "Close", close).setDepth(D + 1));
  }

  /** The guide's hint box. Molandak's art goes in the frame once the monanimal sheet is ready. */
  private guide() {
    const first = onboardStep() === "heist";
    const tip = first
      ? "Start with The Fwog Pond: it's the easiest. Press Start heist, and I'll coach you inside."
      : GUIDE_TIPS[Math.floor(Math.random() * GUIDE_TIPS.length)]!;
    if (first) advance("done");
    panel(this, 40, 600, 600, 96, 0xfffaf0);
    if (castReady(this)) {
      this.add.image(96, 694, "cast", "molandak").setOrigin(0.5, 1).setScale(0.36);
    } else {
      const frame = this.add.graphics();
      frame.fillStyle(0x7e5ce0, 1).fillCircle(96, 648, 34);
      frame.lineStyle(4, INK_N, 1).strokeCircle(96, 648, 34);
      this.add.text(96, 648, "M", { fontFamily: FONT_TITLE, fontSize: "30px", color: PAPER }).setOrigin(0.5);
    }
    this.add.text(144, 614, "MOLANDAK SAYS", { fontFamily: FONT_TITLE, fontSize: "16px", color: "#7e5ce0" });
    this.add.text(144, 638, tip, { fontFamily: FONT_BODY, fontSize: "20px", color: INK, wordWrap: { width: 480 } });
  }
}
