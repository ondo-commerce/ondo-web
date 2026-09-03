import {
  ACCOUNT_PATH,
  ACCOUNT_STATUS_LABEL,
  VALIDATION_MESSAGE,
} from "./constants";
import { ACCOUNTS } from "./fixtures";
import type { Account, FieldErrors, LoginField } from "./types";

/**
 * 이메일 형식. 서버 검증을 흉내 내지 않는다 — `@`와 점 하나가 있는지만 본다.
 * 여기서 RFC를 따라가면 실제로 쓰는 주소를 틀렸다고 말하는 쪽이 더 흔해진다.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 등록된 계정인지 본다. 없으면 `null` — 어느 칸이 틀렸는지는 호출부가 말하지 않는다 */
export function findAccount(email: string): Account | null {
  const normalized = email.trim().toLowerCase();
  return ACCOUNTS.find((a) => a.email === normalized) ?? null;
}

/**
 * 신청 요약 한 줄이 카드 폭을 넘지 않는 길이.
 *
 * **입력칸도 이 값을 봐야 한다.** 저장할 때만 자르면 폼에는 친 글자가, 저장값과
 * 계정 메뉴에는 잘린 글자가 남아 **같은 세션에 두 상호명이 산다**. 자르는 자리가
 * 하나뿐이도록 여기서 내보낸다.
 */
export const STORE_NAME_MAX = 40;

/**
 * 화면에 실어도 되는 상호명으로 다듬는다.
 *
 * 앞뒤 공백을 떼고 줄바꿈·연속 공백을 한 칸으로 모은 뒤 상한에서 끊는다.
 * 남는 게 없으면 `null`이고, 그때는 부르는 쪽이 원래 값을 지킨다.
 */
export function normalizeStoreName(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed.slice(0, STORE_NAME_MAX) : null;
}

/**
 * 로그인 직후 도착할 화면. **상태별 목적지를 화면이 아니라 여기 한 곳에서 정한다.**
 *
 * 승인 전 계정을 ERP로 보내면 재고·정산 장부가 그대로 열린다. 승인은 받았지만
 * 계좌를 아직 안 낸 사장은 온보딩을 한 번 거친다 — **한 번뿐이다.** 매 로그인마다
 * 같은 화면이 뜨면 사장은 내용을 안 읽고 닫는 법부터 배운다.
 */
export function homePathFor(account: Account, bankPromptSeen: boolean): string {
  switch (account.status) {
    case "PENDING":
      return ACCOUNT_PATH.approval;
    case "REJECTED":
      return ACCOUNT_PATH.rejected;
    case "APPROVED":
      return account.bankAccount === null && !bankPromptSeen
        ? ACCOUNT_PATH.bankOnboarding
        : ACCOUNT_PATH.erpHome;
  }
}

/**
 * ERP 화면(`(erp)`)에 들어온 사람을 어디로 보낼지. `null`이면 그대로 통과다.
 *
 * **계좌 온보딩으로는 보내지 않는다.** 계좌를 안 넣었다고 ERP 전체를 막으면
 * 계좌와 무관한 업무(주문 확인·재고 입고·출고)까지 멈춘다. 온보딩은 로그인
 * 시점의 안내지 통행 조건이 아니다 — 안 넣은 사실은 계정 메뉴에 상시로 남는다.
 */
export function erpRedirectFor(account: Account | null): string | null {
  if (!account) return ACCOUNT_PATH.login;

  switch (account.status) {
    case "PENDING":
      return ACCOUNT_PATH.approval;
    case "REJECTED":
      return ACCOUNT_PATH.rejected;
    case "APPROVED":
      return null;
  }
}

export interface LoginValues {
  email: string;
  password: string;
}

export const EMPTY_LOGIN: LoginValues = { email: "", password: "" };

/**
 * 제출 시점에 한 번에 본다.
 *
 * 비밀번호는 **길이도 보지 않는다** — 대조할 서버가 없어 "맞는 비밀번호"라는
 * 개념 자체가 없다. 비어 있는지까지가 이 화면이 판정할 수 있는 전부다.
 */
export function validateLogin(values: LoginValues): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {};

  if (!values.email.trim()) errors.email = VALIDATION_MESSAGE.email;
  else if (!EMAIL_SHAPE.test(values.email.trim()))
    errors.email = VALIDATION_MESSAGE.emailShape;

  if (!values.password) errors.password = VALIDATION_MESSAGE.password;

  return errors;
}

/**
 * 제출 후 포커스를 옮길 칸 = 화면 순서상 첫 오류 칸.
 *
 * `Object.keys`로 고르지 않는다 — 객체 키 순서는 오류가 **생긴** 순서지 화면에
 * **놓인** 순서가 아니다. 그러면 아래쪽 칸으로 먼저 튄다.
 */
export function firstInvalidField<K extends string>(
  errors: FieldErrors<K>,
  order: readonly K[],
): K | null {
  return order.find((field) => errors[field] !== undefined) ?? null;
}

/**
 * 한 번 오류가 났던 칸만 타이핑마다 다시 본다.
 *
 * 아직 손대지 않은 칸까지 매 글자마다 검사하면 이메일을 치는 중에 비밀번호 칸이
 * 빨개진다. 반대로 이미 빨간 칸을 그대로 두면 다 고쳐도 빨간 채로 남는다.
 */
export function revalidateField<K extends string>(
  prev: FieldErrors<K>,
  fresh: FieldErrors<K>,
  field: K,
): FieldErrors<K> {
  if (prev[field] === undefined) return prev;

  const next = { ...prev };
  const message = fresh[field];
  if (message === undefined) delete next[field];
  else next[field] = message;
  return next;
}

/**
 * 로그인 화면 맨 아래 "화면 확인용 계정" 한 줄.
 *
 * 실제 인증이 없어서 이 목록 밖의 이메일은 전부 실패한다. 어느 이메일이 어느
 * 화면으로 가는지 화면이 말해 주지 않으면 네 갈래를 볼 방법이 없다.
 *
 * **이 줄을 그리는 자리는 개발 환경으로 감싼다**(`LoginView`) — 앞 회차
 * `retail-account` F6이 정확히 이 목록을 프로덕션 빌드로 내보냈다.
 */
export function demoAccountHint(): string {
  return ACCOUNTS.map((a) => {
    const status = ACCOUNT_STATUS_LABEL[a.status];
    const bank =
      a.status === "APPROVED" && !a.bankAccount ? " · 계좌 없음" : "";
    return `${a.email} (${status}${bank})`;
  }).join(" · ");
}

/** 계정 메뉴의 이니셜 한 글자. `[0]`으로 자르면 이모지·일부 한자가 반쪽만 남는다 */
export function storeInitial(storeName: string): string {
  return Array.from(storeName.trim())[0] ?? "";
}
