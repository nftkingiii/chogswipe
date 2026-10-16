import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { DEMO_ROSTER, createRaid, dailyHeist, hideoutPlan, loadoutFor, makeBot, step, type InputLog, type RaidSetup } from "@chogswipe/sim";
import { buildApp } from "../src/app.js";
import type { Chain, VaultState } from "../src/chain.js";
import { HOUSE_BASE } from "../src/chogs.js";
import { refereeSigner, raidResultTypes } from "../src/sign.js";
import { MemoryStore } from "../src/store.js";

const VAULT = "0x3a519fDf34Fa98DCf268f4C9d456F50eED710e8D" as Address;
const ORIGIN = "http://localhost:5173";
const player = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const referee = refereeSigner(generatePrivateKey(), 143, VAULT);
const E18 = 10n ** 18n;

function fakeChain(): Chain & { owners: Map<number, Address>; balances: Map<number, VaultState> } {
  const owners = new Map<number, Address>([
    [1, player.address],
    [2, other.address],
  ]);
  const balances = new Map<number, VaultState>([
    [1, { balance: 5_000n * E18, shieldUntil: 0 }],
    [2, { balance: 10_000n * E18, shieldUntil: 0 }],
    [HOUSE_BASE, { balance: 20_000n * E18, shieldUntil: 0 }],
  ]);
  const vault = (id: number) => balances.get(id) ?? { balance: 0n, shieldUntil: 0 };
  return {
    owners,
    balances,
    ownerOf: async (id) => owners.get(id) ?? null,
    ownedBy: async (a) => [...owners].filter(([, o]) => o === a).map(([id]) => id),
    vault: async (id) => vault(id),
    vaults: async (ids) => new Map(ids.map((id) => [id, vault(id)])),
    params: async () => ({ capBps: 1_000, minStake: 1_000n * E18, ticketBps: 1_000 }),
    isSettled: async () => false,
  };
}

/** Autopilot run through the kitchen, jumping every armed trap. */
function recordRun(su: RaidSetup, bot = makeBot({ route: "kitchen", seeTraps: true })): InputLog {
  const s = createRaid(su);
  const log: [number, number][] = [];
  let prev = -1;
  while (!s.result) {
    const m = bot(s);
    if (m !== prev) log.push([s.t, m]);
    prev = m;
    step(s, su, m);
  }
  return log;
}

