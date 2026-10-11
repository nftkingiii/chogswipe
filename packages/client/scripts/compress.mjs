// After `vite build`: write .br and .gz next to every text asset in dist/, so the referee
// server can send them precompressed (@fastify/static preCompressed). The game script goes
// from ~1.8 MB to ~0.4 MB over the wire.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const TEXT = /\.(js|css|html|json|svg|webmanifest)$/;
let saved = 0;
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (TEXT.test(f)) {
      const raw = readFileSync(p);
      if (raw.length < 1024) continue;
      const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
      writeFileSync(p + ".br", br);
      writeFileSync(p + ".gz", gzipSync(raw, { level: 9 }));
      saved += raw.length - br.length;
    }
  }
}
walk(new URL("../dist", import.meta.url).pathname);
console.log(`precompressed dist/ (brotli saves ${(saved / 1e6).toFixed(2)} MB)`);
