import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { describeProductBundle } from "./product_bundle.ts";

// Run from a product directory, so both products build one way and neither holds its own copy
// of this. Each argument is bundle=source, such as fusion20=src/main.ts.
const productDirectory = process.cwd();
const entryArguments = process.argv.slice(2);
if (entryArguments.length === 0) {
  throw new Error("build_product needs at least one bundle=source argument");
}
const entryPoints = Object.fromEntries(
  entryArguments.map((entryArgument) => {
    const [bundleName, sourcePath] = entryArgument.split("=");
    if (bundleName === undefined || sourcePath === undefined || bundleName === "" || sourcePath === "") {
      throw new Error(`build_product cannot read ${entryArgument}, expected bundle=source`);
    }
    return [bundleName, sourcePath];
  }),
);
const outputDirectory = join(productDirectory, "dist");

await mkdir(outputDirectory, { recursive: true });
const buildResult = await build(describeProductBundle(productDirectory, entryPoints));
await writeFile(join(outputDirectory, "metafile.json"), JSON.stringify(buildResult.metafile, null, 2));
// An extension ships its manifest beside its scripts.
if (existsSync(join(productDirectory, "manifest.json"))) {
  await copyFile(join(productDirectory, "manifest.json"), join(outputDirectory, "manifest.json"));
}
