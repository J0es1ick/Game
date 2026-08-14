import { defineConfig } from "vite";

export default defineConfig({
  base: "/Game/",
  root: "./src/web",
  publicDir: false,
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
