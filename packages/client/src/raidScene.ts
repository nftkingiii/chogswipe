import Phaser from "phaser";
import {
  COLS,
  FLOORS,
  Input,
  HOUSE_PLAN,
  RAID_TICKS,
  ROOMS,
  ROOM_NAMES,
  ROOM_W,
  TICK_HZ,
  colOf,
  createRaid,
  floorOf,
  makeBot,
  steamOn,
  vaultOnRight,
  type FloorPlan,
  step,
  type RaidEvent,
  type RaidSetup,
  type RaidState,
  type Route,
} from "@chogswipe/sim";
import { ACCENT, BOIL_FRAMES, FLOOR_Y, INK, PAPER, ROOM_PX, SKIN, TRAP_H, VIEW_H, bakeSack, bakeTraps, bakeVault } from "./art.js";
import { DEMO_ROSTER, IMAGE_BASE, type RosterChog } from "./roster.js";
import { LOCATIONS, hideoutPlan, loadoutFor, starsFor, type Location } from "@chogswipe/sim";
import { clock, markCleared, recordRun, starText } from "./progress.js";
import { castReady, loadCast } from "./cast.js";
import { isMuted, sfx, startMusic, stopMusic, toggleMute, unlockAudio } from "./sfx.js";
import { finishDaily, finishRaid, type DailyTicket, type RaidStart, type SignedResult } from "./api.js";
import { askForm } from "./dom.js";
import { imageUrl, refresh } from "./session.js";
import { portraitImage } from "./portraits.js";
import { settle } from "./tx.js";
import { formatUnits } from "viem";
import type { InputLog, Traits } from "@chogswipe/sim";
import { bakeFx } from "./puppet.js";
import { ChogSprite, makeChogTexture } from "./chogSprite.js";
import { bakeForeground, bakeRooms, bakeSkyline, windowsFor } from "./rooms.js";
import { themeFor } from "./theme.js";
import { addSurprises, type Surprises } from "./surprises.js";

const TICK_MS = 1000 / TICK_HZ;

