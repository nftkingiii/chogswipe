import { buildApp } from "./app.js";
import { viemChain } from "./chain.js";
import { loadConfig } from "./config.js";
import { refereeSigner } from "./sign.js";
import { MemoryStore } from "./store.js";

const config = loadConfig();
const app = await buildApp({
  chain: viemChain(config.rpcUrl, config.chog, config.vault),
  store: new MemoryStore(),
  signer: refereeSigner(config.refereeKey, config.chainId, config.vault),
  chainId: config.chainId,
  allowedOrigin: config.allowedOrigin,
});
await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`referee listening on :${config.port}`);
