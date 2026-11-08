import type { BuildOptions } from "esbuild";

// One set of bundle settings, used by the build and by the Mod's bundle harness test, so the
// harness loads exactly what ships. The immediately invoked format matters most to the Mod:
// every Mod script shares one global scope, so a name left at the top level could overwrite
// another script's.
export function describeProductBundle(productDirectory: string, bundleName: string): BuildOptions {
  return {
    absWorkingDir: productDirectory,
    entryPoints: ["src/main.ts"],
    outfile: `dist/${bundleName}.js`,
    bundle: true,
    format: "iife",
    target: "es2022",
    metafile: true,
    logLevel: "warning",
    // Roll20 joins every Mod script in a game into one file. A "use strict" line ahead of the
    // wrapper would make every script after ours strict and could break them (FF93).
    tsconfigRaw: { compilerOptions: { alwaysStrict: false } },
  };
}
