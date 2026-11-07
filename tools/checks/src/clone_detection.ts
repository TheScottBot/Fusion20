import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export interface DetectedClone {
  readonly firstLocation: string;
  readonly secondLocation: string;
  readonly lineCount: number;
  readonly tokenCount: number;
}

interface CloneReportFile {
  readonly name: string;
  readonly start: number;
}

interface CloneReport {
  readonly duplicates: readonly {
    readonly firstFile: CloneReportFile;
    readonly secondFile: CloneReportFile;
    readonly lines: number;
    readonly tokens: number;
  }[];
}

// jscpd reports a clone only when it meets every limit at once, but the author's rule is
// five lines or fifty tokens. Two passes, each relaxing the other limit to one, give that.
// Checked on throwaway clones with jscpd 5.4.2 on 7 November 2026.
const clonePasses = [
  { minimumLines: 5, minimumTokens: 1 },
  { minimumLines: 1, minimumTokens: 50 },
] as const;

const ignoredCloneGlobs = [
  "**/node_modules/**",
  "**/dist/**",
  "**/coverage/**",
  "**/thinkings/**",
  "**/pnpm-lock.yaml",
];

const executeFile = promisify(execFile);
const jscpdExecutable = join(import.meta.dirname, "../../../node_modules/.bin/jscpd");

function locationOf(reportFile: CloneReportFile): string {
  return `${reportFile.name}:${String(reportFile.start)}`;
}

async function detectClonesInPass(
  repositoryRoot: string,
  reportDirectory: string,
  clonePass: (typeof clonePasses)[number],
): Promise<DetectedClone[]> {
  // The report is read rather than the exit code, and no flag fails an empty scan, because a
  // file below the limits is not analysed at all and an empty skeleton is a valid tree.
  await executeFile(jscpdExecutable, [
    repositoryRoot,
    "--min-lines",
    String(clonePass.minimumLines),
    "--min-tokens",
    String(clonePass.minimumTokens),
    "--ignore",
    ignoredCloneGlobs.join(","),
    "--reporters",
    "json",
    "--output",
    reportDirectory,
    "--absolute",
    "--no-colors",
    "--silent",
  ]);
  const reportText = await readFile(join(reportDirectory, "jscpd-report.json"), "utf8");
  const cloneReport = JSON.parse(reportText) as CloneReport;
  return cloneReport.duplicates.map((duplicate) => ({
    firstLocation: locationOf(duplicate.firstFile),
    secondLocation: locationOf(duplicate.secondFile),
    lineCount: duplicate.lines,
    tokenCount: duplicate.tokens,
  }));
}

export async function detectClones(repositoryRoot: string): Promise<DetectedClone[]> {
  const reportDirectory = await mkdtemp(join(tmpdir(), "fusion20-clones-"));
  try {
    const clonesByLocation = new Map<string, DetectedClone>();
    for (const clonePass of clonePasses) {
      for (const detectedClone of await detectClonesInPass(repositoryRoot, reportDirectory, clonePass)) {
        clonesByLocation.set(`${detectedClone.firstLocation}|${detectedClone.secondLocation}`, detectedClone);
      }
    }
    return [...clonesByLocation.values()];
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}
