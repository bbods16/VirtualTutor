import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors the path aliases declared in tsconfig.json's "paths". Vitest doesn't
// read tsconfig "paths" on its own, so without this every @domain/@services/
// @algorithms/@db import fails to resolve and the affected test files error
// out before any assertions run.
const srcPath = (subpath: string) =>
  fileURLToPath(new URL(`./src/${subpath}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@domain":     srcPath("domain"),
      "@services":   srcPath("services"),
      "@algorithms": srcPath("algorithms"),
      "@db":         srcPath("db"),
    },
  },
});
