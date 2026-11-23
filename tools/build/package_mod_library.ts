import { join } from "node:path";
import { assembleModLibrary } from "./mod_library.ts";

// Run from the repository root after the build: prepares the Roll20 Mod library folder in
// release/, for a person to submit by pull request. It never submits anything.
const repositoryRoot = process.cwd();
try {
  const scriptFolder = await assembleModLibrary({
    scriptJsonPath: join(repositoryRoot, "products/roll20-mod/library/script.json"),
    bundlePath: join(repositoryRoot, "products/roll20-mod/dist/fusion20.js"),
    outputDirectory: join(repositoryRoot, "release/roll20-mod"),
  });
  console.log(`Prepared ${scriptFolder}`);
} catch (thrown) {
  console.error(thrown instanceof Error ? thrown.message : String(thrown));
  process.exitCode = 1;
}