/** A line from the Chog team after a lore heist. */
const CREW = ["Benja", "Toad", "PingPing", "Venty", "RayJ"] as const;
function crewQuip(slug: string, won = true): string {
  const who = CREW[[...slug].reduce((a, c) => a + c.charCodeAt(0), 0) % CREW.length]!;
  return won ? `${who} is going to want that back.` : `${who} saw the whole thing. Try again.`;
}
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
  private guards: Phaser.GameObjects.Image[] = [];
  private monGuard = false;
  private guardMarks: Phaser.GameObjects.Text[] = [];
  private hazardFx!: Phaser.GameObjects.Graphics;
  private surprises!: Surprises;
  private frontDoor!: Phaser.GameObjects.Image;
  private enterFade = { v: 0 };
  private exiting = false;
  private lastStepT = -1;
  private touchMask = 0;
  private lastJumpT = -1;
  private hintsShown = new Set<string>();
  private hint?: Phaser.GameObjects.Container;
  private door: Phaser.GameObjects.Image | null = null;

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

  private chog: RosterChog = DEMO_ROSTER[0]!;
  private loc: Location = LOCATIONS[0]!;
  private cap = 2_000;

  constructor() {
    super("raid");
  }

  /** Live raid: the referee chose the seed and layout, and verifies our recorded inputs at the end. */
  private live: { start: RaidStart; target: { id: number; name: string; traits: Traits } } | null = null;
  /** Replay of a raid against one of our hideouts. */
  private replay: { inputs: InputLog; seed: number; raider: RosterChog; name: string } | null = null;
  /** Daily heist: the server's seed, and the ticket our inputs go back with for the leaderboard. */
  private daily: DailyTicket | null = null;
  private log: [number, number][] = [];
  private lastMask = -1;
  private signed: SignedResult | null = null;

  init(data: {
    chog?: RosterChog;
    location?: Location;
    live?: { start: RaidStart; target: { id: number; name: string; traits: Traits } };
    replay?: { inputs: InputLog; seed: number; raider: RosterChog; name: string; defender: RosterChog; traps: Location["traps"]; plan?: string };
    daily?: DailyTicket;
  }) {
    this.chog = data.replay?.raider ?? data.chog ?? DEMO_ROSTER[0]!;
    this.live = data.live ?? null;
    this.daily = data.daily ?? null;
    this.replay = data.replay ? { inputs: data.replay.inputs, seed: data.replay.seed, raider: data.replay.raider, name: data.replay.name } : null;
    this.log = [];
    this.lastMask = -1;
    this.signed = null;
    const house = this.live ? LOCATIONS.find((l) => l.id === this.live!.target.id) : undefined;
    if (data.replay) {
      const d = data.replay.defender;
      const hp = hideoutPlan(data.replay.plan);
      this.loc = { ...LOCATIONS[0]!, id: d.id, slug: `chog-${d.id}`, name: data.replay.name, traits: d.traits, traps: data.replay.traps, rooms: [...ROOM_NAMES] as Location["rooms"], guard: hp.guard, loot: "$CHOG", plan: hp.plan };
    } else if (this.live && !house) {
      const t = this.live.target;
      // player hideouts use the floor plan their owner picked
      const hp = hideoutPlan(this.live.start.plan);
      this.loc = { ...LOCATIONS[0]!, id: t.id, slug: `chog-${t.id}`, name: t.name, traits: t.traits, traps: this.live.start.traps, rooms: [...ROOM_NAMES] as Location["rooms"], guard: hp.guard, loot: "$CHOG", plan: hp.plan };
    } else {
      const slug = this.daily?.slug ?? params.get("heist");
      this.loc = house ?? (this.daily ? undefined : data.location) ?? LOCATIONS.find((l) => l.slug === slug) ?? LOCATIONS[0]!;
    }
    // demo vault sizes until the house vaults are funded; live raids use the referee's cap
    this.cap = this.live ? Math.floor(Number(formatUnits(BigInt(this.live.start.capAmount), 18))) : 2_000 + Math.max(0, LOCATIONS.indexOf(this.loc)) * 1_000;
    // reset per-run state when the scene is restarted
    this.acc = this.hitStop = this.seenEvents = this.boilT = this.boilFrame = 0;
    this.boilers = [];
    this.trapSprites = [];
    this.hunchSprites = [];
    this.skyPatches = [];
    this.roomImages = [];
    this.visited = new Set([0]);
    this.hintsShown = new Set();
    this.hint = undefined;
    this.bot = makeBot({ plan: this.loc.plan, scout: true, route: params.has("route") ? ROUTE : undefined });
    this.guards = [];
    this.guardMarks = [];
    this.door = null;
  }

  private get plan(): FloorPlan {
    return this.loc.plan;
  }

  preload() {
    this.load.image("chog-sheet", "/sprites/chog.webp");
    loadCast(this);
  }

  create() {
    this.setup = this.live
      ? { seed: this.live.start.seed, raider: this.live.start.raider, hideout: { defender: this.live.start.defender, traps: this.live.start.traps, plan: this.plan } }
      : {
          seed: this.replay?.seed ?? this.daily?.seed ?? ((Date.now() & 0xffff) ^ this.chog.id),
          raider: loadoutFor(this.chog.traits),
          hideout: { defender: loadoutFor(this.loc.traits), traps: this.loc.traps, plan: this.plan },
        };
    this.s = createRaid(this.setup);

    const theme = themeFor(this.loc.traits.Background, this.loc.rooms, this.loc.slug);
    bakeRooms(this, theme, this.plan);
    const skyline = bakeSkyline(this, 1800, 880, theme.decor?.sky);
    bakeForeground(this, theme.decor);
    bakeVault(this);
    bakeTraps(this);
    bakeSack(this);
    bakeFx(this);
    makeChogTexture(this, this.chog.traits.Skin, "chog-raider");

    this.cameras.main.setBounds(0, 0, COLS * ROOM_PX, FLOORS * VIEW_H);
    this.cameras.main.setBackgroundColor(INK);

    // night city patches behind each window; their crop shifts with the camera for depth
    for (const [room, win] of Object.entries(windowsFor(this.plan, theme.decor?.art))) {
      if (!win) continue;
      const r = Number(room);
      const [wx, wy, ww, wh] = win;
      const img = this.add.image(colOf(r) * ROOM_PX + wx - 4, (FLOORS - 1 - floorOf(r)) * VIEW_H + wy, skyline).setOrigin(0, 0).setDepth(-20);
      this.skyPatches.push({ img, w: ww, h: wh });
    }
    for (let r = 0; r < ROOMS; r++) {
      const y = (FLOORS - 1 - floorOf(r)) * VIEW_H;
      // explicit depths: with everything on depth 0, WebGL on some screens drew the rooms (stairs and all) over the guards
      this.roomImages.push(this.boil(this.add.image(colOf(r) * ROOM_PX - 4, y, `room${r}_0`).setOrigin(0, 0).setDepth(-10), `room${r}`));
    }
    const v = this.plan.vault;
    this.boil(this.add.image(worldX(v.room, v.x) + (vaultOnRight(this.plan) ? 10 : -10), floorY(v.room) + 4, "vault_0").setOrigin(0.5, 1).setFlipX(!vaultOnRight(this.plan)), "vault");
    const d = this.plan.lockedDoor;
    if (d) {
      this.door = this.add.image(colOf(d.left) * ROOM_PX + ROOM_PX - 20, floorY(d.left) + 2, "lockdoor_0").setOrigin(0.5, 1);
      this.boil(this.door, "lockdoor");
    }
    this.portals();
    this.hazardFx = this.add.graphics().setDepth(6);
    // the location's monanimal patrols; the Fwog bouncer stands in otherwise
    this.monGuard = this.loc.guard !== "fwog" && castReady(this);
    for (const post of this.plan.guards) {
      let img: Phaser.GameObjects.Image;
      if (this.monGuard) img = this.add.image(0, floorY(post.room) + 10, "cast", this.loc.guard).setOrigin(0.5, 1).setScale(0.78);
      else {
        img = this.add.image(0, floorY(post.room) + 6, "guard_0").setOrigin(0.5, 1).setScale(0.9);
        this.boil(img, "guard");
      }
      this.guards.push(img);
      // "!" when it spots the raider, "?" when it loses them
      this.guardMarks.push(
        this.add.text(0, 0, "!", { fontFamily: FONT_TITLE, fontSize: "64px", color: ACCENT, stroke: INK, strokeThickness: 8 }).setOrigin(0.5, 1).setDepth(40).setAlpha(0),
      );
    }

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
    this.surprises = addSurprises(this, this.loc.slug, worldX);

    // the front door: open as the Chog sneaks in, then swings shut
    this.frontDoor = this.add.image(worldX(0, 0) + 70, floorY(0) + 4, "frontdoor-open_0").setOrigin(0.5, 1);
    this.exiting = false;
    this.enterFade = { v: 0 };
    this.tweens.add({ targets: this.enterFade, v: 1, duration: 450, ease: "Quad.Out" });
    this.time.delayedCall(900, () => this.frontDoor.setTexture("frontdoor_0"));
    this.puppet = new ChogSprite(this, "chog-raider", floorY(0), this.chog.traits);
    this.cameras.main.startFollow(this.puppet.root, true, 0.12, 0.12, 0, 140);
    this.buildHud();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,Q,E,F") as Record<string, Phaser.Input.Keyboard.Key>;
    // sound starts on the first key or tap; M mutes
    const start = () => {
      unlockAudio();
      startMusic();
    };
    kb.once("keydown", start);
    // touch buttons appear on the first real touch (many laptops report touch support without being used that way)
    if (params.has("touch")) this.touchControls();
    else this.input.once("pointerdown", (p: Phaser.Input.Pointer) => p.wasTouch && this.touchControls());
    this.input.once("pointerdown", start);
    kb.on("keydown-M", () => this.toast(toggleMute() ? "Sound off" : "Sound on", PAPER));
    this.events.once("shutdown", () => stopMusic());
    if (!isMuted()) startMusic();
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
    fixed(this.add.text(36, 26, this.loc.name.toUpperCase(), { fontFamily: FONT_TITLE, fontSize: "26px", color: PAPER }));
    fixed(
      this.add.text(36, 58, `${this.setup.hideout.defender.tier} hideout · ${this.setup.hideout.traps.length} traps hidden · 2 floors`, {
        fontFamily: FONT_BODY,
        fontSize: "20px",
        color: "#c9bfae",
      }),
    );
    fixed(
      this.add
        .text(W / 2, 30, this.replay ? "REPLAY" : this.live ? "LIVE RAID · MONAD" : AUTOPILOT ? "DEMO · AUTOPILOT" : "DEMO RAID", {
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
    fixed(portraitImage(this, 64, H - 64, `portrait:${this.chog.id}`, imageUrl(this.chog), 76));
    fixed(this.add.graphics()).lineStyle(4, 0xf3eadb, 1).strokeRoundedRect(25, H - 103, 78, 78, 12);
    fixed(this.add.text(118, H - 104, `Chog #${this.chog.id}`, { fontFamily: FONT_TITLE, fontSize: "22px", color: PAPER }));
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
      [0, 380],
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
        const mask = this.replay ? this.replayMask() : AUTOPILOT && !this.live ? this.bot(this.s) : this.readKeys();
        if (mask !== this.lastMask) {
          this.log.push([this.s.t, mask]); // the input log the referee replays
          this.lastMask = mask;
        }
        step(this.s, this.setup, mask);
        this.drainEvents();
        if (this.hitStop > 0) break;
      }
    }
    this.render();
  }

  /** Boiling objects whose texture family changes with game state. */
  private textureKey(b: { img: Phaser.GameObjects.Image; key: string }) {
    if (b.img === this.door) return this.s.doorOpen ? "lockdoor-open" : "lockdoor";
    const gi = this.guards.indexOf(b.img);
    if (gi >= 0) return this.s.guards[gi]?.out ? "guard-ko" : "guard";
    return b.key;
  }

  private replayIdx = 0;
  private replayCur = 0;
  /** Feed a recorded input log back in, tick by tick. */
  private replayMask(): number {
    const log = this.replay!.inputs;
    while (this.replayIdx < log.length && log[this.replayIdx]![0] <= this.s.t) this.replayCur = log[this.replayIdx++]![1];
    return this.replayCur;
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
    return m | this.touchMask;
  }

  /** On-screen buttons for phones and tablets. Each button holds its input bit while pressed. */
  private touchControls() {
    this.input.addPointer(3);
    this.touchMask = 0;
    const H = this.scale.height;
    const W = this.scale.width;
    const pad = (x: number, y: number, r: number, label: string, bit: number) => {
      const c = this.add.circle(x, y, r, 0x1c1618, 0.55).setStrokeStyle(4, 0xf3eadb, 0.9).setScrollFactor(0).setDepth(150).setInteractive();
      this.add.text(x, y, label, { fontFamily: FONT_TITLE, fontSize: `${Math.round(r * 0.55)}px`, color: PAPER }).setOrigin(0.5).setScrollFactor(0).setDepth(151);
      const on = () => ((this.touchMask |= bit), c.setFillStyle(0xe0528a, 0.8));
      const off = () => ((this.touchMask &= ~bit), c.setFillStyle(0x1c1618, 0.55));
      c.on("pointerdown", () => {
        unlockAudio();
        on();
      });
      c.on("pointerup", off);
      c.on("pointerout", off);
    };
    pad(90, H - 200, 52, "◀", Input.LEFT);
    pad(210, H - 200, 52, "▶", Input.RIGHT);
    pad(150, H - 300, 40, "▲", Input.UP);
    pad(150, H - 112, 40, "▼", Input.DOWN);
    pad(W - 110, H - 200, 60, "JUMP", Input.JUMP);
    pad(W - 240, H - 150, 44, "F", Input.GRAB);
    pad(W - 240, H - 260, 40, "Q", Input.SCOUT);
    pad(W - 120, H - 330, 40, "E", Input.SPECIAL);
  }

  private drainEvents() {
    const ev = this.s.events;
    while (this.seenEvents < ev.length) this.onEvent(ev[this.seenEvents++]!);
  }

  private onEvent(e: RaidEvent) {
    const cam = this.cameras.main;
    switch (e.type) {
      case "trap": {
        sfx.trap(e.kind);
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
      case "spotted":
        sfx.spotted();
        this.toast("SPOTTED! RUN!", ACCENT);
        this.guardMarks[e.guard]?.setText("!").setColor(ACCENT).setAlpha(1).setScale(0.4);
        this.tweens.add({ targets: this.guardMarks[e.guard], scale: 1, duration: 260, ease: "Back.Out" });
        break;
      case "lost":
        this.guardMarks[e.guard]?.setText("?").setColor("#f0c35a").setAlpha(1).setScale(1);
        this.tweens.add({ targets: this.guardMarks[e.guard], alpha: 0, delay: 700, duration: 300 });
        break;
      case "caught":
        sfx.caught();
        this.hitStop = 160;
        cam.shake(260, 0.014);
        this.toast("GOTCHA!", ACCENT);
        {
          const g = this.guards[e.guard];
          if (g) this.tweens.add({ targets: g, scaleX: g.scaleX * 1.15, scaleY: g.scaleY * 1.12, yoyo: true, duration: 140, repeat: 1 });
        }
        break;
      case "guard-out":
        this.toast("Guard knocked out", "#7ec4a8");
        break;
      case "door":
        sfx.door(e.by === "Rage Horns");
        cam.shake(e.by === "Rage Horns" ? 260 : 120, e.by === "Rage Horns" ? 0.014 : 0.006);
        this.toast(e.by === "Rage Horns" ? "SMASHED THE DOOR" : "Door unlocked", "#7ec4a8");
        if (this.door) this.burst(this.door.x, this.door.y - 140, 0x8a5a3c, 10);
        break;
      case "room":
        this.visited.add(e.room);
        break;
      case "blocked":
        this.toast(`${e.by} blocked it`, "#7ec4a8");
        break;
      case "reveal":
        sfx.scout();
        if (e.traps.length) this.toast(`${e.by}: ${e.traps.length} trap${e.traps.length > 1 ? "s" : ""} spotted`, "#f0c35a");
        e.traps.forEach((i) => this.tweens.add({ targets: this.trapSprites[i], alpha: 1, duration: 260 }));
        break;
      case "disarm":
        sfx.disarm();
        this.toast(`${e.by}: disarmed`, "#7ec4a8");
        this.tweens.add({ targets: this.trapSprites[e.trap], alpha: 0.35, angle: 12, duration: 200 });
        break;
      case "grab":
        sfx.grab();
        this.hitStop = 140;
        cam.shake(240, 0.01);
        this.toast(`SWIPED ${this.cap.toLocaleString()} $CHOG`, "#f0c35a");
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
        this.hint?.destroy(); // the result card takes over
        this.hint = undefined;
        stopMusic();
        if (e.result === "escaped") sfx.win();
        else sfx.lose();
        this.toast(e.result === "escaped" ? "ESCAPED!" : e.result === "knocked-out" ? "KNOCKED OUT" : e.result === "caught" ? "CAUGHT BY THE GUARD" : "TIME'S UP", e.result === "escaped" ? "#f0c35a" : ACCENT, 1200);
        const stars = starsFor({ result: e.result, lootBps: this.s.lootBps, ticks: this.s.t, events: this.s.events }, this.loc);
        const lore = !this.live && !this.replay;
        if (e.result === "escaped" && lore) markCleared(this.loc.slug);
        const best = lore && stars > 0 && !AUTOPILOT ? recordRun(this.loc.slug, this.s.t, stars) : false;
        if (e.result === "escaped") this.exitThroughDoor();
        if (this.live) {
          // the referee replays our inputs and signs the result if we escaped with loot
          finishRaid(this.live.start.raidId, this.log)
            .then((r) => {
              this.signed = r.result;
              this.resultCard(e.result);
            })
            .catch((err) => {
              this.toast(`Referee: ${(err as Error).message}`, ACCENT, 4000);
              this.resultCard(e.result);
            });
        } else if (this.daily) {
          this.time.delayedCall(700, () => void this.postDaily(e.result, stars));
        } else {
          this.time.delayedCall(700, () => this.resultCard(e.result, stars, best ? "New best time!" : undefined));
        }
        break;
    }
  }

  /** Escaped: the door swings open and the Chog runs out into the night. */
  private exitThroughDoor() {
    this.exiting = true;
    this.frontDoor.setTexture("frontdoor-open_0");
    const root = this.puppet.root;
    this.tweens.add({ targets: root, x: root.x - 70, scaleX: root.scaleX * 0.85, scaleY: root.scaleY * 0.85, alpha: 0, duration: 650, ease: "Quad.In" });
    this.time.delayedCall(700, () => this.frontDoor.setTexture("frontdoor_0"));
  }

  /** Daily heist: ask for a name and send the run to the leaderboard; the referee replays it. */
  private async postDaily(result: string, stars: number) {
    const daily = this.daily!;
    if (stars === 0) return this.resultCard(result, stars, "Escape with the loot to get a time on today's board.");
    let saved = "";
    try {
      saved = localStorage.getItem("chogswipe.name") ?? "";
    } catch {
      /* ignore */
    }
    const v = await askForm({
      title: `${clock(this.s.t)} · ${starText(stars)}`,
      blurb: "Put your time on today's daily heist board.",
      fields: [{ name: "name", label: "Name on the board (2–16 letters)", value: saved, maxLength: 16, required: true }],
      submit: "Post my time",
    });
    const name = v?.name;
    if (!name) return this.resultCard(result, stars, "Time not posted.");
    try {
      localStorage.setItem("chogswipe.name", name);
    } catch {
      /* ignore */
    }
    try {
      const r = await finishDaily({ ticket: daily.ticket, name, chogId: this.chog.id, inputs: this.log });
      const mine = r.top.find((x) => x.name.toLowerCase() === name.toLowerCase());
      const note = r.rank
        ? mine && mine.ticks < r.ticks
          ? `#${r.rank} on today's board (your best is still ${clock(mine.ticks)})`
          : `#${r.rank} on today's board!`
        : "Posted! Not in today's top 20 yet.";
      this.resultCard(result, stars, note);
    } catch (err) {
      this.resultCard(result, stars, `Board: ${(err as Error).message}`);
    }
  }

  private resultCard(result: string, stars = 0, extra?: string) {
    const W = this.scale.width;
    const H = this.scale.height;
    const won = result === "escaped";
    const loot = Math.floor((this.cap * this.s.lootBps) / 10_000);
    const c = this.add.container(W / 2, H / 2 + 20).setDepth(300).setAlpha(0).setScale(0.9);
    const shade = this.add.rectangle(0, -20, W, H, 0x1c1618, 0.55);
    const card = this.add.graphics();
    card.fillStyle(0xf3eadb, 1).fillRoundedRect(-300, -170, 600, 350, 26);
    card.lineStyle(6, 0x1c1618, 1).strokeRoundedRect(-300, -170, 600, 350, 26);
    const head = this.add.image(-190, 40, "chog-raider", won ? "win" : "ko").setOrigin(0.5, 1).setScale(0.75);
    const title = this.add.text(-90, -130, won ? "CLEAN SWIPE" : result === "timeout" ? "TIME'S UP" : result === "knocked-out" ? "KNOCKED OUT" : "CAUGHT", { fontFamily: FONT_TITLE, fontSize: "46px", color: won ? INK : ACCENT });
    const amount = this.add.text(-90, -70, won ? `+${loot.toLocaleString()} $CHOG` : "+0 $CHOG", { fontFamily: FONT_TITLE, fontSize: "40px", color: "#c79a2a" });
    const s = this.s;
    const secs = Math.round(s.t / TICK_HZ);
    const traps = s.events.filter((e) => e.type === "trap").length;
    const lore = !this.live && !this.replay;
    const stats = this.add.text(
      -90,
      -14,
      `${lore && won ? clock(s.t) : `${secs}s`} run${lore ? ` (par ${this.loc.par}s)` : ""} · ${traps} trap${traps === 1 ? "" : "s"} hit · ${s.hp} hearts left\n${this.visited.size} of ${ROOMS} rooms · from ${this.daily ? "today's daily heist" : this.loc.name}`,
      { fontFamily: FONT_BODY, fontSize: "22px", color: "#5a4d50", lineSpacing: 4 },
    );
    const btn = this.add.graphics();
    btn.fillStyle(0xe0528a, 1).fillRoundedRect(-90, 74, 330, 58, 16);
    btn.lineStyle(4, 0x1c1618, 1).strokeRoundedRect(-90, 74, 330, 58, 16);
    const label = this.replay ? "Back to history" : this.signed ? "Settle on Monad" : this.live ? "Back to targets" : "Back to the heists";
    const cta = this.add.text(75, 103, label, { fontFamily: FONT_TITLE, fontSize: "26px", color: PAPER }).setOrigin(0.5);
    const noteText = this.replay
      ? "replay of a raid on your hideout"
      : this.live
        ? this.signed
          ? `signed by the referee · settle within 15 min · ${formatUnits(BigInt(this.signed.amount), 18)} $CHOG`
          : "nothing to settle"
        : extra
          ? extra
          : won
            ? `swiped ${this.loc.loot}. ${crewQuip(this.loc.slug)}`
            : `${crewQuip(this.loc.slug, false)}`;
    const note = this.add.text(0, 136, noteText, { fontFamily: FONT_BODY, fontSize: "16px", color: "#8a7d70", align: "center", wordWrap: { width: 540 } }).setOrigin(0.5, 0);
    let busy = false;
    const go = async () => {
      if (busy) return;
      if (this.replay) return this.scene.start("history");
      if (!this.signed) return this.scene.start(this.live ? "players" : "map", { chog: this.chog });
      busy = true;
      cta.setText("Confirm in wallet…");
      try {
        const hash = await settle(this.signed);
        note.setText(`settled on Monad · tx ${hash.slice(0, 10)}…`);
        cta.setText("Back to targets");
        this.signed = null;
        await refresh().catch(() => undefined);
      } catch (err) {
        cta.setText("Settle on Monad");
        note.setText(`not settled: ${(err as Error).message.split("\n")[0]}`);
      }
      busy = false;
    };
    btn.setInteractive(new Phaser.Geom.Rectangle(-90, 74, 330, 58), Phaser.Geom.Rectangle.Contains).on("pointerdown", go);
    btn.input!.cursor = "pointer";
    this.input.keyboard?.on("keydown-ENTER", go);
    // pin every child too, or the button's click area scrolls with the map while the card stays on screen
    // (Phaser 4's setScrollFactor(x, y, true) skips children whose scroll factor is still the default)
    // stars under the Chog: escaped, untouched, beat par
    const starLine = this.add.text(-190, 48, lore ? starText(stars) : "", { fontFamily: FONT_BODY, fontSize: "40px", color: "#e0a92a" }).setOrigin(0.5, 0);
    const parts = [shade, card, head, title, amount, stats, btn, cta, note, starLine];
    parts.forEach((o) => o.setScrollFactor(0));
    c.add(parts).setScrollFactor(0);
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 320, ease: "Back.Out" });
  }

  /** Molandak's tips: each shows once per raid, when it becomes useful. */
  private hints(s: RaidState) {
    if (s.result) return;
    const near = (room: number, x: number, r: number) => s.room === room && !s.climb && Math.abs(s.x - x) <= r;
    const plan = this.plan;
    const d = plan.lockedDoor;
    const links = (kind: string) => plan.links.some((l) => l.kind === kind && (near(l.a.room, l.a.x, 140) || (kind === "portal" && near(l.b.room, l.b.x, 140))));
    const guardHere = plan.guards.findIndex((g, i) => g.room === s.room && !s.guards[i]?.out);
    const hazard = (kind: string) => plan.hazards.some((h) => h.kind === kind && h.room === s.room && !s.climb && s.x > h.x0 - 160 && s.x < h.x1 + 160);
    const upstairs = plan.vault.room >= COLS;
    const rules: [string, boolean, string][] = [
      ["start", s.t > 20, `${upstairs ? "The vault is upstairs." : "The vault is on this floor."} Press Q to scout this room for traps.`],
      ["stairs", links("stairs") && s.lootBps === 0, "Press ↑ at the foot of the stairs to go up."],
      ["launch", links("launch"), "A launch pad! Stand on it and press ↑ to fly upstairs. It only goes one way."],
      ["portal", links("portal"), "A time portal. Press ↑ to step through, from either side."],
      [
        "guard",
        guardHere >= 0 && s.lootBps === 0,
        plan.guards[guardHere]?.flies
          ? "It flies, so you can't jump it! Wait till it turns away, then sneak in behind it."
          : "A guard! If it sees you, it chases you. Sneak up behind it, or jump over it with SPACE.",
      ],
      ["steam", hazard("steam"), "Steam vents! Watch the grates, and cross between bursts."],
      ["water", hazard("water"), "The river's in here. Wading is slow, so mind the clock."],
      ["door", !!d && !s.doorOpen && ((s.room === d.left && s.x > ROOM_W - 220) || (s.room === d.right && s.x < 220)), "Locked. Hold F to pick it, or bring Rage Horns."],
      ["vault", near(plan.vault.room, plan.vault.x, 160) && s.lootBps === 0, "There it is. Hold F to swipe the loot!"],
      ["home", s.lootBps > 0, "Now get out the front door before the clock runs out!"],
    ];
    for (const [key, when, text] of rules) {
      if (when && !this.hintsShown.has(key)) {
        this.hintsShown.add(key);
        this.say(text);
        break;
      }
    }
  }

  private say(text: string) {
    const W = this.scale.width;
    this.hint?.destroy();
    const c = this.add.container(W / 2 + 60, 548).setScrollFactor(0).setDepth(100);
    const bubble = this.add.graphics();
    bubble.fillStyle(0x1c1618, 1).fillRoundedRect(-286, -42, 580, 84, 18);
    bubble.fillStyle(0xfffaf0, 1).fillRoundedRect(-290, -46, 580, 84, 18);
    bubble.lineStyle(4, 0x1c1618, 1).strokeRoundedRect(-290, -46, 580, 84, 18);
    const parts: Phaser.GameObjects.GameObject[] = [bubble];
    if (castReady(this)) parts.push(this.add.image(-246, 30, "cast", "molandak").setOrigin(0.5, 1).setScale(0.36));
    parts.push(this.add.text(-196, -34, "MOLANDAK", { fontFamily: FONT_TITLE, fontSize: "16px", color: "#7e5ce0" }));
    parts.push(this.add.text(-196, -12, text, { fontFamily: FONT_BODY, fontSize: "21px", color: INK, wordWrap: { width: 470 } }));
    c.add(parts);
    c.setAlpha(0).setY(578);
    this.tweens.add({ targets: c, alpha: 1, y: 548, duration: 240, ease: "Back.Out" });
    this.tweens.add({ targets: c, alpha: 0, delay: 3600, duration: 400, onComplete: () => c.destroy() });
    this.hint = c;
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

  /** A slowly turning swirl at each end of a time portal. */
  private portals() {
    for (const l of this.plan.links) {
      if (l.kind !== "portal") continue;
      for (const end of [l.a, l.b]) {
        const g = this.add.graphics({ x: worldX(end.room, end.x), y: floorY(end.room) - 120 }).setDepth(1);
        for (let i = 0; i < 5; i++) {
          g.lineStyle(6, i % 2 ? 0x5b7cff : 0xc9b2ff, 0.9).beginPath();
          g.arc(0, 0, 90 - i * 16, i * 0.9, i * 0.9 + Math.PI * 1.3);
          g.strokePath();
        }
        g.setScale(1, 1.3);
        this.tweens.add({ targets: g, angle: -360, duration: 3000, repeat: -1 });
      }
    }
  }

  /** Steam vents: grates glow just before a burst, then white columns while it blasts. */
  private steam(s: RaidState) {
    const fx = this.hazardFx.clear();
    for (const h of this.plan.hazards) {
      if (h.kind !== "steam") continue;
      const x0 = worldX(h.room, h.x0), x1 = worldX(h.room, h.x1), y = floorY(h.room);
      const on = steamOn(h, s.t);
      const soon = !on && steamOn(h, s.t + 20);
      for (let x = x0 + 45; x < x1 - 20; x += 70) {
        if (soon) fx.fillStyle(0xff7a2a, 0.35 + 0.25 * Math.sin(s.t * 0.8)).fillRect(x - 25, y - 8, 50, 10);
        if (on) {
          for (let k = 0; k < 4; k++) {
            const wob = Math.sin(s.t * 0.5 + k + x) * 10;
            fx.fillStyle(0xffffff, 0.55 - k * 0.1).fillCircle(x + wob, y - 30 - k * 55, 26 + k * 8);
          }
        }
      }
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
      if (s.climb.kind === "launch") fy -= Math.sin(k * Math.PI) * 220; // flung up in an arc
      if (s.climb.kind === "portal") alpha = Math.abs(1 - 2 * k); // fades into the swirl, out of the other side
      if (s.climb.kind === "portal") x = worldX(k < 0.5 ? s.climb.from.room : s.climb.to.room, k < 0.5 ? s.climb.from.x : s.climb.to.x);
      if (s.climb.kind === "portal") fy = floorY(k < 0.5 ? s.climb.from.room : s.climb.to.room);
    }
    if (!this.exiting) {
      this.puppet.update(s, x, fy, this.game.loop.delta);
      this.puppet.root.setAlpha((s.result === "knocked-out" ? 0.6 : alpha) * this.enterFade.v);
    }

    // guard patrols
    this.plan.guards.forEach((post, i) => {
      const g = s.guards[i]!;
      const img = this.guards[i]!;
      const mark = this.guardMarks[i]!;
      const chasing = g.mode === "chase" && !g.out;
      img.setX(worldX(post.room, g.x)).setFlipX(g.dir < 0);
      if (this.monGuard) {
        // bob while patrolling, lean in and bounce when chasing, topple when knocked out
        const lean = chasing ? g.dir * 10 + Math.sin(s.t * 0.9) * 5 : Math.sin(s.t * 0.4 + i) * 3;
        img.setAngle(g.out ? 80 : lean).setAlpha(g.out ? 0.7 : 1);
        // fliers hover above the floor unless knocked out
        const hover = post.flies && !g.out ? -70 + Math.sin(s.t * 0.3) * 14 : chasing ? -Math.abs(Math.sin(s.t * 0.6)) * 14 : 0;
        img.setY(floorY(post.room) + 10 + hover);
      } else {
        img.setAngle(chasing ? g.dir * 8 : 0).setY(floorY(post.room) + 6 - (chasing ? Math.abs(Math.sin(s.t * 0.6)) * 12 : 0));
      }
      mark.setPosition(img.x, img.y - img.displayHeight - 6);
      if ((g.mode === "alert" || chasing) && !g.out && !s.result) mark.setText("!").setColor(ACCENT).setAlpha(1);
      else if (mark.text === "!") mark.setAlpha(0);
    });
    this.steam(s);
    this.hints(s);
    this.surprises.update(s);
    const moving = (s.prevMask & (Input.LEFT | Input.RIGHT)) !== 0 && !s.climb && s.stun === 0;
    if (moving && s.air === 0 && s.t % 9 === 0 && s.t !== this.lastStepT) {
      this.lastStepT = s.t;
      sfx.step();
    }
    if (s.air === 18 && this.lastJumpT !== s.t) {
      this.lastJumpT = s.t;
      sfx.jump();
    }

    s.traps.forEach((tr, i) => this.hunchSprites[i]!.setAlpha(tr.hunched && !tr.revealed && tr.armed ? 0.9 : 0));

    // progress ring: vault grab or door picking
    const ring = this.hud.ring.clear();
    const progress = (cx: number, cy: number, frac: number, color: number) => {
      ring.lineStyle(10, color, 1).beginPath();
      ring.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ring.strokePath();
    };
    if (s.grab > 0 && s.lootBps === 0) progress(x, fy - 290, s.grab / (this.setup.raider.head === "Lockpick" ? 15 : 45), 0xf0c35a);
    if (this.door && s.doorWork > 0 && !s.doorOpen) progress(this.door.x, this.door.y - 300, s.doorWork / (this.setup.raider.head === "Lockpick" ? 30 : 90), 0x7ec4a8);

    // HUD
    const secs = Math.max(0, Math.ceil(s.timeLeft / TICK_HZ));
    this.hud.timer.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
    this.hud.timer.setColor(s.timeLeft < (this.plan.seconds * TICK_HZ) / 4 ? ACCENT : PAPER);
    this.hud.hearts.setText("♥".repeat(Math.max(0, s.hp)) + "♡".repeat(Math.max(0, 3 - s.hp)));
    const carried = Math.floor((this.cap * s.lootBps) / 10_000);
    this.hud.loot.setText(`${carried.toLocaleString()} / ${this.cap.toLocaleString()} $CHOG`);
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
    const via = { vent: "In the vent…", stairs: "On the stairs…", launch: "Wheee…", portal: "Through the portal…" } as const;
    this.hud.room.setText(s.climb ? via[s.climb.kind] : this.loc.rooms[s.room]!.toUpperCase());

    // floor plan: visited rooms, where you are, the vault
    const m = this.hud.map.clear();
    const cw = 58, ch = 28, ox = W - 222, oy = H - 124;
    for (let r = 0; r < ROOMS; r++) {
      const cx = ox + colOf(r) * (cw + 8);
      const cy = oy + (FLOORS - 1 - floorOf(r)) * (ch + 8);
      const here = r === s.room && !s.climb;
      m.fillStyle(here ? 0xe0528a : this.visited.has(r) ? 0xf3eadb : 0x3b3336, 1).fillRoundedRect(cx, cy, cw, ch, 6);
      if (r === this.plan.vault.room) m.fillStyle(0xf0c35a, 1).fillCircle(vaultOnRight(this.plan) ? cx + cw - 10 : cx + 10, cy + 10, 6);
    }
    // locked door marker
    const ld = this.plan.lockedDoor;
    if (ld) {
      const dx = ox + colOf(ld.right) * (cw + 8) - 6;
      const dy = oy + (FLOORS - 1 - floorOf(ld.right)) * (ch + 8);
      m.fillStyle(s.doorOpen ? 0x7ec4a8 : 0xc0392b, 1).fillRect(dx, dy + 6, 4, ch - 12);
    }
  }
}
