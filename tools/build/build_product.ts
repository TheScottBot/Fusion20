import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { describeProductBundle } from "./product_bundle.ts";

// Run from a product directory, so both products build one way and neither holds its own copy
// of this.
const productDirectory = process.cwd();
const bundleName = process.argv[2];
if (bundleName === undefined) {
  throw new Error("build_product needs the bundle name as its first argument");
}
const outputDirectory = join(productDirectory, "dist");

await mkdir(outputDirectory, { recursive: true });
const buildResult = await build(describeProductBundle(productDirectory, bundleName));
await writeFile(join(outputDirectory, "metafile.json"), JSON.stringify(buildResult.metafile, null, 2));
