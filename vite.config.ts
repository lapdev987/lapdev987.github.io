import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  assetsInclude: ["**/*.glb", "**/*.hdr", "**/*.wasm"],
  build: { target: "es2022", assetsInlineLimit: 20000000, sourcemap: false }
});
