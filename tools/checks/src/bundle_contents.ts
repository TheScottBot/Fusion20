export interface BundleMetafile {
  readonly inputs: Readonly<Record<string, unknown>>;
}

const sharedTestingPathSegment = "shared/testing/";

export function findForbiddenBundleInputs(bundleMetafile: BundleMetafile): string[] {
  return Object.keys(bundleMetafile.inputs).filter((inputPath) => inputPath.includes(sharedTestingPathSegment));
}
