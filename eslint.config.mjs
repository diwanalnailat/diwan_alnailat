import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // Original artwork keeps its existing crop and dimensions during migration.
  { rules: { "@next/next/no-img-element": "off" } },
  globalIgnores([
    ".next/**",
    "dist/**",
    "diwan-alnailat/**",
    "public/**",
    "generated.js",
    "next-env.d.ts",
  ]),
]);
