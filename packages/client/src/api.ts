// Talking to the referee server.
import type { InputLog, Loadout, RaidOutcome, TrapPlacement, Traits } from "@chogswipe/sim";
import type { Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { monad } from "./chain.js";
import type { Wallet } from "./wallet.js";

// dev: Vite on :5173 talks to the referee on :8787; production: the referee serves the game itself
export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.DEV ? "http://localhost:8787" : "");
const TOKEN_KEY = "chogswipe.session";

let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
  return body as T;
}

export interface VaultView {
  balance: string;
  shieldUntil: number;
}

export interface MyChog {
  id: number;
  name: string;
  image: string | null;
  traits: Traits;
  loadout: Loadout;
  vault: VaultView | null;
  layout: TrapPlacement[] | null;
  /** the hideout's floor plan id */
  plan?: string;
}

export interface Target extends Omit<MyChog, "layout"> {
  house: boolean;
}

export interface RaidStart {
  raidId: Hex;
  seed: number;
  raider: Loadout;
  defender: Loadout;
  traps: TrapPlacement[];
  /** the target hideout's floor plan id; null for lore houses */
  plan?: string | null;
  capAmount: string;
  /** escrowed from your vault when the raid opens on-chain; back if you escape, the defender's if not */
  ticket?: string;
}

export interface SignedResult {
  raidId: Hex;
  raider: Hex;
  raiderToken: string;
  targetToken: string;
  amount: string;
  shieldSecs: number;
  deadline: number;
  signature: Hex;
}

export interface Replay {
  raidId: Hex;
  raiderToken: number;
  raider: { id: number; image: string; traits: Traits };
  startedAt: number;
  seed: number;
  traps: TrapPlacement[];
  plan?: string;
  inputs?: InputLog;
  outcome?: Omit<RaidOutcome, "events">;
  amount: string;
}

export function signedIn() {
  return !!token;
}

export function signOut() {
  token = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Sign-in with Ethereum: the wallet signs a one-time message, the referee issues a session. */
export async function signIn(w: Wallet): Promise<void> {
  const { nonce } = await call<{ nonce: string }>("/auth/nonce");
  const message = createSiweMessage({
    address: w.address,
    chainId: monad.id,
    domain: location.host,
    nonce,
    uri: location.origin,
    version: "1",
    statement: "Sign in to Chogswipe. This does not cost anything or move funds.",
  });
  const signature = await w.client.signMessage({ account: w.address, message });
  const res = await call<{ token: string }>("/auth/verify", { method: "POST", body: JSON.stringify({ message, signature }) });
  token = res.token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* session lasts for this page only */
  }
}

export const me = () => call<{ address: string; chogs: MyChog[] }>("/me");
export const targets = () => call<{ targets: Target[] }>("/targets");
export const saveHideout = (id: number, traps: TrapPlacement[], plan: string) =>
  call<{ ok: true; traps: TrapPlacement[]; plan: string }>(`/hideouts/${id}`, { method: "PUT", body: JSON.stringify({ traps, plan }) });
export const startRaid = (raiderToken: number, targetToken: number) =>
  call<RaidStart>("/raids", { method: "POST", body: JSON.stringify({ raiderToken, targetToken }) });
export const finishRaid = (raidId: Hex, inputs: InputLog) =>
  call<{ outcome: RaidOutcome; result: SignedResult | null }>(`/raids/${raidId}/finish`, { method: "POST", body: JSON.stringify({ inputs }) });
export const raidsAgainst = (id: number) => call<{ raids: Replay[] }>(`/hideouts/${id}/raids`);

// ------------------------------------------------- public demo: daily heist and feedback

export interface DailyEntry {
  rank: number;
  name: string;
  chogId: number;
  ticks: number;
  stars: number;
}

export interface DailyView {
  day: string;
  slug: string;
  seed: number;
  top: DailyEntry[];
}

export interface DailyTicket {
  ticket: string;
  day: string;
  slug: string;
  seed: number;
}

export const getDaily = () => call<DailyView>("/daily");

export const startDaily = () => call<DailyTicket>("/daily/start", { method: "POST", body: "{}" });

export const finishDaily = (body: { ticket: string; name: string; chogId: number; inputs: InputLog }) =>
  call<DailyView & { result: string; ticks: number; stars: number; rank: number | null }>("/daily/finish", { method: "POST", body: JSON.stringify(body) });

export const sendFeedback = (body: { text: string; contact?: string; where?: string }) =>
  call<{ ok: true }>("/feedback", { method: "POST", body: JSON.stringify(body) });
