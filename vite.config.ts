import { defineConfig } from "vite";

export default defineConfig({
  base: "/Game/",
  root: "./src/web",
  publicDir: false,
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
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
