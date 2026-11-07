import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { findForbiddenBundleInputs, type BundleMetafile } from "./bundle_contents.ts";
import { detectClones } from "./clone_detection.ts";
import { findImportViolations, type ScannedSourceFile } from "./import_rules.ts";
import { findProseViolations } from "./prose_scan.ts";

export interface RepositoryFinding {
  readonly category: string;
  readonly location: string;
  readonly detail: string;
}

// Directories of tool state and local working documents, none of them tracked.
const skippedDirectoryNames = new Set([".git", "node_modules", "dist", "coverage", "thinkings"]);

// An explicit list, not a pattern, because a pattern eventually excludes something it should
// not (datum 0.8). The lockfile is generated, and holds third party text verbatim.
const proseExcludedPaths = new Set(["pnpm-lock.yaml"]);

const productDirectories = ["products/roll20-mod", "products/browser-extension"];
const sourceRoots = ["shared/", "products/"];

async function listRepositoryFiles(repositoryRoot: string, directory = repositoryRoot): Promise<string[]> {
  const repositoryFiles: string[] = [];
  for (const directoryEntry of await readdir(directory, { withFileTypes: true })) {
    if (directoryEntry.isDirectory() && skippedDirectoryNames.has(directoryEntry.name)) {
      continue;
    }
    const entryPath = join(directory, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      repositoryFiles.push(...(await listRepositoryFiles(repositoryRoot, entryPath)));
    } else {
      repositoryFiles.push(relative(repositoryRoot, entryPath).split(sep).join("/"));
    }
  }
  return repositoryFiles;
}

function collectProseFindings(repositoryRelativePath: string, fileText: string): RepositoryFinding[] {
  return findProseViolations(fileText).map((violation) => ({
    category: violation.category,
    location: `${repositoryRelativePath}:${String(violation.lineNumber)}`,
    detail: "datum 0.8 forbids this in any tracked text file",
  }));
}

async function collectBundleFindings(repositoryRoot: string): Promise<RepositoryFinding[]> {
  const bundleFindings: RepositoryFinding[] = [];
  for (const productDirectory of productDirectories) {
    const metafilePath = `${productDirectory}/dist/metafile.json`;
    let metafileText: string;
    try {
      metafileText = await readFile(join(repositoryRoot, metafilePath), "utf8");
    } catch {
      // Passing here would claim a bundle was inspected when none exists.
      bundleFindings.push({
        category: "bundle metadata missing",
        location: metafilePath,
        detail: "build the product before running the checks",
      });
      continue;
    }
    const bundleMetafile = JSON.parse(metafileText) as BundleMetafile;
    for (const forbiddenInput of findForbiddenBundleInputs(bundleMetafile)) {
      bundleFindings.push({ category: "test code in bundle", location: metafilePath, detail: forbiddenInput });
    }
  }
  return bundleFindings;
}

export async function collectRepositoryFindings(repositoryRoot: string): Promise<RepositoryFinding[]> {
  const findings: RepositoryFinding[] = [];
  const sourceFiles: ScannedSourceFile[] = [];
  for (const repositoryRelativePath of await listRepositoryFiles(repositoryRoot)) {
    const fileText = await readFile(join(repositoryRoot, repositoryRelativePath), "utf8");
    if (!proseExcludedPaths.has(repositoryRelativePath)) {
      findings.push(...collectProseFindings(repositoryRelativePath, fileText));
    }
    const isSource = repositoryRelativePath.endsWith(".ts");
    if (isSource && sourceRoots.some((sourceRoot) => repositoryRelativePath.startsWith(sourceRoot))) {
      sourceFiles.push({ repositoryRelativePath, sourceText: fileText });
    }
  }
  for (const violation of findImportViolations(sourceFiles)) {
    findings.push({
      category: violation.category,
      location: violation.importerPath,
      detail: violation.importedSpecifier,
    });
  }
  findings.push(...(await collectBundleFindings(repositoryRoot)));
  for (const detectedClone of await detectClones(repositoryRoot)) {
    findings.push({
      category: "copied code",
      location: detectedClone.firstLocation,
      detail: `${detectedClone.secondLocation}, ${String(detectedClone.lineCount)} lines, ${String(detectedClone.tokenCount)} tokens`,
    });
  }
  return findings;
}
