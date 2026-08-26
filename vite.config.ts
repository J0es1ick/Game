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
              // The campaign engine changes independently from the view layer.
              // A static shared chunk keeps the synchronous API while preventing
              // the main interface bundle from growing into a single large file.
              name: "world-engine",
              test: /[\\/]gameplay[\\/]WorldGame\.ts$/,
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
