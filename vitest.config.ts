import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tools/checks/test/**/*.test.ts", "shared/**/*.test.ts", "products/**/*.test.ts"],
    // A suite that matches nothing must fail, or a moved test directory would look green.
    passWithNoTests: false,
  },
});
