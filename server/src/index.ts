import { buildApp, createDeps } from "./app.ts";
import { loadConfig } from "./config.ts";

const cfg = loadConfig();
const deps = createDeps(cfg);
const app = await buildApp(cfg, deps);
deps.live.start();

app.log.info(
  `OpenF1 ${cfg.openf1.username ? "Sponsor credentials configured (live enabled)" : "free tier (historical only, live disabled)"}`,
);

await app.listen({ port: cfg.port, host: cfg.host });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    deps.live.stop();
    await app.close();
    process.exit(0);
  });
}