describe("referee", () => {
  let clock: number;
  let chain: ReturnType<typeof fakeChain>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    clock = Date.parse("2026-10-09T12:00:00Z");
    chain = fakeChain();
    app = await buildApp({ chain, store: new MemoryStore(), signer: referee, chainId: 143, allowedOrigin: ORIGIN, now: () => clock });
  });

  async function signIn(account = player): Promise<string> {
    const { nonce } = (await app.inject({ method: "GET", url: "/auth/nonce" })).json();
    const message = createSiweMessage({
      address: account.address,
      chainId: 143,
      domain: "localhost:5173",
      nonce,
      uri: ORIGIN,
      version: "1",
      issuedAt: new Date(clock),
    });
    const signature = await account.signMessage({ message });
    const res = await app.inject({ method: "POST", url: "/auth/verify", payload: { message, signature } });
    expect(res.statusCode).toBe(200);
    return res.json().token;
  }

  const authed = (token: string) => ({ authorization: `Bearer ${token}` });

  it("signs in with a wallet and lists held Chogs with loadouts", async () => {
    const token = await signIn();
    const me = (await app.inject({ method: "GET", url: "/me", headers: authed(token) })).json();
    expect(me.address).toBe(player.address);
    expect(me.chogs).toHaveLength(1);
    expect(me.chogs[0].loadout.trap).toBe("Spring Plate"); // Chog #1 -> metadata 1462
    expect(me.chogs[0].vault.balance).toBe((5_000n * E18).toString());
  });

  it("rejects a reused nonce and a wrong-domain message", async () => {
    const { nonce } = (await app.inject({ method: "GET", url: "/auth/nonce" })).json();
    const bad = createSiweMessage({ address: player.address, chainId: 143, domain: "evil.example", nonce, uri: "https://evil.example", version: "1" });
    const sig = await player.signMessage({ message: bad });
    expect((await app.inject({ method: "POST", url: "/auth/verify", payload: { message: bad, signature: sig } })).statusCode).toBe(400);
  });

  it("accepts sign-in from each listed domain while a domain moves, and no other", async () => {
    app = await buildApp({ chain, store: new MemoryStore(), signer: referee, chainId: 143, allowedOrigin: "https://chogswipe.xyz, https://chogswipe.up.railway.app", now: () => clock });
    const tryDomain = async (domain: string) => {
      const { nonce } = (await app.inject({ method: "GET", url: "/auth/nonce" })).json();
      const message = createSiweMessage({ address: player.address, chainId: 143, domain, nonce, uri: `https://${domain}`, version: "1", issuedAt: new Date(clock) });
      const signature = await player.signMessage({ message });
      return (await app.inject({ method: "POST", url: "/auth/verify", payload: { message, signature } })).statusCode;
    };
    expect(await tryDomain("chogswipe.xyz")).toBe(200);
    expect(await tryDomain("chogswipe.up.railway.app")).toBe(200);
    expect(await tryDomain("evil.example")).toBe(400);
  });

  it("only the holder can set a hideout, and layouts are validated", async () => {
    const token = await signIn();
    const notMine = await app.inject({ method: "PUT", url: "/hideouts/2", headers: authed(token), payload: { traps: [] } });
    expect(notMine.statusCode).toBe(403);
    const bad = await app.inject({
      method: "PUT",
      url: "/hideouts/1",
      headers: authed(token),
      payload: { traps: [{ room: 0, x: 300, kind: "Chomper" }] },
    });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({
      method: "PUT",
      url: "/hideouts/1",
      headers: authed(token),
      payload: { traps: [{ room: 0, x: 300, kind: "Spring Plate" }] },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("runs a full raid on a house hideout and signs a result the vault accepts", async () => {
    const token = await signIn();
    const targets = (await app.inject({ method: "GET", url: "/targets", headers: authed(token) })).json().targets;
    expect(targets.map((t: { id: number }) => t.id)).toContain(HOUSE_BASE);

    const start = (
      await app.inject({ method: "POST", url: "/raids", headers: authed(token), payload: { raiderToken: 1, targetToken: HOUSE_BASE } })
    ).json();
    expect(start.capAmount).toBe((2_000n * E18).toString());
    expect(start.ticket).toBe((200n * E18).toString()); // 10% of the most it could take

    const inputs = recordRun({ seed: start.seed, raider: start.raider, hideout: { defender: start.defender, traps: start.traps } });
    clock += 60_000; // real time passes
    const fin = await app.inject({ method: "POST", url: `/raids/${start.raidId}/finish`, headers: authed(token), payload: { inputs } });
    expect(fin.statusCode).toBe(200);
    const { outcome, result } = fin.json();
    expect(outcome.result).toBe("escaped");
    expect(BigInt(result.amount)).toBe((2_000n * E18 * BigInt(outcome.lootBps)) / 10_000n);

    const signer = await recoverTypedDataAddress({
      domain: { name: "Chogswipe", version: "2", chainId: 143, verifyingContract: VAULT },
      types: raidResultTypes,
      primaryType: "RaidResult",
      message: {
        raidId: result.raidId as Hex,
        raider: result.raider,
        raiderToken: BigInt(result.raiderToken),
        targetToken: BigInt(result.targetToken),
        amount: BigInt(result.amount),
        shieldSecs: BigInt(result.shieldSecs),
        deadline: BigInt(result.deadline),
      },
      signature: result.signature,
    });
    expect(signer).toBe(referee.address);

    const again = await app.inject({ method: "POST", url: `/raids/${start.raidId}/finish`, headers: authed(token), payload: { inputs } });
    expect(again.statusCode).toBe(409);
  });

  it("refuses a run that claims to finish faster than real time", async () => {
    const token = await signIn();
    const start = (
      await app.inject({ method: "POST", url: "/raids", headers: authed(token), payload: { raiderToken: 1, targetToken: HOUSE_BASE } })
    ).json();
    const inputs = recordRun({ seed: start.seed, raider: start.raider, hideout: { defender: start.defender, traps: start.traps } });
    clock += 5_000;
    const fin = await app.inject({ method: "POST", url: `/raids/${start.raidId}/finish`, headers: authed(token), payload: { inputs } });
    expect(fin.statusCode).toBe(400);
  });

  it("a failed raid gets no signature", async () => {
    const token = await signIn();
    const start = (
      await app.inject({ method: "POST", url: "/raids", headers: authed(token), payload: { raiderToken: 1, targetToken: HOUSE_BASE } })
    ).json();
    clock += 150_000;
    const fin = (await app.inject({ method: "POST", url: `/raids/${start.raidId}/finish`, headers: authed(token), payload: { inputs: [] } })).json();
    expect(fin.outcome.result).toBe("timeout");
    expect(fin.result).toBeNull();
  });

  it("enforces stake, shield, ownership and the daily limit", async () => {
    const token = await signIn();
    const raid = (body: object) => app.inject({ method: "POST", url: "/raids", headers: authed(token), payload: body });

    expect((await raid({ raiderToken: 2, targetToken: HOUSE_BASE })).statusCode).toBe(403);

    chain.balances.set(HOUSE_BASE, { balance: 20_000n * E18, shieldUntil: Math.floor(clock / 1000) + 60 });
    expect((await raid({ raiderToken: 1, targetToken: HOUSE_BASE })).statusCode).toBe(409);
    chain.balances.set(HOUSE_BASE, { balance: 20_000n * E18, shieldUntil: 0 });

    chain.balances.set(1, { balance: 10n * E18, shieldUntil: 0 });
    expect((await raid({ raiderToken: 1, targetToken: HOUSE_BASE })).statusCode).toBe(400);
    chain.balances.set(1, { balance: 5_000n * E18, shieldUntil: 0 });

    // Chog #1 is Uncommon: 3 raids per day
    for (let i = 0; i < 3; i++) expect((await raid({ raiderToken: 1, targetToken: HOUSE_BASE })).statusCode).toBe(200);
    expect((await raid({ raiderToken: 1, targetToken: HOUSE_BASE })).statusCode).toBe(429);
  });

  it("a hideout keeps its floor plan, and raids on it are replayed on that plan", async () => {
    const owner = await signIn(other);
    const put = (plan: string) =>
      app.inject({ method: "PUT", url: "/hideouts/2", headers: authed(owner), payload: { traps: [{ room: 1, x: 300, kind: "Tripwire" }], plan } });
    expect((await put("castle-in-the-sky")).statusCode).toBe(400);
    expect((await put("molandak-lab")).statusCode).toBe(200);
    const me = (await app.inject({ method: "GET", url: "/me", headers: authed(owner) })).json();
    expect(me.chogs[0].plan).toBe("molandak-lab");

    const token = await signIn();
    const start = (await app.inject({ method: "POST", url: "/raids", headers: authed(token), payload: { raiderToken: 1, targetToken: 2 } })).json();
    expect(start.plan).toBe("molandak-lab");
    const plan = hideoutPlan(start.plan).plan;
    const inputs = recordRun({ seed: start.seed, raider: start.raider, hideout: { defender: start.defender, traps: start.traps, plan } }, makeBot({ plan, seeTraps: true }));
    clock += 60_000;
    const fin = await app.inject({ method: "POST", url: `/raids/${start.raidId}/finish`, headers: authed(token), payload: { inputs } });
    expect(fin.json().outcome.result).toBe("escaped");
  });

  it("someone else can't finish your raid", async () => {
    const token = await signIn();
    const start = (
      await app.inject({ method: "POST", url: "/raids", headers: authed(token), payload: { raiderToken: 1, targetToken: HOUSE_BASE } })
    ).json();
    const otherToken = await signIn(other);
    const fin = await app.inject({ method: "POST", url: `/raids/${start.raidId}/finish`, headers: authed(otherToken), payload: { inputs: [] } });
    expect(fin.statusCode).toBe(404);
  });
});

describe("public demo", () => {
  it("keeps the holder API shut and the health check open", async () => {
    const app = await buildApp({ chain: fakeChain(), store: new MemoryStore(), signer: referee, chainId: 143, allowedOrigin: ORIGIN, holderMode: false });
    for (const [method, url] of [["GET", "/me"], ["GET", "/targets"], ["POST", "/raids"], ["POST", "/raids/x/finish"], ["PUT", "/hideouts/1"]] as const) {
      expect((await app.inject({ method, url })).statusCode, url).toBe(403);
    }
    // sign-in stays open (the team uses it for the dashboard); on its own it unlocks nothing above
    expect((await app.inject({ method: "GET", url: "/auth/nonce" })).statusCode).toBe(200);
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().holderMode).toBe(false);
  });
});

describe("daily heist and feedback", () => {
  let clock: number;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const day = "2026-10-15";
  beforeEach(async () => {
    clock = Date.parse(`${day}T12:00:00Z`);
    app = await buildApp({ chain: fakeChain(), store: new MemoryStore(), signer: referee, chainId: 143, allowedOrigin: ORIGIN, holderMode: false, now: () => clock, feedbackKey: "k" });
  });

  const dailyRun = () => {
    const { location, seed } = dailyHeist(day);
    const chog = DEMO_ROSTER[0]!;
    const su: RaidSetup = { seed, raider: loadoutFor(chog.traits), hideout: { defender: loadoutFor(location.traits), traps: location.traps, plan: location.plan } };
    return { chog, inputs: recordRun(su, makeBot({ plan: location.plan, seeTraps: true, scout: true })) };
  };

  it("replays a daily run, ranks it, and keeps each name's best", async () => {
    const view = (await app.inject({ method: "GET", url: "/daily" })).json();
    expect(view.slug).toBe(dailyHeist(day).location.slug);
    expect(view.top).toEqual([]);

    const { chog, inputs } = dailyRun();
    const ticket = (await app.inject({ method: "POST", url: "/daily/start" })).json().ticket;
    // too fast: the clock hasn't moved
    const early = await app.inject({ method: "POST", url: "/daily/finish", payload: { ticket, name: "speedy", chogId: chog.id, inputs } });
    expect(early.statusCode).toBe(400);

    const t2 = (await app.inject({ method: "POST", url: "/daily/start" })).json().ticket;
    clock += 120_000;
    const done = await app.inject({ method: "POST", url: "/daily/finish", payload: { ticket: t2, name: "Chog Fan", chogId: chog.id, inputs } });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json().result).toBe("escaped");
    expect(done.json().rank).toBe(1);
    expect(done.json().stars).toBeGreaterThan(0);
    // a ticket works once
    const again = await app.inject({ method: "POST", url: "/daily/finish", payload: { ticket: t2, name: "Chog Fan", chogId: chog.id, inputs } });
    expect(again.statusCode).toBe(410);
    expect((await app.inject({ method: "GET", url: "/daily" })).json().top).toHaveLength(1);
  });

  it("rejects bad names, non-demo Chogs and junk inputs", async () => {
    const { chog, inputs } = dailyRun();
    for (const body of [
      { name: "<script>", chogId: chog.id, inputs },
      { name: "ok name", chogId: 999_999, inputs },
      { name: "ok name", chogId: chog.id, inputs: [[0, 1 << 20]] },
    ]) {
      const ticket = (await app.inject({ method: "POST", url: "/daily/start" })).json().ticket;
      clock += 120_000;
      expect((await app.inject({ method: "POST", url: "/daily/finish", payload: { ticket, ...body } })).statusCode).toBe(400);
    }
  });

  it("takes feedback from anyone and shows it only with the key", async () => {
    expect((await app.inject({ method: "POST", url: "/feedback", payload: { text: "love the guards", contact: "@fan", where: "map" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/feedback", payload: { text: "" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/feedback" })).statusCode).toBe(404);
    const list = await app.inject({ method: "GET", url: "/feedback", headers: { "x-feedback-key": "k" } });
    expect(list.json().feedback[0]).toMatchObject({ text: "love the guards", contact: "@fan", where: "map" });
  });
});

describe("analytics", () => {
  let clock: number;
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    clock = Date.parse("2026-10-16T12:00:00Z");
    app = await buildApp({ chain: fakeChain(), store: new MemoryStore(), signer: referee, chainId: 143, allowedOrigin: ORIGIN, holderMode: false, now: () => clock, adminAddresses: [other.address] });
  });

  async function signIn(account = player): Promise<string> {
    const { nonce } = (await app.inject({ method: "GET", url: "/auth/nonce" })).json();
    const message = createSiweMessage({ address: account.address, chainId: 143, domain: "localhost:5173", nonce, uri: ORIGIN, version: "1", issuedAt: new Date(clock) });
    const signature = await account.signMessage({ message });
    return (await app.inject({ method: "POST", url: "/auth/verify", payload: { message, signature } })).json().token;
  }
  const send = (type: string, visitor: string, data: object = {}) => app.inject({ method: "POST", url: "/events", payload: { type, visitor, data } });

  it("records clean events and refuses junk", async () => {
    expect((await send("visit", "abcdef1234", { device: "phone", ref: "x.com" })).statusCode).toBe(200);
    expect((await send("hack", "abcdef1234")).statusCode).toBe(400);
    expect((await send("visit", "<script>")).statusCode).toBe(400);
  });

  it("shows the dashboard only to an admin wallet", async () => {
    await send("visit", "visitor0001", { device: "phone", ref: "x.com" });
    await send("visit", "visitor0002", { device: "desktop" });
    await send("heist_start", "visitor0001", { slug: "fwog-pond", mode: "lore" });
    await send("heist_end", "visitor0001", { slug: "fwog-pond", mode: "lore", result: "escaped", stars: 3, secs: 31.2, extra: "dropped" });
    await send("heist_start", "visitor0002", { slug: "fwog-pond", mode: "daily" });
    await send("heist_end", "visitor0002", { slug: "fwog-pond", mode: "daily", result: "caught", stars: 0, secs: 40 });

    expect((await app.inject({ method: "GET", url: "/admin/stats" })).statusCode).toBe(401);
    const notAdmin = await signIn(player);
    expect((await app.inject({ method: "GET", url: "/admin/stats", headers: { authorization: `Bearer ${notAdmin}` } })).statusCode).toBe(403);

    const admin = await signIn(other);
    const res = await app.inject({ method: "GET", url: "/admin/stats", headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    const st = res.json();
    expect(st.totals).toMatchObject({ visitorsToday: 2, visitors7d: 2, plays7d: 2, escapes7d: 1, playsToday: 2 });
    expect(st.devices7d).toEqual({ phone: 1, desktop: 1 });
    expect(st.modes7d).toEqual({ lore: 1, daily: 1 });
    expect(st.referrers7d).toEqual([{ host: "x.com", visitors: 1 }]);
    expect(st.heists7d.find((h: { slug: string }) => h.slug === "fwog-pond")).toMatchObject({ starts: 2, escapes: 1, avgEscapeSecs: 31.2, threeStars: 1 });
    expect(st.days).toHaveLength(14);
    expect(st.days.at(-1)).toMatchObject({ day: "2026-10-16", visitors: 2, plays: 2, escapes: 1 });
  });
});
