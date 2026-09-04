import base from "@ondo/config/eslint/base.js";

export default [
  ...base,
  // 생성물은 검사하지 않는다 — 손으로 고치지 않는 파일이라 지적할 대상이 없다
  { ignores: ["src/generated/**"] },
  // scripts/ 는 브라우저가 아니라 Node 로 돈다. 공유 설정엔 Node 전역이 없어서 여기서만 연다
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", fetch: "readonly", console: "readonly" },
    },
  },
];
