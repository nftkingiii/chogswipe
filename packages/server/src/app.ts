import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { randomBytes } from "node:crypto";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import {
  INPUT_MASK_MAX,
  RAID_TICKS,
  TICK_HZ,
  simulateRaid,
  validateHideout,
  type InputLog,
  type TrapPlacement,
} from "@chogswipe/sim";
import type { Chain } from "./chain.js";
import { chogInfo, houseIds, houseLayout, isHouse } from "./chogs.js";
import type { Signer } from "./sign.js";
import type { RaidRecord, Store } from "./store.js";

export interface AppDeps {
  chain: Chain;
  store: Store;
  signer: Signer;
  chainId: number;
  allowedOrigin: string;
  now?: () => number;
}

const SESSION_MS = 24 * 3600_000;
const NONCE_MS = 10 * 60_000;
const SETTLE_WINDOW_S = 15 * 60;
const RAID_SLACK_MS = 60_000;
const HOUSE_SHIELD_S = 15 * 60;
const MAX_INPUTS = 20_000;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function buildApp(deps: AppDeps) {
  const { chain, store, signer } = deps;
  const now = deps.now ?? Date.now;
  const app = Fastify({ logger: false, bodyLimit: 512 * 1024 });
  await app.register(cors, { origin: deps.allowedOrigin });

  app.setErrorHandler((err, _req, reply) => {
    const status = err instanceof HttpError ? err.status : (err as { statusCode?: number }).statusCode ?? 500;
    reply.status(status).send({ error: status === 500 ? "internal error" : (err as Error).message });
    if (status === 500) console.error(err);
  });

  async function auth(req: FastifyRequest): Promise<Address> {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const address = token ? await store.getSession(token) : null;
    if (!address) throw new HttpError(401, "sign in first");
    return address;
  }

  async function requireOwner(address: Address, tokenId: number) {
    if (isHouse(tokenId)) throw new HttpError(403, "house hideouts are run by the game");
    const owner = await chain.ownerOf(tokenId);
    if (!owner || owner.toLowerCase() !== address.toLowerCase()) throw new HttpError(403, "you don't hold this Chog");
  }

  const tokenParam = (v: unknown) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "bad token id");
    return n;
  };

  // ------------------------------------------------------------- health

  app.get("/health", async () => ({ ok: true, referee: signer.address, chainId: deps.chainId }));

  // --------------------------------------------------------------- auth

  app.get("/auth/nonce", async () => {
    const nonce = randomBytes(16).toString("hex");
    await store.putNonce(nonce, now() + NONCE_MS);
    return { nonce };
  });

  app.post<{ Body: { message: string; signature: Hex } }>("/auth/verify", async (req) => {
    const { message, signature } = req.body ?? ({} as never);
    if (typeof message !== "string" || typeof signature !== "string") throw new HttpError(400, "message and signature required");
    const parsed = parseSiweMessage(message);
    const domain = new URL(deps.allowedOrigin).host;
    if (
      !parsed.address ||
      !parsed.nonce ||
      parsed.chainId !== deps.chainId ||
      !validateSiweMessage({ message: parsed, domain, time: new Date(now()) })
    ) {
      throw new HttpError(400, "invalid sign-in message");
    }
    if (!(await store.takeNonce(parsed.nonce))) throw new HttpError(400, "nonce expired or used");
    if (!(await verifyMessage({ address: parsed.address, message, signature }))) throw new HttpError(401, "bad signature");
    const token = randomBytes(32).toString("hex");
    await store.putSession(token, getAddress(parsed.address), now() + SESSION_MS);
    return { token, address: getAddress(parsed.address) };
  });

  // -------------------------------------------------------------- chogs

  app.get("/me", async (req) => {
    const address = await auth(req);
    const ids = await chain.ownedBy(address);
    const vaults = ids.length ? await chain.vaults(ids) : new Map();
    const chogs = await Promise.all(
      ids.map(async (id) => ({
        ...chogInfo(id),
        vault: serializeVault(vaults.get(id)),
        layout: await store.getLayout(id),
      })),
    );
    return { address, chogs };
  });

  app.get<{ Params: { id: string } }>("/chogs/:id", async (req) => {
    const info = chogInfo(tokenParam(req.params.id));
    if (!info) throw new HttpError(404, "unknown Chog");
    return info;
  });

  // ------------------------------------------------------------ hideout

  app.put<{ Params: { id: string }; Body: { traps: TrapPlacement[] } }>("/hideouts/:id", async (req) => {
    const address = await auth(req);
    const id = tokenParam(req.params.id);
    await requireOwner(address, id);
    const info = chogInfo(id);
    if (!info) throw new HttpError(404, "unknown Chog");
    const traps = req.body?.traps;
    if (!Array.isArray(traps)) throw new HttpError(400, "traps required");
    const clean = traps.map((t) => ({ room: Number(t.room), x: Number(t.x), kind: t.kind }));
    const errors = validateHideout({ defender: info.loadout, traps: clean });
    if (errors.length) throw new HttpError(400, errors.join("; "));
    await store.putLayout(id, clean);
    return { ok: true, traps: clean };
  });

  // ------------------------------------------------------------ targets

  app.get("/targets", async (req) => {
    const address = await auth(req);
    const mine = new Set(await chain.ownedBy(address));
    const ids = [...houseIds(), ...(await store.allLayouts())].filter((id) => !mine.has(id));
    const vaults = ids.length ? await chain.vaults(ids) : new Map();
    const t = Math.floor(now() / 1000);
    return {
      targets: ids
        .map((id) => ({ ...chogInfo(id), vault: serializeVault(vaults.get(id)) }))
        .filter((x) => x.vault && BigInt(x.vault.balance) > 0n && x.vault.shieldUntil <= t),
    };
  });

  // -------------------------------------------------------------- raids

  app.post<{ Body: { raiderToken: number; targetToken: number } }>("/raids", async (req) => {
    const address = await auth(req);
    const raiderToken = tokenParam(req.body?.raiderToken);
    const targetToken = tokenParam(req.body?.targetToken);
    if (raiderToken === targetToken) throw new HttpError(400, "can't raid yourself");
    await requireOwner(address, raiderToken);
    const raider = chogInfo(raiderToken);
    const target = chogInfo(targetToken);
    if (!raider || !target) throw new HttpError(404, "unknown Chog");

    const traps = isHouse(targetToken) ? houseLayout(targetToken) : await store.getLayout(targetToken);
    if (!traps) throw new HttpError(404, "that hideout has no traps set yet");

    const day = utcDay(now());
    if ((await store.raidsStarted(raiderToken, day)) >= raider.loadout.stats.raidsPerDay) {
      throw new HttpError(429, `daily raid limit reached (${raider.loadout.stats.raidsPerDay})`);
    }

    const [params, vaults] = await Promise.all([chain.params(), chain.vaults([raiderToken, targetToken])]);
    const mineV = vaults.get(raiderToken)!;
    const targetV = vaults.get(targetToken)!;
    if (mineV.balance < params.minStake) throw new HttpError(400, "stake more $CHOG in your own vault to raid");
    if (targetV.shieldUntil > now() / 1000) throw new HttpError(409, "that hideout is shielded");
    const capAmount = (targetV.balance * BigInt(params.capBps)) / 10_000n;
    if (capAmount === 0n) throw new HttpError(409, "that vault is empty");

    const raid: RaidRecord = {
      id: `0x${randomBytes(32).toString("hex")}` as Hex,
      raider: address,
      raiderToken,
      targetToken,
      seed: randomBytes(4).readUInt32BE(0),
      traps,
      capAmount: capAmount.toString(),
      startedAt: now(),
      day,
    };
    await store.putRaid(raid);
    return {
      raidId: raid.id,
      seed: raid.seed,
      raider: raider.loadout,
      defender: target.loadout,
      traps,
      capAmount: raid.capAmount,
    };
  });

  app.post<{ Params: { id: string }; Body: { inputs: InputLog } }>("/raids/:id/finish", async (req) => {
    const address = await auth(req);
    const raid = await store.getRaid(req.params.id as Hex);
    if (!raid || raid.raider.toLowerCase() !== address.toLowerCase()) throw new HttpError(404, "raid not found");
    if (raid.finishedAt) throw new HttpError(409, "raid already finished");

    const inputs = req.body?.inputs;
    if (
      !Array.isArray(inputs) ||
      inputs.length > MAX_INPUTS ||
      !inputs.every((e) => Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && Number.isInteger(e[1]) && e[1] >= 0 && e[1] <= INPUT_MASK_MAX)
    ) {
      throw new HttpError(400, "bad input log");
    }

    const elapsed = now() - raid.startedAt;
    if (elapsed > (RAID_TICKS / TICK_HZ) * 1000 + RAID_SLACK_MS) throw new HttpError(410, "raid expired");

    const raider = chogInfo(raid.raiderToken)!;
    const target = chogInfo(raid.targetToken)!;
    let outcome;
    try {
      outcome = simulateRaid(
        { seed: raid.seed, raider: raider.loadout, hideout: { defender: target.loadout, traps: raid.traps } },
        inputs,
      );
    } catch {
      throw new HttpError(400, "bad input log");
    }
    // A run can't finish faster than real time.
    if (elapsed + 2_000 < (outcome.ticks / TICK_HZ) * 1000) throw new HttpError(400, "raid finished faster than possible");

    raid.finishedAt = now();
    raid.inputs = inputs;
    const { events: _events, ...summary } = outcome;
    raid.outcome = summary;

    let amount = (BigInt(raid.capAmount) * BigInt(outcome.lootBps)) / 10_000n;
    let result = null;
    if (amount > 0n) {
      // Re-check the cap against the vault as it is now.
      const [params, targetV] = await Promise.all([chain.params(), chain.vault(raid.targetToken)]);
      const capNow = (targetV.balance * BigInt(params.capBps)) / 10_000n;
      if (amount > capNow) amount = capNow;
    }
    if (amount > 0n) {
      const shieldSecs = isHouse(raid.targetToken)
        ? HOUSE_SHIELD_S
        : (target.loadout.stats.shieldHours + (target.loadout.aura === "Ward" ? 1 : 0)) * 3600;
      const deadline = Math.floor(now() / 1000) + SETTLE_WINDOW_S;
      const msg = {
        raidId: raid.id,
        raider: getAddress(raid.raider),
        raiderToken: BigInt(raid.raiderToken),
        targetToken: BigInt(raid.targetToken),
        amount,
        shieldSecs: BigInt(shieldSecs),
        deadline: BigInt(deadline),
      };
      raid.signature = await signer.signResult(msg);
      raid.amount = amount.toString();
      raid.shieldSecs = shieldSecs;
      raid.deadline = deadline;
      result = {
        raidId: msg.raidId,
        raider: msg.raider,
        raiderToken: msg.raiderToken.toString(),
        targetToken: msg.targetToken.toString(),
        amount: msg.amount.toString(),
        shieldSecs,
        deadline,
        signature: raid.signature,
      };
    }
    await store.putRaid(raid);
    return { outcome, result };
  });

  // ------------------------------------------------------------ replays

  app.get<{ Params: { id: string } }>("/hideouts/:id/raids", async (req) => {
    const address = await auth(req);
    const id = tokenParam(req.params.id);
    await requireOwner(address, id);
    const raids = await store.raidsAgainst(id, 20);
    return {
      raids: raids.map((r) => ({
        raidId: r.id,
        raiderToken: r.raiderToken,
        raider: (({ id, image, traits }) => ({ id, image: image ?? "", traits }))(chogInfo(r.raiderToken)!),
        startedAt: r.startedAt,
        seed: r.seed,
        traps: r.traps,
        inputs: r.inputs,
        outcome: r.outcome,
        amount: r.amount ?? "0",
      })),
    };
  });

  return app;
}

function serializeVault(v: { balance: bigint; shieldUntil: number } | undefined) {
  return v ? { balance: v.balance.toString(), shieldUntil: v.shieldUntil } : null;
}
