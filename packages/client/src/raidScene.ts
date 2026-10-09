import Phaser from "phaser";
import {
  Input,
  ROOMS,
  ROOM_W,
  RAID_TICKS,
  TICK_HZ,
  VAULT_X,
  createRaid,
  step,
  type RaidEvent,
  type RaidSetup,
  type RaidState,
} from "@chogswipe/sim";
import {
  ACCENT,
  BOIL_FRAMES,
  FLOOR_Y,
  INK,
  PAPER,
  ROOM_PX,
  SKIN,
  TRAP_H,
  bakeRoom,
  bakeTorso,
  bakeTraps,
  bakeSack,
  bakeVault,
} from "./art.js";
import { HEAD_PX, makeStickerHead } from "./head.js";
import { DEMO_RAIDER, DEMO_TARGET, demoSetup } from "./demo.js";

const TICK_MS = 1000 / TICK_HZ;
const BOIL_MS = 180;
const params = new URLSearchParams(location.search);
const AUTOPILOT = params.has("autopilot");
const FREEZE_AT = params.has("freeze") ? Number(params.get("freeze")) : null;

const FONT_TITLE = "'Luckiest Guy', sans-serif";
const FONT_BODY = "'Patrick Hand', sans-serif";

/** World x of a sim position. Rooms sit side by side. */
const worldX = (room: number, x: number) => room * ROOM_PX + (x / ROOM_W) * ROOM_PX;

export class RaidScene extends Phaser.Scene {
  private setup!: RaidSetup;
  private s!: RaidState;
  private acc = 0;
  private hitStop = 0;
  private seenEvents = 0;
  private boilT = 0;
  private boilFrame = 0;
  private boilers: { img: Phaser.GameObjects.Image; key: string }[] = [];

  private puppet!: Phaser.GameObjects.Container;
  private head!: Phaser.GameObjects.Image;
  private torso!: Phaser.GameObjects.Image;
  private limbs!: Phaser.GameObjects.Graphics;
  private shadow!: Phaser.GameObjects.Ellipse;
  private trapSprites: Phaser.GameObjects.Image[] = [];
  private hunchSprites: Phaser.GameObjects.Image[] = [];
  private lootBag!: Phaser.GameObjects.Image;

