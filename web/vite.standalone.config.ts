// Standalone build: one JS and one CSS file, no code splitting, for packaging
// as a single self-contained page (see scripts/standalone.mjs).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-standalone",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: "standalone.html",
      output: { inlineDynamicImports: true, entryFileNames: "app.js", assetFileNames: "[name][extname]" },
    },
  },
});
