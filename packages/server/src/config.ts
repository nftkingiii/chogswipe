import type { Address, Hex } from "viem";

export interface Config {
  port: number;
  rpcUrl: string;
  chainId: number;
  chog: Address;
  vault: Address;
  refereeKey: Hex;
  allowedOrigin: string;
  /** holder mode (wallet sign-in, hideouts, raids) is on since full launch; HOLDER_MODE=0 switches it back off */
  holderMode: boolean;
  feedbackKey?: string;
  /** wallets that may open the analytics dashboard */
  adminAddresses: string[];
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 8787),
    rpcUrl: process.env.RPC_URL ?? "https://rpc.monad.xyz",
    chainId: Number(process.env.CHAIN_ID ?? 143),
    chog: (process.env.CHOG_ADDRESS ?? "0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763") as Address,
    vault: (process.env.VAULT_ADDRESS ?? "0xD8c3e8AB14F6153e1cFb5212541032aFfAFF9fC5") as Address,
    refereeKey: need("REFEREE_PRIVATE_KEY") as Hex,
    allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
    holderMode: (process.env.HOLDER_MODE ?? "1") === "1",
    feedbackKey: process.env.FEEDBACK_KEY || undefined,
    adminAddresses: (process.env.ADMIN_ADDRESSES ?? "0xd38e50591F6c2a23CE1B34C8149CfC345Bea3190").split(",").map((a) => a.trim()).filter(Boolean),
  };
}
