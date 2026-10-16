// Monad mainnet, the HideoutVault and $CHOG, as the browser sees them.
import { createPublicClient, defineChain, http, parseAbi, type Address } from "viem";

export const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://monadvision.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const VAULT = (import.meta.env.VITE_VAULT_ADDRESS ?? "0x21A1016A65416C5E63f1518cd0f5eDd4d2660445") as Address;
export const CHOG_TOKEN = "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777" as Address;

export const vaultAbi = parseAbi([
  "function balanceOf(uint256) view returns (uint256)",
  "function shieldUntil(uint256) view returns (uint64)",
  "function pendingWithdrawal(uint256) view returns (uint256 amount, uint64 readyAt)",
  "function minStake() view returns (uint256)",
  "function deposit(uint256 vaultId, uint256 amount)",
  "function requestWithdraw(uint256 vaultId, uint256 amount)",
  "function withdraw(uint256 vaultId)",
  "function settleRaid((bytes32 raidId,address raider,uint256 raiderToken,uint256 targetToken,uint256 amount,uint64 shieldSecs,uint64 deadline) r, bytes signature)",
  "function openRaid(bytes32 raidId, uint256 raiderToken, uint256 targetToken)",
  "function escrows(bytes32) view returns (address raider, uint64 expiresAt, uint256 raiderToken, uint256 targetToken, uint256 ticket)",
  "function payTickets(bytes32[] raidIds) returns (uint256 paid)",
  "function pendingRewards(uint256) view returns (uint256)",
  "function claimRewards(uint256 vaultId) returns (uint256 amount)",
  "function feeBps() view returns (uint16)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const publicClient = createPublicClient({ chain: monad, transport: http() });

export const txUrl = (hash: string) => `https://monadvision.com/tx/${hash}`;
