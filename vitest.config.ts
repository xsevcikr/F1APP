import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/test/**/*.test.ts", "server/test/**/*.test.ts", "web/test/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["web/test/**", "jsdom"]],
    env: { LOG_LEVEL: "silent" },
  },
});
