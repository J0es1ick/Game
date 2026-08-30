import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/Game/",
  root: "./src/web",
  publicDir: false,
  plugins: [
    react(),
    {
      name: "watch-game-sources",
      apply: "serve",
      configureServer(server) {
        server.watcher.add(resolve(server.config.root, ".."));
      },
    },
  ],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              includeDependenciesRecursively: false,
            },
            {
              name: "save-codec",
              test: /[\\/]node_modules[\\/]fflate[\\/]/,
              includeDependenciesRecursively: false,
            },
            {
              name: "character-art",
              test: /[\\/]CharacterIllustration\.ts$/,
              includeDependenciesRecursively: false,
            },
            {
              name: "ui-support",
              test: /[\\/](GameAudio|TutorialCatalog|UiRuntime)\.ts$/,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
