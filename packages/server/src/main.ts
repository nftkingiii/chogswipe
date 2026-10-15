import { buildApp } from "./app.js";
import { viemChain } from "./chain.js";
import { loadConfig } from "./config.js";
import { refereeSigner } from "./sign.js";
import { MemoryStore, type Store } from "./store.js";
import { PgStore } from "./pgStore.js";
import pg from "pg";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const config = loadConfig();

async function makeStore(): Promise<Store> {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set: using in-memory store (data is lost on restart)");
    return new MemoryStore();
  }
  const store = new PgStore(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 }));
  await store.migrate();
  return store;
}

const app = await buildApp({
  chain: viemChain(config.rpcUrl, config.chog, config.vault),
  store: await makeStore(),
  signer: refereeSigner(config.refereeKey, config.chainId, config.vault),
  chainId: config.chainId,
  allowedOrigin: config.allowedOrigin,
  holderMode: config.holderMode,
});
// serve the built game from the same origin, so wallet sign-in and the API share one domain
const dist = fileURLToPath(new URL("../../client/dist", import.meta.url));
// the client build ships .br/.gz copies (client/scripts/compress.mjs); hashed assets never change, so cache them for good
if (existsSync(dist)) {
  await app.register(fastifyStatic, {
    root: dist,
    prefix: "/",
    preCompressed: true,
    setHeaders: (res, path) => {
      res.header("Cache-Control", /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "public, max-age=300");
    },
  });
}

await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`referee listening on :${config.port}`);
