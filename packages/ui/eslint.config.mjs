import base from "@ondo/config/eslint/base.js";

export default [
  ...base,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@ondo/api", "@ondo/api/*"],
              message:
                "@ondo/ui는 도메인을 모른다 (ADR-0004). API 타입이 필요하면 앱의 features/로 옮기거나, 제네릭·렌더prop으로 도메인을 밖으로 밀어내라",
            },
          ],
        },
      ],
    },
  },
];
