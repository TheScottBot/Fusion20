import typescriptEslint from "typescript-eslint";

// Names banned by datum 0.5, checked here so the rule is a failure and not a sentence.
const bannedNames = [
  "mgr",
  "svc",
  "util",
  "helper",
  "data",
  "item",
  "tmp",
  "buf",
  "msg",
  "cb",
  "handle",
  "run",
  "execute",
  "ctx",
];

export default typescriptEslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "thinkings/**", "*.mjs"] },
  ...typescriptEslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "id-denylist": ["error", ...bannedNames],
      "id-length": ["error", { min: 2, exceptions: ["_"], properties: "never" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: false }],
    },
  },
);
