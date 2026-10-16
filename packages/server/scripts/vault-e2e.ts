// End-to-end check of the referee's signatures against the real HideoutVault bytecode on a local chain (anvil, chain id 143).
//   anvil --chain-id 143 --port 8546  &&  npx tsx scripts/vault-e2e.ts
// Opens a raid, signs the escape with the server's own signer, settles it, then lets a second raid's ticket go to the defender.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEther, type Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { refereeSigner } from "../src/sign.js";

const RPC = process.env.RPC ?? "http://127.0.0.1:8546";
const chain = defineChain({ id: 143, name: "local", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http() });
// anvil's well-known development keys (public test keys, never used on a real network)
const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];
const [deployer, alice, bob] = KEYS.map((k) => createWalletClient({ account: privateKeyToAccount(k), chain, transport: http() }));
const art = (file: string, name: string) => {
  const j = JSON.parse(readFileSync(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url), "utf8"));
  return { abi: j.abi as Abi, bytecode: j.bytecode.object as Hex };
};

async function deploy(name: string, file: string, args: unknown[] = []): Promise<Address> {
  const { abi, bytecode } = art(file, name);
  const hash = await deployer!.deployContract({ abi, bytecode, args });
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
}
async function call(w: typeof alice, address: Address, abi: Abi, functionName: string, args: unknown[]) {
  const hash = await w!.writeContract({ address, abi, functionName, args, chain, account: w!.account! });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
}

const refKey = generatePrivateKey();
const chogA = await deploy("LocalChog", "Mocks.sol");
const tokenA = await deploy("LocalChogToken", "Mocks.sol");
const referee = privateKeyToAccount(refKey).address;
const vault = await deploy("HideoutVault", "HideoutVault.sol", [chogA, tokenA, referee, 1_000, parseEther("100"), 3600n, 1_000, 500, 1800n]);
const { abi: vAbi } = art("HideoutVault.sol", "HideoutVault");
const mAbi = parseAbi(["function mint(address,uint256)", "function approve(address,uint256) returns (bool)"]);
const bal = (id: number) => pub.readContract({ address: vault, abi: vAbi, functionName: "balanceOf", args: [BigInt(id)] }) as Promise<bigint>;

for (const [w, id, amt] of [[alice, 1, "500"], [bob, 2, "1000"]] as const) {
  await call(deployer, chogA, mAbi, "mint", [w!.account!.address, BigInt(id)]);
  await call(deployer, tokenA, mAbi, "mint", [w!.account!.address, parseEther(amt)]);
  await call(w, tokenA, mAbi, "approve", [vault, parseEther(amt)]);
  await call(w, vault, vAbi, "deposit", [BigInt(id), parseEther(amt)]);
}

// raid 1: open, sign with the server's signer, settle
const raidId = `0x${"11".repeat(32)}` as Hex;
await call(alice, vault, vAbi, "openRaid", [raidId, 1n, 2n]);
const signer = refereeSigner(refKey, 143, vault);
const msg = { raidId, raider: alice!.account!.address, raiderToken: 1n, targetToken: 2n, amount: parseEther("100"), shieldSecs: 14_400n, deadline: BigInt(Math.floor(Date.now() / 1000) + 900) };
const sig = await signer.signResult(msg);
await call(alice, vault, vAbi, "settleRaid", [msg, sig]);
console.log("escape settled: alice", Number(await bal(1)) / 1e18, "bob", Number(await bal(2)) / 1e18);
if ((await bal(1)) !== parseEther("595") || (await bal(2)) !== parseEther("900")) throw new Error("unexpected balances after escape");
const earned = (await pub.readContract({ address: vault, abi: vAbi, functionName: "pendingRewards", args: [2n] })) as bigint;
console.log("bob's staking rewards from it:", Number(earned) / 1e18);
if (earned === 0n) throw new Error("no rewards accrued");

// raid 2 (on bob again after the shield): never settled, so the ticket goes to bob
await pub.request({ method: "evm_increaseTime" as never, params: [14_401] as never });
const raid2 = `0x${"22".repeat(32)}` as Hex;
await call(alice, vault, vAbi, "openRaid", [raid2, 1n, 2n]);
const ticket = (await pub.readContract({ address: vault, abi: vAbi, functionName: "escrows", args: [raid2] }) as unknown[])[4] as bigint;
await pub.request({ method: "evm_increaseTime" as never, params: [1801] as never });
await call(bob, vault, vAbi, "payTickets", [[raid2]]);
console.log("caught raider's ticket paid to bob:", Number(ticket) / 1e18, "→ bob", Number(await bal(2)) / 1e18);
console.log("OK");
