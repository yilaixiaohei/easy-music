import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "music-worker": resolve("src/main/music-worker.ts"),
        },
      },
    },
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [vue()] },
});
