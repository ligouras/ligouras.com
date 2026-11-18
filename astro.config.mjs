import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ligouras.com",
  output: "static",
  build: {
    format: "directory",
  },
});
