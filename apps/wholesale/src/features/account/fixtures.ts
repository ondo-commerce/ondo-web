import type { Account } from "./types";

/*
 * 화면을 그리기 위한 목업. API가 붙으면 이 파일만 지운다.
 *
 * ⚠️ **진짜처럼 생긴 사업자등록번호·계좌번호를 적지 않는다.** 자리표시자(0으로
 *    채운 값)만 쓴다 — 더미는 스크린샷과 문서에 그대로 실려 나간다.
 */

/**
 * 로그인 분기를 흉내 내는 계정 4종. 백엔드가 없어 **이메일만으로** 갈린다.
 *
 * 비밀번호는 **아무 값이나 통과**한다. 해시도 검증도 없다는 사실을 감추지
 * 않는다 — 로그인 화면이 개발 환경에서 이 목록을 그대로 보여 준다.
 *
 * 승인 계정이 둘인 이유: 승인 여부만으로는 **최초 로그인 온보딩**을 볼 수 없다.
 * 계좌가 있는 계정과 없는 계정을 나눠야 "처음 들어온 사장"의 경로가 화면으로
 * 확인된다.
 */
export const ACCOUNTS: readonly Account[] = [
  {
    email: "approved@ondo.test",
    storeName: "온도의류",
    bizNo: "000-00-00000",
    status: "APPROVED",
    bankAccount: {
      bankName: "신한은행",
      accountNo: "110-000-000000",
      holder: "온도의류",
    },
  },
  {
    email: "first@ondo.test",
    storeName: "첫걸음패션",
    bizNo: "000-00-00000",
    status: "APPROVED",
    /* 계좌를 아직 안 낸 사장. 로그인하면 온보딩이 한 번 뜬다 */
    bankAccount: null,
  },
  {
    email: "pending@ondo.test",
    storeName: "하늘의류",
    bizNo: "000-00-00000",
    status: "PENDING",
    bankAccount: null,
  },
  {
    email: "rejected@ondo.test",
    storeName: "우리의류",
    bizNo: "000-00-00000",
    status: "REJECTED",
    bankAccount: null,
  },
];
