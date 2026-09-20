module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "style",
        "design",
        "docs",
        "test",
        "chore",
        "perf",
      ],
    ],
    "scope-enum": [
      2,
      "always",
      ["wholesale", "retail", "ui", "api", "shared", "config", "deps"],
    ],
    "scope-empty": [2, "never"],
    "subject-max-length": [2, "always", 50],
    "subject-full-stop": [2, "never", "."],
  },
};
