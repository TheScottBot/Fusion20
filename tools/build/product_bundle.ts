import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildOptions } from "esbuild";

// One set of bundle settings, used by the build and by the Mod's bundle harness test, so the
// harness loads exactly what ships. The immediately invoked format matters most to the Mod:
// every Mod script shares one global scope, so a name left at the top level could overwrite
// another script's.
// A product may open its bundle with a comment from bundle_banner.txt, where {{version}} becomes
// its package version. The Mod library asks for the name, version and setup at the top.
function readBanner(productDirectory: string): Pick<BuildOptions, "banner"> {
  const bannerPath = join(productDirectory, "bundle_banner.txt");
  if (!existsSync(bannerPath)) {
    return {};
  }
  const packageJson = JSON.parse(readFileSync(join(productDirectory, "package.json"), "utf8")) as { version: string };
  return { banner: { js: readFileSync(bannerPath, "utf8").trimEnd().replaceAll("{{version}}", packageJson.version) } };
}

// Entry points map each bundle name to its source, so a product with several scripts still
// builds in one pass, under one metafile for the bundle contents check.
export function describeProductBundle(
  productDirectory: string,
  entryPoints: Readonly<Record<string, string>>,
): BuildOptions {
  return {
    absWorkingDir: productDirectory,
    entryPoints: { ...entryPoints },
    outdir: "dist",
    bundle: true,
    format: "iife",
    target: "es2022",
    metafile: true,
    logLevel: "warning",
    // Roll20 joins every Mod script in a game into one file. A "use strict" line ahead of the
    // wrapper would make every script after ours strict and could break them (FF93).
    tsconfigRaw: { compilerOptions: { alwaysStrict: false } },
    ...readBanner(productDirectory),
  };
}
