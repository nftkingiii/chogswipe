import Phaser from "phaser";
import {
  COLS,
  FLOORS,
  GUARD,
  Input,
  LOCKED_DOOR,
  RAID_TICKS,
  ROOMS,
  ROOM_NAMES,
  ROOM_W,
  TICK_HZ,
  VAULT_ROOM,
  VAULT_X,
  colOf,
  createRaid,
  floorOf,
  guardFacing,
  guardX,
  makeBot,
  step,
  type RaidEvent,
  type RaidSetup,
  type RaidState,
  type Route,
} from "@chogswipe/sim";
import { ACCENT, BOIL_FRAMES, FLOOR_Y, INK, PAPER, ROOM_PX, SKIN, TRAP_H, VIEW_H, bakeSack, bakeTraps, bakeVault } from "./art.js";
import { DEMO_RAIDER, DEMO_TARGET, demoSetup } from "./demo.js";
import { bakeFx } from "./puppet.js";
import { ChogSprite, makeChogTexture } from "./chogSprite.js";
import { WINDOWS, bakeForeground, bakeRooms, bakeSkyline } from "./rooms.js";
import { themeFor } from "./theme.js";

const TICK_MS = 1000 / TICK_HZ;
const BOIL_MS = 180;
const params = new URLSearchParams(location.search);
const AUTOPILOT = params.has("autopilot");
const ROUTE = (params.get("route") ?? "kitchen") as Route;
const FREEZE_AT = params.has("freeze") ? Number(params.get("freeze")) : null;

const FONT_TITLE = "'Luckiest Guy', sans-serif";
const FONT_BODY = "'Patrick Hand', sans-serif";

/** World position of a sim spot: columns side by side, the upper floor drawn above the ground floor. */
const worldX = (room: number, x: number) => colOf(room) * ROOM_PX + (x / ROOM_W) * ROOM_PX;
const floorY = (room: number) => (FLOORS - 1 - floorOf(room)) * VIEW_H + FLOOR_Y;

export class RaidScene extends Phaser.Scene {
  private setup!: RaidSetup;
  private s!: RaidState;
  private bot = makeBot({ route: ROUTE, scout: true });
  private acc = 0;
  private hitStop = 0;
  private seenEvents = 0;
  private boilT = 0;
  private boilFrame = 0;
  private boilers: { img: Phaser.GameObjects.Image; key: string }[] = [];
  private visited = new Set<number>([0]);
  private skyPatches: { img: Phaser.GameObjects.Image; w: number; h: number }[] = [];
  private roomImages: Phaser.GameObjects.Image[] = [];

  private puppet!: ChogSprite;
  private trapSprites: Phaser.GameObjects.Image[] = [];
  private hunchSprites: Phaser.GameObjects.Image[] = [];
  private guard!: Phaser.GameObjects.Image;
  private door!: Phaser.GameObjects.Image;

