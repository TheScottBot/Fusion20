import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";

// Run from a product directory, so both products build one way and neither holds its own copy
// of this. The immediately invoked format matters most to the Mod: every Mod script shares one
// global scope, so a name left at the top level could overwrite another script's.
const productDirectory = process.cwd();
const bundleName = process.argv[2];
if (bundleName === undefined) {
  throw new Error("build_product needs the bundle name as its first argument");
}
const outputDirectory = join(productDirectory, "dist");

await mkdir(outputDirectory, { recursive: true });
const buildResult = await build({
  absWorkingDir: productDirectory,
  entryPoints: ["src/main.ts"],
  outfile: `dist/${bundleName}.js`,
  bundle: true,
  format: "iife",
  target: "es2022",
  metafile: true,
  logLevel: "warning",
});
await writeFile(join(outputDirectory, "metafile.json"), JSON.stringify(buildResult.metafile, null, 2));
