import { createPublicClient, defineChain, http, parseAbi, type Address, type Hex } from "viem";
import { MAX_CHOG_ID } from "./chogs.js";

const chogAbi = parseAbi(["function ownerOf(uint256) view returns (address)"]);
const vaultAbi = parseAbi([
  "function balanceOf(uint256) view returns (uint256)",
  "function shieldUntil(uint256) view returns (uint64)",
  "function capBps() view returns (uint16)",
  "function minStake() view returns (uint256)",
  "function ticketBps() view returns (uint16)",
  "function settled(bytes32) view returns (bool)",
  "function hashResult((bytes32 raidId,address raider,uint256 raiderToken,uint256 targetToken,uint256 amount,uint64 shieldSecs,uint64 deadline)) view returns (bytes32)",
]);

export interface VaultState {
  balance: bigint;
  shieldUntil: number;
}

export interface VaultParams {
  capBps: number;
  minStake: bigint;
  /** a raid's ticket, as a share of the most it could take (escrowed by openRaid, back on escape) */
  ticketBps: number;
}

/** Everything the referee reads from Monad. Faked in tests. */
export interface Chain {
  ownerOf(tokenId: number): Promise<Address | null>;
  ownedBy(owner: Address): Promise<number[]>;
  vault(id: number): Promise<VaultState>;
  vaults(ids: number[]): Promise<Map<number, VaultState>>;
  params(): Promise<VaultParams>;
  isSettled(raidId: Hex): Promise<boolean>;
}

export const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export function viemChain(rpcUrl: string, chog: Address, vault: Address): Chain {
  const client = createPublicClient({ chain: monad, transport: http(rpcUrl, { batch: false, retryCount: 4 }) });
  let ownersCache: { at: number; owners: (Address | null)[] } | null = null;

  async function owners(): Promise<(Address | null)[]> {
    if (ownersCache && Date.now() - ownersCache.at < 60_000) return ownersCache.owners;
    const ids = Array.from({ length: MAX_CHOG_ID }, (_, i) => i + 1);
    const res = await client.multicall({
      contracts: ids.map((id) => ({ address: chog, abi: chogAbi, functionName: "ownerOf", args: [BigInt(id)] }) as const),
      batchSize: 4_096,
    });
    const list = [null, ...res.map((r) => (r.status === "success" ? (r.result as Address) : null))];
    ownersCache = { at: Date.now(), owners: list };
    return list;
  }

  async function vaults(ids: number[]): Promise<Map<number, VaultState>> {
    const res = await client.multicall({
      contracts: ids.flatMap((id) => [
        { address: vault, abi: vaultAbi, functionName: "balanceOf", args: [BigInt(id)] } as const,
        { address: vault, abi: vaultAbi, functionName: "shieldUntil", args: [BigInt(id)] } as const,
      ]),
      allowFailure: false,
    });
    const out = new Map<number, VaultState>();
    ids.forEach((id, i) => out.set(id, { balance: res[2 * i] as bigint, shieldUntil: Number(res[2 * i + 1]) }));
    return out;
  }

  return {
    async ownerOf(tokenId) {
      try {
        return await client.readContract({ address: chog, abi: chogAbi, functionName: "ownerOf", args: [BigInt(tokenId)] });
      } catch {
        return null;
      }
    },
    async ownedBy(owner) {
      const list = await owners();
      const out: number[] = [];
      list.forEach((o, id) => o && o.toLowerCase() === owner.toLowerCase() && out.push(id));
      return out;
    },
    async vault(id) {
      return (await vaults([id])).get(id)!;
    },
    vaults,
    async params() {
      const [capBps, minStake, ticketBps] = await client.multicall({
        contracts: [
          { address: vault, abi: vaultAbi, functionName: "capBps" },
          { address: vault, abi: vaultAbi, functionName: "minStake" },
          { address: vault, abi: vaultAbi, functionName: "ticketBps" },
        ],
        allowFailure: false,
      });
      return { capBps: Number(capBps), minStake: minStake as bigint, ticketBps: Number(ticketBps) };
    },
    async isSettled(raidId) {
      return client.readContract({ address: vault, abi: vaultAbi, functionName: "settled", args: [raidId] });
    },
  };
}

export { vaultAbi };
