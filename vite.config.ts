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
        // Character artwork is large but still synchronously available to every
        // equipment card. Keep the rendering contract while isolating it in a
        // cacheable chunk instead of making UI code await dynamic imports.
        codeSplitting: {
          groups: [
            {
              name: "character-art",
              test: /[\\/]web[\\/]CharacterIllustration\.ts$/,
              includeDependenciesRecursively: false,
            },
            {
              // These modules are leaves of the UI dependency graph. Keeping
              // them together is safe: unlike WorldGame they do not import
              // values back from the main entry chunk, so no startup cycle is
              // introduced in the production build.
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