  private hud!: {
    timer: Phaser.GameObjects.Text;
    hearts: Phaser.GameObjects.Text;
    loot: Phaser.GameObjects.Text;
    lootBar: Phaser.GameObjects.Graphics;
    scout: Phaser.GameObjects.Text;
    special: Phaser.GameObjects.Text;
    toast: Phaser.GameObjects.Text;
    ring: Phaser.GameObjects.Graphics;
    map: Phaser.GameObjects.Graphics;
    room: Phaser.GameObjects.Text;
  };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super("raid");
  }

  preload() {
    this.load.image("chog-sheet", "/sprites/chog.png");
    this.load.image("chog1-portrait", "/chogs/1-portrait.png");
  }

  create() {
    this.setup = demoSetup();
    this.s = createRaid(this.setup);

    bakeRooms(this, themeFor(DEMO_TARGET.traits.Background));
    bakeSkyline(this, 1800, 880);
    bakeForeground(this);
    bakeVault(this);
    bakeTraps(this);
    bakeSack(this);
    bakeFx(this);
    makeChogTexture(this, DEMO_RAIDER.traits.Skin, "chog-raider");

    this.cameras.main.setBounds(0, 0, COLS * ROOM_PX, FLOORS * VIEW_H);
    this.cameras.main.setBackgroundColor(INK);

    // night city patches behind each window; their crop shifts with the camera for depth
    for (const [room, win] of Object.entries(WINDOWS)) {
      if (!win) continue;
      const r = Number(room);
      const [wx, wy, ww, wh] = win;
      const img = this.add.image(colOf(r) * ROOM_PX + wx - 4, (FLOORS - 1 - floorOf(r)) * VIEW_H + wy, "skyline").setOrigin(0, 0);
      this.skyPatches.push({ img, w: ww, h: wh });
    }
    for (let r = 0; r < ROOMS; r++) {
      const y = (FLOORS - 1 - floorOf(r)) * VIEW_H;
      this.roomImages.push(this.boil(this.add.image(colOf(r) * ROOM_PX - 4, y, `room${r}_0`).setOrigin(0, 0), `room${r}`));
    }
    this.boil(this.add.image(worldX(VAULT_ROOM, VAULT_X) + 10, floorY(VAULT_ROOM) + 4, "vault_0").setOrigin(0.5, 1), "vault");
    this.door = this.add.image(colOf(LOCKED_DOOR.left) * ROOM_PX + ROOM_PX - 20, floorY(LOCKED_DOOR.left) + 2, "lockdoor_0").setOrigin(0.5, 1);
    this.boil(this.door, "lockdoor");
    this.guard = this.add.image(0, floorY(GUARD.room) + 6, "guard_0").setOrigin(0.5, 1).setScale(0.9);
    this.boil(this.guard, "guard");

    this.s.traps.forEach((tr, i) => {
      const img = this.add.image(worldX(tr.room, tr.x), floorY(tr.room) + 8, `trap:${tr.kind}_0`).setOrigin(0.5, 1).setAlpha(0);
      this.boil(img, `trap:${tr.kind}`);
      this.trapSprites[i] = img;
      const h = this.add.image(worldX(tr.room, tr.x), floorY(tr.room) - TRAP_H - 10, "hunch_0").setAlpha(0);
      this.boil(h, "hunch");
      this.hunchSprites[i] = h;
    });

    // foreground props the Chog walks behind
    this.boil(this.add.image(worldX(1, 40), floorY(1) + 40, "fgplant_0").setOrigin(0.5, 1).setDepth(5).setAlpha(0.95), "fgplant");
    this.boil(this.add.image(worldX(3, 940), floorY(3) + 40, "fgplant_0").setOrigin(0.5, 1).setDepth(5).setAlpha(0.95).setFlipX(true), "fgplant");
    this.motes();

    this.puppet = new ChogSprite(this, "chog-raider", floorY(0));
    this.cameras.main.startFollow(this.puppet.root, true, 0.12, 0.12, 0, 140);
    this.buildHud();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,Q,E,F") as Record<string, Phaser.Input.Keyboard.Key>;
  }

  // ------------------------------------------------------------ building

  private boil(img: Phaser.GameObjects.Image, key: string) {
    this.boilers.push({ img, key });
    return img;
  }

  private buildHud() {
    const W = this.scale.width;
    const H = this.scale.height;
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(100);

    fixed(this.add.graphics()).fillStyle(0x1c1618, 0.88).fillRoundedRect(16, 14, W - 32, 74, 18);
    fixed(this.add.text(36, 26, DEMO_TARGET.name.toUpperCase(), { fontFamily: FONT_TITLE, fontSize: "26px", color: PAPER }));
    fixed(
      this.add.text(36, 58, `Uncommon hideout · ${this.setup.hideout.traps.length} traps hidden · 2 floors`, {
        fontFamily: FONT_BODY,
        fontSize: "20px",
        color: "#c9bfae",
      }),
    );
    fixed(
      this.add
        .text(W / 2, 30, AUTOPILOT ? "DEMO · AUTOPILOT" : "DEMO RAID", {
          fontFamily: FONT_BODY,
          fontSize: "16px",
          color: INK,
          backgroundColor: "#f0c35a",
          padding: { x: 10, y: 2 },
        })
        .setOrigin(0.5, 0),
    );
    const timer = fixed(this.add.text(W / 2, 52, "", { fontFamily: FONT_TITLE, fontSize: "34px", color: PAPER }).setOrigin(0.5, 0));
    const hearts = fixed(this.add.text(W - 380, 30, "", { fontFamily: FONT_TITLE, fontSize: "30px", color: ACCENT }));
    const loot = fixed(this.add.text(W - 40, 26, "", { fontFamily: FONT_TITLE, fontSize: "24px", color: "#f0c35a" }).setOrigin(1, 0));
    const lootBar = fixed(this.add.graphics());

    // bottom-left: who you are and your gadgets
    fixed(this.add.graphics()).fillStyle(0x1c1618, 0.9).fillRoundedRect(16, H - 112, 560, 96, 18);
    fixed(this.add.image(64, H - 64, "chog1-portrait").setDisplaySize(76, 76));
    fixed(this.add.graphics()).lineStyle(4, 0xf3eadb, 1).strokeRoundedRect(25, H - 103, 78, 78, 12);
    fixed(this.add.text(118, H - 104, DEMO_RAIDER.name, { fontFamily: FONT_TITLE, fontSize: "22px", color: PAPER }));
    const l = this.setup.raider;
    fixed(this.add.text(118, H - 76, `${l.tier} · ${l.body ?? "—"} · ${l.head ?? "—"}`, { fontFamily: FONT_BODY, fontSize: "18px", color: "#c9bfae" }));
    const chip = (x: number) =>
      fixed(this.add.text(x, H - 50, "", { fontFamily: FONT_BODY, fontSize: "19px", color: INK, backgroundColor: PAPER, padding: { x: 10, y: 4 } }));
    const scout = chip(118);
    const special = chip(300);

    // bottom-right: floor plan and controls
    fixed(this.add.graphics()).fillStyle(0x1c1618, 0.9).fillRoundedRect(W - 236, H - 160, 220, 108, 16);
    const room = fixed(this.add.text(W - 222, H - 154, "", { fontFamily: FONT_TITLE, fontSize: "18px", color: PAPER }));
    const map = fixed(this.add.graphics());
    fixed(
      this.add
        .text(W - 16, H - 16, "← → move  SPACE jump  ↑↓ stairs  F grab  Q scout  E special", {
          fontFamily: FONT_BODY,
          fontSize: "17px",
          color: PAPER,
          backgroundColor: "rgba(28,22,24,0.75)",
          padding: { x: 10, y: 4 },
        })
        .setOrigin(1, 1),
    );

    const toast = fixed(
      this.add
        .text(W / 2, 150, "", { fontFamily: FONT_TITLE, fontSize: "44px", color: PAPER, stroke: INK, strokeThickness: 10 })
        .setOrigin(0.5)
        .setAlpha(0),
    );
    const ring = this.add.graphics();
    this.hud = { timer, hearts, loot, lootBar, scout, special, toast, ring, map, room };
  }

  /** Dust drifting through the lamp light. */
  private motes() {
    const lamps: [number, number][] = [
      [0, 600],
      [3, 600],
      [5, 600],
    ];
    for (const [room, lx] of lamps) {
      for (let i = 0; i < 9; i++) {
        const x0 = worldX(room, lx) + Phaser.Math.Between(-160, 160);
        const y0 = floorY(room) - Phaser.Math.Between(120, 380);
        const dot = this.add.circle(x0, y0, Phaser.Math.Between(2, 3), 0xfff1c4, 0.7);
        this.tweens.add({
          targets: dot,
          x: x0 + Phaser.Math.Between(-40, 40),
          y: y0 - Phaser.Math.Between(30, 90),
          alpha: { from: 0, to: 0.8 },
          duration: Phaser.Math.Between(2600, 5200),
          yoyo: true,
          repeat: -1,
          delay: Phaser.Math.Between(0, 2000),
          ease: "Sine.InOut",
        });
      }
    }
  }

  // ------------------------------------------------------------ loop

  update(_time: number, delta: number) {
    this.boilT += delta;
    if (this.boilT > BOIL_MS) {
      this.boilT = 0;
      this.boilFrame = (this.boilFrame + 1) % BOIL_FRAMES;
      for (const b of this.boilers) b.img.setTexture(`${this.textureKey(b)}_${this.boilFrame}`);
    }

    if (this.hitStop > 0) {
      this.hitStop -= delta;
    } else if (!this.s.result && (FREEZE_AT === null || this.s.t < FREEZE_AT)) {
      this.acc += delta;
      while (this.acc >= TICK_MS && !this.s.result && (FREEZE_AT === null || this.s.t < FREEZE_AT)) {
        this.acc -= TICK_MS;
        step(this.s, this.setup, AUTOPILOT ? this.bot(this.s) : this.readKeys());
        this.drainEvents();
        if (this.hitStop > 0) break;
      }
    }
    this.render();
  }

  /** Boiling objects whose texture family changes with game state. */
  private textureKey(b: { img: Phaser.GameObjects.Image; key: string }) {
    if (b.img === this.door) return this.s.doorOpen ? "lockdoor-open" : "lockdoor";
    if (b.img === this.guard) return this.s.guardOut ? "guard-ko" : "guard";
    return b.key;
  }

  private readKeys(): number {
    const k = this.keys;
    let m = 0;
    if (k.LEFT!.isDown || k.A!.isDown) m |= Input.LEFT;
    if (k.RIGHT!.isDown || k.D!.isDown) m |= Input.RIGHT;
    if (k.UP!.isDown || k.W!.isDown) m |= Input.UP;
    if (k.DOWN!.isDown || k.S!.isDown) m |= Input.DOWN;
    if (k.SPACE!.isDown) m |= Input.JUMP;
    if (k.Q!.isDown) m |= Input.SCOUT;
    if (k.E!.isDown) m |= Input.SPECIAL;
    if (k.F!.isDown) m |= Input.GRAB;
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
        if (e.kind === "Crybaby Alarm") this.puppet.sweat();
        cam.shake(180, 0.008);
        cam.flash(80, 255, 240, 220);
        this.toast(e.kind.toUpperCase() + "!", ACCENT);
        const spr = this.trapSprites[e.trap]!.setAlpha(1);
        this.tweens.add({ targets: spr, scaleY: 1.35, scaleX: 0.85, yoyo: true, duration: 110 });
        this.burst(spr.x, spr.y - 30, 0xe0528a);
        break;
      }
      case "caught":
        this.hitStop = 120;
        cam.shake(220, 0.012);
        this.toast("SECURITY!", ACCENT);
        this.tweens.add({ targets: this.guard, scaleY: 1.05, yoyo: true, duration: 120 });
        break;
      case "guard-out":
        this.toast("Guard knocked out", "#7ec4a8");
        break;
      case "door":
        cam.shake(e.by === "Rage Horns" ? 260 : 120, e.by === "Rage Horns" ? 0.014 : 0.006);
        this.toast(e.by === "Rage Horns" ? "SMASHED THE DOOR" : "Door unlocked", "#7ec4a8");
        this.burst(this.door.x, this.door.y - 140, 0x8a5a3c, 10);
        break;
      case "room":
        this.visited.add(e.room);
        break;
      case "blocked":
        this.toast(`${e.by} blocked it`, "#7ec4a8");
        break;
      case "reveal":
        if (e.traps.length) this.toast(`${e.by}: ${e.traps.length} trap${e.traps.length > 1 ? "s" : ""} spotted`, "#f0c35a");
        e.traps.forEach((i) => this.tweens.add({ targets: this.trapSprites[i], alpha: 1, duration: 260 }));
        break;
      case "disarm":
        this.toast(`${e.by}: disarmed`, "#7ec4a8");
        this.tweens.add({ targets: this.trapSprites[e.trap], alpha: 0.35, angle: 12, duration: 200 });
        break;
      case "grab":
        this.hitStop = 140;
        cam.shake(240, 0.01);
        this.toast(`SWIPED ${DEMO_TARGET.capChog.toLocaleString()} $CHOG`, "#f0c35a");
        this.burst(this.puppet.root.x, this.puppet.root.y - 140, 0xf0c35a, 26);
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
    const head = this.add.image(-190, 40, "chog-raider", won ? "win" : "ko").setOrigin(0.5, 1).setScale(0.75);
    const title = this.add.text(-90, -130, won ? "CLEAN SWIPE" : "CAUGHT", { fontFamily: FONT_TITLE, fontSize: "46px", color: won ? INK : ACCENT });
    const amount = this.add.text(-90, -70, won ? `+${loot.toLocaleString()} $CHOG` : "+0 $CHOG", { fontFamily: FONT_TITLE, fontSize: "40px", color: "#c79a2a" });
    const s = this.s;
    const secs = Math.round(s.t / TICK_HZ);
    const traps = s.events.filter((e) => e.type === "trap").length;
    const stats = this.add.text(
      -90,
      -14,
      `${secs}s run · ${traps} trap${traps === 1 ? "" : "s"} hit · ${s.hp} hearts left\n${this.visited.size} of ${ROOMS} rooms · from ${DEMO_TARGET.name}`,
      { fontFamily: FONT_BODY, fontSize: "22px", color: "#5a4d50", lineSpacing: 4 },
    );
    const btn = this.add.graphics();
    btn.fillStyle(0xe0528a, 1).fillRoundedRect(-90, 74, 330, 58, 16);
    btn.lineStyle(4, 0x1c1618, 1).strokeRoundedRect(-90, 74, 330, 58, 16);
    const cta = this.add.text(75, 103, won ? "Settle on Monad" : "Try again", { fontFamily: FONT_TITLE, fontSize: "26px", color: PAPER }).setOrigin(0.5);
    const note = this.add.text(-270, 128, "demo", { fontFamily: FONT_BODY, fontSize: "16px", color: "#8a7d70" });
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
    const cam = this.cameras.main;
    const view = cam.worldView;
    // skip rooms that are off screen
    for (const img of this.roomImages) {
      img.setVisible(img.x < view.right && img.x + img.width > view.x && img.y < view.bottom && img.y + img.height > view.y);
    }
    for (const p of this.skyPatches) {
      const cx = Phaser.Math.Clamp(p.img.x * 0.45 - cam.scrollX * 0.25, 0, 1800 - p.w);
      const cy = Phaser.Math.Clamp(p.img.y * 0.35 - cam.scrollY * 0.15 + 40, 0, 880 - p.h);
      p.img.setCrop(cx, cy, p.w, p.h).setPosition(p.img.x, p.img.y);
      p.img.setDisplayOrigin(cx, cy);
    }
    let x = worldX(s.room, s.x);
    let fy = floorY(s.room);
    let alpha = 1;
    if (s.climb) {
      const k = 1 - s.climb.left / s.climb.total;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      x = Phaser.Math.Linear(worldX(s.climb.from.room, s.climb.from.x), worldX(s.climb.to.room, s.climb.to.x), e);
      fy = Phaser.Math.Linear(floorY(s.climb.from.room), floorY(s.climb.to.room), e);
      if (s.climb.kind === "vent") alpha = 0.15; // crawling inside the duct
    }
    this.puppet.update(s, x, fy, this.game.loop.delta);
    this.puppet.root.setAlpha(s.result === "knocked-out" ? 0.6 : alpha);

    // guard patrol
    this.guard.setX(worldX(GUARD.room, guardX(s.t))).setFlipX(guardFacing(s.t) < 0);

    s.traps.forEach((tr, i) => this.hunchSprites[i]!.setAlpha(tr.hunched && !tr.revealed && tr.armed ? 0.9 : 0));

    // progress ring: vault grab or door picking
    const ring = this.hud.ring.clear();
    const progress = (cx: number, cy: number, frac: number, color: number) => {
      ring.lineStyle(10, color, 1).beginPath();
      ring.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ring.strokePath();
    };
    if (s.grab > 0 && s.lootBps === 0) progress(x, fy - 290, s.grab / (this.setup.raider.head === "Lockpick" ? 15 : 45), 0xf0c35a);
    if (s.doorWork > 0 && !s.doorOpen) progress(this.door.x, this.door.y - 300, s.doorWork / (this.setup.raider.head === "Lockpick" ? 30 : 90), 0x7ec4a8);

    // HUD
    const secs = Math.max(0, Math.ceil(s.timeLeft / TICK_HZ));
    this.hud.timer.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
    this.hud.timer.setColor(s.timeLeft < RAID_TICKS / 4 ? ACCENT : PAPER);
    this.hud.hearts.setText("♥".repeat(Math.max(0, s.hp)) + "♡".repeat(Math.max(0, 3 - s.hp)));
    const carried = Math.floor((DEMO_TARGET.capChog * s.lootBps) / 10_000);
    this.hud.loot.setText(`${carried.toLocaleString()} / ${DEMO_TARGET.capChog.toLocaleString()} $CHOG`);
    const W = this.scale.width;
    const H = this.scale.height;
    this.hud.lootBar
      .clear()
      .fillStyle(0x3b3336, 1)
      .fillRoundedRect(W - 260, 62, 220, 12, 6)
      .fillStyle(0xf0c35a, 1)
      .fillRoundedRect(W - 260, 62, Math.max(12, 220 * (s.lootBps / 10_000)), 12, 6);
    this.hud.scout.setText(`Q · ${this.setup.raider.scout} ×${s.scoutCharges}`);
    this.hud.special.setText(`E · ${this.setup.raider.special ?? "none"}${s.specialUsed ? " (used)" : ""}`);
    this.hud.room.setText(s.climb ? (s.climb.kind === "vent" ? "In the vent…" : "On the stairs…") : ROOM_NAMES[s.room]!.toUpperCase());

    // floor plan: visited rooms, where you are, the vault
    const m = this.hud.map.clear();
    const cw = 58, ch = 28, ox = W - 222, oy = H - 124;
    for (let r = 0; r < ROOMS; r++) {
      const cx = ox + colOf(r) * (cw + 8);
      const cy = oy + (FLOORS - 1 - floorOf(r)) * (ch + 8);
      const here = r === s.room && !s.climb;
      m.fillStyle(here ? 0xe0528a : this.visited.has(r) ? 0xf3eadb : 0x3b3336, 1).fillRoundedRect(cx, cy, cw, ch, 6);
      if (r === VAULT_ROOM) m.fillStyle(0xf0c35a, 1).fillCircle(cx + cw - 10, cy + 10, 6);
    }
    // locked door marker between bedroom and vault
    const dx = ox + colOf(LOCKED_DOOR.right) * (cw + 8) - 6;
    m.fillStyle(s.doorOpen ? 0x7ec4a8 : 0xc0392b, 1).fillRect(dx, oy + 6, 4, ch - 12);
  }
}
