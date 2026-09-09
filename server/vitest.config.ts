import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@orbita-prs/shared": path.resolve("../shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
