import { describe, expect, it } from "vitest";
import { findForbiddenBundleInputs } from "../src/bundle_contents.ts";

describe("findForbiddenBundleInputs", () => {
  it("reports a bundle input from shared/testing", () => {
    const forbiddenInputs = findForbiddenBundleInputs({
      inputs: {
        "src/main.ts": {},
        "../../shared/testing/doubles.ts": {},
      },
    });
    expect(forbiddenInputs).toEqual(["../../shared/testing/doubles.ts"]);
  });

  it("passes a bundle built only from product and runtime shared code", () => {
    const forbiddenInputs = findForbiddenBundleInputs({
      inputs: { "src/main.ts": {}, "../../shared/domain/index.ts": {} },
    });
    expect(forbiddenInputs).toEqual([]);
  });
});