  private hud!: {
    timer: Phaser.GameObjects.Text;
    hearts: Phaser.GameObjects.Text;
    loot: Phaser.GameObjects.Text;
    lootBar: Phaser.GameObjects.Graphics;
    scout: Phaser.GameObjects.Text;
    special: Phaser.GameObjects.Text;
    toast: Phaser.GameObjects.Text;
    grabRing: Phaser.GameObjects.Graphics;
  };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super("raid");
  }

  preload() {
    this.load.image("chog1-cut", "/chogs/1.png");
    this.load.image("chog1-portrait", "/chogs/1-portrait.png");
  }

  create() {
    this.setup = demoSetup();
    this.s = createRaid(this.setup);

    for (let i = 0; i < ROOMS; i++) bakeRoom(this, i, i === ROOMS - 1);
    bakeVault(this);
    bakeTraps(this);
    bakeSack(this);
    bakeTorso(this, "torso", SKIN[DEMO_RAIDER.traits.Skin] ?? PAPER);
    makeStickerHead(this, "chog1-cut", "chog1-head");

    const worldW = ROOMS * ROOM_PX + 140;
    this.cameras.main.setBounds(0, 0, worldW, 720);
    this.add.rectangle(ROOMS * ROOM_PX, 0, 140, 720, 0x2a2124).setOrigin(0, 0);
    this.cameras.main.setBackgroundColor(INK);

    for (let i = 0; i < ROOMS; i++) this.boil(this.add.image(i * ROOM_PX - 4, 0, `room${i}_0`).setOrigin(0, 0), `room${i}`);
    this.boil(this.add.image(worldX(ROOMS - 1, VAULT_X) + 20, FLOOR_Y + 4, "vault_0").setOrigin(0.5, 1), "vault");

    this.s.traps.forEach((tr, i) => {
      const img = this.add.image(worldX(tr.room, tr.x), FLOOR_Y + 8, `trap:${tr.kind}_0`).setOrigin(0.5, 1).setAlpha(0);
      this.boil(img, `trap:${tr.kind}`);
      this.trapSprites[i] = img;
      const h = this.add.image(worldX(tr.room, tr.x), FLOOR_Y - TRAP_H - 10, "hunch_0").setAlpha(0);
      this.boil(h, "hunch");
      this.hunchSprites[i] = h;
    });

    this.buildPuppet();
    this.cameras.main.startFollow(this.puppet, true, 0.12, 0.12, 0, 120);
    this.buildHud();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("LEFT,RIGHT,UP,A,D,W,SPACE,Q,E,F") as Record<string, Phaser.Input.Keyboard.Key>;
  }

  // ------------------------------------------------------------ building

  private boil(img: Phaser.GameObjects.Image, key: string) {
    this.boilers.push({ img, key });
    return img;
  }

  private buildPuppet() {
    this.shadow = this.add.ellipse(0, FLOOR_Y + 6, 120, 22, 0x1c1618, 0.22);
    this.limbs = this.add.graphics();
    this.torso = this.add.image(0, -72, "torso_0");
    this.boil(this.torso, "torso");
    this.head = this.add.image(0, -168, "chog1-head").setScale(0.56);
    this.lootBag = this.add.image(-62, -92, "sack_0").setScale(0.85).setVisible(false);
    this.boil(this.lootBag, "sack");
    this.puppet = this.add.container(0, FLOOR_Y, [this.limbs, this.torso, this.lootBag, this.head]);
  }

  private buildHud() {
    const cam = { setScrollFactor: 0 };
    void cam;
    const W = this.scale.width;
    const panel = this.add.graphics().setScrollFactor(0);
    panel.fillStyle(0x1c1618, 0.88).fillRoundedRect(16, 14, W - 32, 74, 18);

    this.add
      .text(36, 26, DEMO_TARGET.name.toUpperCase(), { fontFamily: FONT_TITLE, fontSize: "26px", color: PAPER })
      .setScrollFactor(0);
    this.add
      .text(36, 58, `Uncommon hideout · ${this.setup.hideout.traps.length} traps hidden`, {
        fontFamily: FONT_BODY,
        fontSize: "20px",
        color: "#c9bfae",
      })
      .setScrollFactor(0);

    const tag = this.add
      .text(W / 2, 30, AUTOPILOT ? "DEMO · AUTOPILOT" : "DEMO RAID", {
        fontFamily: FONT_BODY,
        fontSize: "16px",
        color: INK,
        backgroundColor: "#f0c35a",
        padding: { x: 10, y: 2 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    void tag;

    const timer = this.add
      .text(W / 2, 52, "1:30", { fontFamily: FONT_TITLE, fontSize: "34px", color: PAPER })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    const hearts = this.add
      .text(W - 380, 30, "", { fontFamily: FONT_TITLE, fontSize: "30px", color: ACCENT })
      .setScrollFactor(0);
    const loot = this.add
      .text(W - 40, 26, "", { fontFamily: FONT_TITLE, fontSize: "24px", color: "#f0c35a" })
      .setOrigin(1, 0)
      .setScrollFactor(0);
    const lootBar = this.add.graphics().setScrollFactor(0);

    // bottom: portrait card + gadgets
    const H = this.scale.height;
    const card = this.add.graphics().setScrollFactor(0);
    card.fillStyle(0x1c1618, 0.9).fillRoundedRect(16, H - 112, 560, 96, 18);
    this.add.image(64, H - 64, "chog1-portrait").setDisplaySize(76, 76).setScrollFactor(0);
    const ring = this.add.graphics().setScrollFactor(0);
    ring.lineStyle(4, 0xf3eadb, 1).strokeRoundedRect(25, H - 103, 78, 78, 12);
    this.add
      .text(118, H - 104, DEMO_RAIDER.name, { fontFamily: FONT_TITLE, fontSize: "22px", color: PAPER })
      .setScrollFactor(0);
    const l = this.setup.raider;
    this.add
      .text(118, H - 76, `${l.tier} · ${l.body ?? "—"} · ${l.head ?? "—"}`, { fontFamily: FONT_BODY, fontSize: "18px", color: "#c9bfae" })
      .setScrollFactor(0);
    const chip = (x: number, text: string) =>
      this.add
        .text(x, H - 50, text, {
          fontFamily: FONT_BODY,
          fontSize: "19px",
          color: INK,
          backgroundColor: PAPER,
          padding: { x: 10, y: 4 },
        })
        .setScrollFactor(0);
    const scout = chip(118, "");
    const special = chip(300, "");
    this.add
      .text(W - 32, H - 30, "← → move   SPACE jump   F hold to grab   Q scout   E special", {
        fontFamily: FONT_BODY,
        fontSize: "18px",
        color: PAPER,
        backgroundColor: "rgba(28,22,24,0.75)",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(1, 1)
      .setScrollFactor(0);

    const toast = this.add
      .text(W / 2, 150, "", { fontFamily: FONT_TITLE, fontSize: "44px", color: PAPER, stroke: INK, strokeThickness: 10 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setAlpha(0);
    const grabRing = this.add.graphics();
    this.hud = { timer, hearts, loot, lootBar, scout, special, toast, grabRing };
  }

  // ------------------------------------------------------------ loop

  update(_time: number, delta: number) {
    this.boilT += delta;
    if (this.boilT > BOIL_MS) {
      this.boilT = 0;
      this.boilFrame = (this.boilFrame + 1) % BOIL_FRAMES;
      for (const b of this.boilers) b.img.setTexture(`${b.key}_${this.boilFrame}`);
    }

    if (this.hitStop > 0) {
      this.hitStop -= delta;
    } else if (!this.s.result && (FREEZE_AT === null || this.s.t < FREEZE_AT)) {
      this.acc += delta;
      while (this.acc >= TICK_MS && !this.s.result && (FREEZE_AT === null || this.s.t < FREEZE_AT)) {
        this.acc -= TICK_MS;
        step(this.s, this.setup, AUTOPILOT ? this.autopilot() : this.readKeys());
        this.drainEvents();
        if (this.hitStop > 0) break;
      }
    }
    this.render();
  }

  private readKeys(): number {
    const k = this.keys;
    let m = 0;
    if (k.LEFT!.isDown || k.A!.isDown) m |= Input.LEFT;
    if (k.RIGHT!.isDown || k.D!.isDown) m |= Input.RIGHT;
    if (k.SPACE!.isDown || k.UP!.isDown || k.W!.isDown) m |= Input.JUMP;
    if (k.Q!.isDown) m |= Input.SCOUT;
    if (k.E!.isDown) m |= Input.SPECIAL;
    if (k.F!.isDown) m |= Input.GRAB;
    return m;
  }

  /** Demo bot: scouts once, runs to the vault, jumps revealed traps, grabs, runs home. */
  private autopilot(): number {
    const s = this.s;
    const home = s.lootBps > 0;
    let m: number = home ? Input.LEFT : Input.RIGHT;
    if (!home && s.room === ROOMS - 1 && s.x >= VAULT_X - 40) m = Input.GRAB;
    if (s.t === 10 || (s.room === 1 && s.x < 40 && !home)) m |= Input.SCOUT;
    const dir = home ? -1 : 1;
    const near = s.traps.some((t) => t.armed && t.revealed && t.room === s.room && (t.x - s.x) * dir > 0 && (t.x - s.x) * dir <= 44);
    if (near && s.air === 0 && s.stun === 0 && !(s.prevMask & Input.JUMP)) m |= Input.JUMP;
    return m;
  }

  private drainEvents() {
    const ev = this.s.events;
    while (this.seenEvents < ev.length) this.onEvent(ev[this.seenEvents++]!);
  }

  private onEvent(e: RaidEvent) {
    const cam = this.cameras.main;
    switch (e.type) {
      case "trap": {
        this.hitStop = 90;
        cam.shake(180, 0.008);
        cam.flash(80, 255, 240, 220);
        this.toast(e.kind.toUpperCase() + "!", ACCENT);
        const spr = this.trapSprites[e.trap]!.setAlpha(1);
        this.tweens.add({ targets: spr, scaleY: 1.35, scaleX: 0.85, yoyo: true, duration: 110 });
        this.burst(spr.x, FLOOR_Y - 30, 0xe0528a);
        break;
      }
      case "blocked":
        this.toast(`${e.by} blocked it`, "#7ec4a8");
        break;
      case "reveal":
        if (e.traps.length) this.toast(`${e.by}: ${e.traps.length} trap${e.traps.length > 1 ? "s" : ""} spotted`, "#f0c35a");
        e.traps.forEach((i) => this.tweens.add({ targets: this.trapSprites[i], alpha: 1, duration: 260 }));
        break;
      case "disarm": {
        const spr = this.trapSprites[e.trap]!;
        this.toast(`${e.by}: disarmed`, "#7ec4a8");
        this.tweens.add({ targets: spr, alpha: 0.35, angle: 12, duration: 200 });
        break;
      }
      case "grab":
        this.hitStop = 140;
        cam.shake(240, 0.01);
        this.toast(`SWIPED ${DEMO_TARGET.capChog.toLocaleString()} $CHOG`, "#f0c35a");
        this.burst(this.puppet.x, FLOOR_Y - 140, 0xf0c35a, 26);
        break;
      case "drop":
        this.toast("Dropped some loot!", ACCENT);
        break;
      case "second-life":
        this.toast("Second Life!", "#7ec4a8");
        break;
      case "special":
        this.toast(e.kind, "#7ec4a8");
        break;
      case "end":
        this.toast(e.result === "escaped" ? "ESCAPED!" : e.result === "knocked-out" ? "KNOCKED OUT" : "TIME'S UP", e.result === "escaped" ? "#f0c35a" : ACCENT, 1200);
        this.time.delayedCall(700, () => this.resultCard(e.result));
        break;
    }
  }

  private resultCard(result: string) {
    const W = this.scale.width;
    const H = this.scale.height;
    const won = result === "escaped";
    const loot = Math.floor((DEMO_TARGET.capChog * this.s.lootBps) / 10_000);
    const c = this.add.container(W / 2, H / 2 + 20).setScrollFactor(0).setAlpha(0).setScale(0.9);
    const shade = this.add.rectangle(0, -20, W, H, 0x1c1618, 0.55);
    const card = this.add.graphics();
    card.fillStyle(0xf3eadb, 1).fillRoundedRect(-300, -170, 600, 330, 26);
    card.lineStyle(6, 0x1c1618, 1).strokeRoundedRect(-300, -170, 600, 330, 26);
    const head = this.add.image(-190, -30, "chog1-head").setScale(0.42).setAngle(-8);
    const title = this.add
      .text(-90, -130, won ? "CLEAN SWIPE" : "CAUGHT", { fontFamily: FONT_TITLE, fontSize: "46px", color: won ? INK : ACCENT })
      .setOrigin(0, 0);
    const amount = this.add
      .text(-90, -70, won ? `+${loot.toLocaleString()} $CHOG` : "+0 $CHOG", { fontFamily: FONT_TITLE, fontSize: "40px", color: "#c79a2a" })
      .setOrigin(0, 0);
    const s = this.s;
    const secs = Math.round(s.t / TICK_HZ);
    const traps = s.events.filter((e) => e.type === "trap").length;
    const stats = this.add
      .text(-90, -14, `${secs}s run · ${traps} trap${traps === 1 ? "" : "s"} hit · ${s.hp} hearts left
from ${DEMO_TARGET.name}`, {
        fontFamily: FONT_BODY,
        fontSize: "22px",
        color: "#5a4d50",
        lineSpacing: 4,
      })
      .setOrigin(0, 0);
    const btn = this.add.graphics();
    btn.fillStyle(0xe0528a, 1).fillRoundedRect(-90, 74, 330, 58, 16);
    btn.lineStyle(4, 0x1c1618, 1).strokeRoundedRect(-90, 74, 330, 58, 16);
    const cta = this.add
      .text(75, 103, won ? "Settle on Monad" : "Try again", { fontFamily: FONT_TITLE, fontSize: "26px", color: PAPER })
      .setOrigin(0.5);
    const note = this.add
      .text(-270, 128, "demo", { fontFamily: FONT_BODY, fontSize: "16px", color: "#8a7d70" })
      .setOrigin(0, 0);
    c.add([shade, card, head, title, amount, stats, btn, cta, note]);
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 320, ease: "Back.Out" });
  }

  private toast(text: string, color: string, hold = 900) {
    const t = this.hud.toast;
    this.tweens.killTweensOf(t);
    t.setText(text).setColor(color).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: "Back.Out" });
    this.tweens.add({ targets: t, alpha: 0, delay: hold, duration: 300 });
  }

  private burst(x: number, y: number, color: number, n = 14) {
    for (let i = 0; i < n; i++) {
      const dot = this.add.circle(x, y, Phaser.Math.Between(4, 9), color).setStrokeStyle(2, 0x1c1618);
      const a = (i / n) * Math.PI * 2;
      const d = Phaser.Math.Between(60, 140);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d - 40,
        alpha: 0,
        scale: 0.3,
        duration: 520,
        ease: "Cubic.Out",
        onComplete: () => dot.destroy(),
      });
    }
  }

  // ------------------------------------------------------------ render

  private render() {
    const s = this.s;
    const x = worldX(s.room, s.x);
    const moving = (s.prevMask & (Input.LEFT | Input.RIGHT)) !== 0 && s.stun === 0;
    const phase = s.t * 0.55;
    const airY = s.air > 0 ? -Math.sin((s.air / 18) * Math.PI) * 110 : 0;
    const bob = moving && s.air === 0 ? -Math.abs(Math.sin(phase)) * 10 : 0;

    this.puppet.setPosition(x, FLOOR_Y + airY + bob);
    this.shadow.setPosition(x, FLOOR_Y + 6).setScale(1 + airY / 300, 1);
    this.puppet.scaleX = s.facing * (s.air > 0 ? 0.92 : 1);
    this.puppet.scaleY = s.air > 0 ? 1.08 : s.stun > 0 ? 0.86 : 1;
    // flip the body with facing, but keep the NFT art readable
    this.head.setScale(0.56 * s.facing, 0.56);
    this.head.setRotation(s.stun > 0 ? Math.sin(s.t * 0.9) * 0.18 : moving ? Math.sin(phase) * 0.06 : 0);
    this.head.setY(-168 + (s.stun > 0 ? 8 : 0));
    this.puppet.setAlpha(s.result === "knocked-out" ? 0.6 : 1);
    this.lootBag.setVisible(s.lootBps > 0);

    // legs and arms
    const g = this.limbs;
    g.clear();
    const swing = moving && s.air === 0 ? Math.sin(phase) * 16 : 0;
    const leg = (dx: number, sw: number) => {
      g.lineStyle(18, 0x1c1618, 1).lineBetween(dx, -34, dx + sw, -2);
      g.lineStyle(9, 0xfaf3e6, 1).lineBetween(dx, -34, dx + sw, -2);
      g.fillStyle(0x1c1618, 1).fillEllipse(dx + sw + 6, 0, 30, 14);
    };
    leg(-22, swing);
    leg(22, -swing);
    const arm = (dx: number, sw: number) => {
      g.lineStyle(15, 0x1c1618, 1).lineBetween(dx, -92, dx + sw, -56);
      g.lineStyle(7, 0xfaf3e6, 1).lineBetween(dx, -92, dx + sw, -56);
      g.fillStyle(0x1c1618, 1).fillCircle(dx + sw, -56, 10);
    };
    arm(-58, -14 - swing * 0.6);
    arm(58, 14 + swing * 0.6);

    // hunch markers
    s.traps.forEach((tr, i) => this.hunchSprites[i]!.setAlpha(tr.hunched && !tr.revealed && tr.armed ? 0.9 : 0));

    // grab ring over the vault
    const gr = this.hud.grabRing;
    gr.clear();
    if (s.grab > 0 && s.lootBps === 0) {
      const need = this.setup.raider.head === "Lockpick" ? 15 : 45;
      gr.lineStyle(10, 0xf0c35a, 1).beginPath();
      gr.arc(x, FLOOR_Y - 270, 34, -Math.PI / 2, -Math.PI / 2 + (s.grab / need) * Math.PI * 2);
      gr.strokePath();
    }

    // HUD
    const secs = Math.max(0, Math.ceil(s.timeLeft / TICK_HZ));
    this.hud.timer.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
    this.hud.timer.setColor(s.timeLeft < RAID_TICKS / 4 ? ACCENT : PAPER);
    this.hud.hearts.setText("♥".repeat(Math.max(0, s.hp)) + "♡".repeat(Math.max(0, 3 - s.hp)));
    const carried = Math.floor((DEMO_TARGET.capChog * s.lootBps) / 10_000);
    this.hud.loot.setText(`${carried.toLocaleString()} / ${DEMO_TARGET.capChog.toLocaleString()} $CHOG`);
    const W = this.scale.width;
    this.hud.lootBar
      .clear()
      .fillStyle(0x3b3336, 1)
      .fillRoundedRect(W - 260, 62, 220, 12, 6)
      .fillStyle(0xf0c35a, 1)
      .fillRoundedRect(W - 260, 62, Math.max(12, 220 * (s.lootBps / 10_000)), 12, 6);
    this.hud.scout.setText(`Q · ${this.setup.raider.scout} ×${s.scoutCharges}`);
    this.hud.special.setText(`E · ${this.setup.raider.special ?? "none"}${s.specialUsed ? " (used)" : ""}`);
  }
}
