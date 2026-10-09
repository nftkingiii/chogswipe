import { beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { Input, ROOMS, VAULT_X, createRaid, step, type InputLog, type RaidSetup, type RaidState } from "@chogswipe/sim";
import { buildApp } from "../src/app.js";
import type { Chain, VaultState } from "../src/chain.js";
import { HOUSE_BASE } from "../src/chogs.js";
import { refereeSigner, raidResultTypes } from "../src/sign.js";
import { MemoryStore } from "../src/store.js";

const VAULT = "0xe9e4408410a18211f9b1EC754974675DDD6DD30e" as Address;
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
    params: async () => ({ capBps: 1_000, minStake: 1_000n * E18 }),
    isSettled: async () => false,
  };
}

/** Walk to the vault, grab, walk home, jumping every armed trap. */
function recordRun(su: RaidSetup): InputLog {
  const s = createRaid(su);
  const log: [number, number][] = [];
  let prev = -1;
  const policy = (st: RaidState) => {
    const home = st.lootBps > 0;
    let mask: number = home ? Input.LEFT : Input.RIGHT;
    if (!home && st.room === ROOMS - 1 && st.x >= VAULT_X - 40) mask = Input.GRAB;
    const dir = home ? -1 : 1;
    const near = st.traps.some((t) => t.armed && t.room === st.room && (t.x - st.x) * dir > 0 && (t.x - st.x) * dir <= 40);
    if (near && st.air === 0 && st.stun === 0 && !(st.prevMask & Input.JUMP)) mask |= Input.JUMP;
    return mask;
  };
  while (!s.result) {
    const m = policy(s);
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

    const inputs = recordRun({ seed: start.seed, raider: start.raider, hideout: { defender: start.defender, traps: start.traps } });
    clock += 60_000; // real time passes
    const fin = await app.inject({ method: "POST", url: `/raids/${start.raidId}/finish`, headers: authed(token), payload: { inputs } });
    expect(fin.statusCode).toBe(200);
    const { outcome, result } = fin.json();
    expect(outcome.result).toBe("escaped");
    expect(BigInt(result.amount)).toBe((2_000n * E18 * BigInt(outcome.lootBps)) / 10_000n);

    const signer = await recoverTypedDataAddress({
      domain: { name: "Chogswipe", version: "1", chainId: 143, verifyingContract: VAULT },
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
    clock += 120_000;
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
