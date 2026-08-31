import type { Account } from "./types";

/*
 * 화면을 그리기 위한 목업. API가 붙으면 이 파일만 지운다.
 *
 * 계정 더미를 셸의 `shared/fixtures.ts`가 아니라 여기에 두는 이유: 로그인 전
 * 4화면만 쓰는 값이고, 셸 더미는 다른 회차가 같이 건드리는 파일이다.
 */

/**
 * 로그인 분기를 흉내 내는 계정 3종. 백엔드가 없어 **이메일만으로** 상태가 갈린다.
 *
 * 실제 인증이 아니다. 세션도 쿠키도 미들웨어도 만들지 않는다 — 이번 회차는
 * "어느 화면으로 가는가"까지다.
 */
export const ACCOUNTS: Account[] = [
  { email: "store@example.com", storeName: "봄봄상회", status: "APPROVED" },
  { email: "pending@example.com", storeName: "하늘옷가게", status: "PENDING" },
  {
    email: "rejected@example.com",
    storeName: "우리옷가게",
    status: "REJECTED",
  },
];
