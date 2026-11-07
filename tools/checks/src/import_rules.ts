import { posix } from "node:path";
import typescript from "typescript";

export interface ScannedSourceFile {
  readonly repositoryRelativePath: string;
  readonly sourceText: string;
}

export interface ImportViolation {
  readonly importerPath: string;
  readonly importedSpecifier: string;
  readonly category: "layer direction" | "cross product" | "entry point" | "test code in product";
}

// One table, taken line for line from the diagram in section 2 of the specification, so the
// rule has one home. The testing layer may import any shared layer.
const importableLayersByLayer: Readonly<Record<string, readonly string[]>> = {
  domain: [],
  protocol: ["domain"],
  roll20: ["domain"],
  application: ["domain", "protocol"],
  testing: ["domain", "protocol", "roll20", "application"],
};

// Every other layer stays free of third party code so it builds with the toolchain alone
// (datum 0.10). Only the testing layer may reach a test framework.
const externalPackagesByLayer: Readonly<Record<string, readonly string[]>> = {
  testing: ["vitest", "fast-check"],
};

const productPackageNames: Readonly<Record<string, string>> = {
  "roll20-mod": "@fusion20/roll20-mod",
  "browser-extension": "@fusion20/browser-extension",
};

const sharedPackageName = "@fusion20/shared";
const testingEntryPoint = "testing";

interface ImportTarget {
  readonly kind: "shared layer" | "shared deep path" | "shared package root" | "product" | "external";
  readonly name: string;
}

function isTestFile(repositoryRelativePath: string): boolean {
  return repositoryRelativePath.endsWith(".test.ts") || repositoryRelativePath.includes("/test/");
}

function readImportedSpecifiers(sourceText: string): string[] {
  const preprocessedFile = typescript.preProcessFile(sourceText, true, true);
  return preprocessedFile.importedFiles.map((importedFile) => importedFile.fileName);
}

function classifyRepositoryPath(resolvedPath: string): ImportTarget {
  const [topDirectory, secondSegment] = resolvedPath.split("/");
  if (topDirectory === "shared" && secondSegment !== undefined) {
    return { kind: "shared layer", name: secondSegment };
  }
  if (topDirectory === "products" && secondSegment !== undefined) {
    return { kind: "product", name: secondSegment };
  }
  return { kind: "external", name: resolvedPath };
}

function classifyPackageSpecifier(importedSpecifier: string): ImportTarget {
  if (importedSpecifier === sharedPackageName) {
    return { kind: "shared package root", name: sharedPackageName };
  }
  if (importedSpecifier.startsWith(`${sharedPackageName}/`)) {
    const entryPoint = importedSpecifier.slice(sharedPackageName.length + 1);
    return entryPoint.includes("/")
      ? { kind: "shared deep path", name: entryPoint }
      : { kind: "shared layer", name: entryPoint };
  }
  const productDirectory = Object.keys(productPackageNames).find((productName) => {
    return productPackageNames[productName] === importedSpecifier;
  });
  return productDirectory === undefined
    ? { kind: "external", name: importedSpecifier }
    : { kind: "product", name: productDirectory };
}

function classifyImport(importerPath: string, importedSpecifier: string): ImportTarget {
  if (!importedSpecifier.startsWith(".")) {
    return classifyPackageSpecifier(importedSpecifier);
  }
  return classifyRepositoryPath(posix.join(posix.dirname(importerPath), importedSpecifier));
}

function findLayerViolation(importerLayer: string, target: ImportTarget): ImportViolation["category"] | undefined {
  if (target.kind === "shared layer") {
    const isPermitted = target.name === importerLayer || importableLayersByLayer[importerLayer]?.includes(target.name);
    return isPermitted ? undefined : "layer direction";
  }
  if (target.kind === "external" && externalPackagesByLayer[importerLayer]?.includes(target.name)) {
    return undefined;
  }
  return "layer direction";
}

function findProductViolation(
  importerProduct: string,
  importedSpecifier: string,
  target: ImportTarget,
  importerIsTest: boolean,
): ImportViolation["category"] | undefined {
  if (target.kind === "product") {
    return target.name === importerProduct ? undefined : "cross product";
  }
  if (target.kind === "shared deep path" || target.kind === "shared package root") {
    return "entry point";
  }
  if (target.kind === "shared layer") {
    if (!importedSpecifier.startsWith(sharedPackageName)) {
      return "entry point";
    }
    return target.name === testingEntryPoint && !importerIsTest ? "test code in product" : undefined;
  }
  return undefined;
}

export function findImportViolations(sourceFiles: readonly ScannedSourceFile[]): ImportViolation[] {
  const violations: ImportViolation[] = [];
  for (const { repositoryRelativePath, sourceText } of sourceFiles) {
    const [topDirectory, secondSegment] = repositoryRelativePath.split("/");
    const importerIsTest = isTestFile(repositoryRelativePath);
    for (const importedSpecifier of readImportedSpecifiers(sourceText)) {
      const target = classifyImport(repositoryRelativePath, importedSpecifier);
      let category: ImportViolation["category"] | undefined;
      if (topDirectory === "shared" && secondSegment !== undefined && !importerIsTest) {
        category = findLayerViolation(secondSegment, target);
      } else if (topDirectory === "products" && secondSegment !== undefined) {
        category = findProductViolation(secondSegment, importedSpecifier, target, importerIsTest);
      }
      if (category !== undefined) {
        violations.push({ importerPath: repositoryRelativePath, importedSpecifier, category });
      }
    }
  }
  return violations;
}
