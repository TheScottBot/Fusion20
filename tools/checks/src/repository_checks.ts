import { join } from "node:path";
import { collectRepositoryFindings } from "./repository_findings.ts";

// The decisions live in repository_findings so the tests can reach them. This file only prints
// what that module returns, as structured lines a pipeline can read (datum 0.15).
const repositoryRoot = join(import.meta.dirname, "../../..");
const findings = await collectRepositoryFindings(repositoryRoot);

for (const finding of findings) {
  console.error(JSON.stringify(finding));
}
console.log(JSON.stringify({ check: "repository", findingCount: findings.length }));
process.exitCode = findings.length === 0 ? 0 : 1;
