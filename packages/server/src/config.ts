import type { Address, Hex } from "viem";

export interface Config {
  port: number;
  rpcUrl: string;
  chainId: number;
  chog: Address;
  vault: Address;
  refereeKey: Hex;
  allowedOrigin: string;
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
    vault: (process.env.VAULT_ADDRESS ?? "0xe9e4408410a18211f9b1EC754974675DDD6DD30e") as Address,
    refereeKey: need("REFEREE_PRIVATE_KEY") as Hex,
    allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
  };
}
