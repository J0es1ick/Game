import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/Game/",
  root: "./src/web",
  publicDir: false,
  plugins: [
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
              name: "character-art",
              test: /[\\/]web[\\/]CharacterIllustration\.ts$/,
              includeDependenciesRecursively: false,
            },
            {
              name: "ui-support",
              test: /[\\/]web[\\/](GameAudio|NotificationCenter|TutorialCatalog|UiRuntime)\.ts$/,
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
