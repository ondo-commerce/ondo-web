import { ACCOUNT_PATH, ACCOUNT_STATUS_LABEL } from "./constants";
import { ACCOUNTS } from "./fixtures";
import type { Account, AccountStatus, FieldErrors, LoginField } from "./types";

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
 * 로그인 직후 도착할 화면.
 *
 * 승인 전 계정을 마켓 홈으로 보내면 도매가가 보인다(RT-09 위반). 상태별 목적지를
 * 화면이 아니라 여기 한 곳에서 정하는 이유다.
 */
export function homePathFor(status: AccountStatus): string {
  switch (status) {
    case "APPROVED":
      return ACCOUNT_PATH.market;
    case "PENDING":
      return ACCOUNT_PATH.approval;
    case "REJECTED":
      return ACCOUNT_PATH.rejected;
  }
}

export interface LoginValues {
  email: string;
  password: string;
}

/**
 * 제출 시점에 한 번에 본다.
 *
 * 문구는 **요청형**이다. 아직 하지 않은 일을 했다고 말하지 않는다
 * (`8자로 맞췄어요` ✕ / `8자 이상으로 입력해 주세요` ○).
 */
export function validateLogin(values: LoginValues): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {};

  if (!values.email.trim()) errors.email = "이메일을 입력해 주세요.";
  else if (!EMAIL_SHAPE.test(values.email.trim()))
    errors.email = "이메일 형식으로 입력해 주세요. 예: store@example.com";

  if (!values.password) errors.password = "비밀번호를 입력해 주세요.";

  return errors;
}

/**
 * 제출 후 포커스를 옮길 칸 = 화면 순서상 첫 오류 칸.
 *
 * `Object.keys`로 고르지 않는다 — 객체 키 순서는 오류가 **생긴** 순서지
 * 화면에 **놓인** 순서가 아니다. 그러면 아래쪽 칸으로 먼저 튄다.
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
 * 아직 손대지 않은 칸까지 매 글자마다 검사하면, 이메일을 치는 중에 비밀번호 칸이
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
 * 화면으로 가는지 화면이 말해 주지 않으면 세 갈래를 볼 방법이 없다.
 */
export function demoAccountHint(): string {
  return ACCOUNTS.map(
    (a) => `${a.email} (${ACCOUNT_STATUS_LABEL[a.status]})`,
  ).join(" · ");
}
