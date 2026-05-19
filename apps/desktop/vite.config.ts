import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  envDir: "../..",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@transcriber/core": fileURLToPath(new URL("../../packages/core/src", import.meta.url)),
      "@transcriber/ui": fileURLToPath(new URL("../../packages/ui/src", import.meta.url))
    }
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true
  },
  clearScreen: false
});
