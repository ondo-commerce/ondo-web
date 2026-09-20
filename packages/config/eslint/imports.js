export default [
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*"],
              message: "feature는 index.ts(public API)로만 import",
            },
            {
              group: ["../../*"],
              message: "2단계 이상 상대경로 금지. @/ alias 사용",
            },
          ],
        },
      ],
    },
  },
];
