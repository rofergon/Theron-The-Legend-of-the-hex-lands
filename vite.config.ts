import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 5173,
    open: "/landing/",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: resolve(rootDir, "index.html"),
        game: resolve(rootDir, "game/index.html"),
      },
    },
  },
});
