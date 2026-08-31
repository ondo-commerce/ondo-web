import {
  ACCOUNT_PATH,
  ACCOUNT_STATUS_LABEL,
  APPROVAL_STEP_LABELS,
  PASSWORD_MIN_LENGTH,
  withStoreName,
} from "./constants";
import { ACCOUNTS } from "./fixtures";
import type {
  Account,
  AccountStatus,
  ApprovalStep,
  AttachedFile,
  FieldErrors,
  LoginField,
  SignupField,
} from "./types";

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

/** 신청 요약 한 줄이 카드 폭을 넘지 않는 길이. 상호명은 이보다 길 이유가 없다 */
const STORE_NAME_MAX = 40;

/**
 * 화면에 실어도 되는 상호명으로 다듬는다.
 *
 * 주소로 들어오는 값이라 길이도 내용도 보장이 없다. 앞뒤 공백을 떼고 줄바꿈·
 * 연속 공백을 한 칸으로 모은 뒤 40자에서 끊는다 — **글자를 조용히 지우지
 * 않으려고** 자르는 게 아니라, 요약 한 줄이 카드를 밀어내지 않게 막는 것이다.
 * 남는 게 없으면 `null`이고, 그때는 부르는 쪽이 더미로 되돌아간다.
 */
export function normalizeStoreName(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed.slice(0, STORE_NAME_MAX) : null;
}

/**
 * 로그인 직후 도착할 화면.
 *
 * 승인 전 계정을 마켓 홈으로 보내면 도매가가 보인다(RT-09 위반). 상태별 목적지를
 * 화면이 아니라 여기 한 곳에서 정하는 이유다.
 *
 * 상호명을 주소에 실어 보낸다 — 승인 화면은 세션이 없어서 이 값이 없으면
 * 누가 로그인했든 같은 더미 상호를 보여 준다.
 */
export function homePathFor(account: Account): string {
  const store = normalizeStoreName(account.storeName);
  switch (account.status) {
    case "APPROVED":
      return ACCOUNT_PATH.market;
    case "PENDING":
      return withStoreName(ACCOUNT_PATH.approval, store);
    case "REJECTED":
      return withStoreName(ACCOUNT_PATH.rejected, store);
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

/* ── 회원가입 ─────────────────────────────────────────────────────────── */

/** 연락처 형식. 국번은 2~3자리(02·031·010)까지 받는다 */
const PHONE_SHAPE = /^0\d{1,2}-\d{3,4}-\d{4}$/;
/** 사업자등록번호 형식. 값이 아니라 **자리수**만 본다 — 실제 대조는 운영자가 한다 */
const BIZ_NO_SHAPE = /^\d{3}-\d{2}-\d{5}$/;

/**
 * 구분자만 하이픈으로 맞춘다. **글자를 지우지 않는다.**
 *
 * `010.1234.5678`을 숫자만 남기는 식으로 정리하면 `45.5`가 `455`가 된다 —
 * 사용자가 친 값과 칸에 남은 값이 달라지고, 아무도 그 사실을 모른다.
 * 여기서는 `.`·공백·`/`를 `-`로 **바꾸기만** 한다. 자릿수가 넘치면 넘친 채로
 * 남고, 틀렸다는 말은 검증이 한다.
 */
export function normalizeSeparators(raw: string): string {
  return raw.trim().replace(/[.\s/]+/g, "-");
}

export interface SignupValues {
  storeName: string;
  ownerName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phone: string;
  /** 필수가 아니다. 적었으면 형식만 본다 */
  bizNo: string;
  license: AttachedFile | null;
  agreeService: boolean;
  agreePrivacy: boolean;
}

export const EMPTY_SIGNUP: SignupValues = {
  storeName: "",
  ownerName: "",
  email: "",
  password: "",
  passwordConfirm: "",
  phone: "",
  bizNo: "",
  license: null,
  agreeService: false,
  agreePrivacy: false,
};

/**
 * 제출 시점에 전 칸을 한 번에 본다. 문구는 전부 **요청형**이다.
 *
 * 약관 동의도 여기서 같이 본다 — 버튼을 잠그는 대신 누르면 이유를 말하기로
 * 했으므로(`01-pm.md` R3) 동의 여부는 다른 칸과 똑같은 검증 대상이다.
 */
export function validateSignup(values: SignupValues): FieldErrors<SignupField> {
  const errors: FieldErrors<SignupField> = {};

  if (!values.storeName.trim()) errors.storeName = "상호명을 입력해 주세요.";
  if (!values.ownerName.trim()) errors.ownerName = "대표자명을 입력해 주세요.";

  if (!values.email.trim()) errors.email = "이메일을 입력해 주세요.";
  else if (!EMAIL_SHAPE.test(values.email.trim()))
    errors.email = "이메일 형식으로 입력해 주세요. 예: store@example.com";

  if (!values.password) errors.password = "비밀번호를 입력해 주세요.";
  else if (values.password.length < PASSWORD_MIN_LENGTH)
    errors.password = `비밀번호를 ${PASSWORD_MIN_LENGTH}자 이상으로 입력해 주세요.`;

  if (!values.passwordConfirm)
    errors.passwordConfirm = "비밀번호를 한 번 더 입력해 주세요.";
  else if (values.passwordConfirm !== values.password)
    errors.passwordConfirm = "위에 입력한 비밀번호와 같게 입력해 주세요.";

  if (!values.phone.trim()) errors.phone = "연락처를 입력해 주세요.";
  else if (!PHONE_SHAPE.test(normalizeSeparators(values.phone)))
    errors.phone = "연락처를 010-0000-0000 형식으로 입력해 주세요.";

  /* 비워 두면 통과한다. 적었는데 자리수가 안 맞으면 그때만 말한다 —
     넘친 글자를 몰래 잘라내지 않으므로 여기서 걸린다 */
  if (
    values.bizNo.trim() &&
    !BIZ_NO_SHAPE.test(normalizeSeparators(values.bizNo))
  )
    errors.bizNo =
      "사업자등록번호를 000-00-00000 형식(숫자 10자리)으로 입력해 주세요.";

  if (!values.license) errors.license = "사업자등록증 파일을 첨부해 주세요.";

  if (!values.agreeService)
    errors.agreeService = "이용약관을 확인하고 동의해 주세요.";
  if (!values.agreePrivacy)
    errors.agreePrivacy = "개인정보 수집·이용에 동의해 주세요.";

  return errors;
}

/** 첨부 파일 용량 표시. 이름 옆에 붙어 "무엇이 붙었는지"를 마저 말한다 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 화면에 실제로 띄울 오류만 남긴다.
 *
 * 전 칸 검증은 매 렌더마다 돌지만(순수 함수라 싸다), 그중 **이미 한 번 걸린
 * 칸**의 것만 보여 준다. 아직 손도 안 댄 칸이 타이핑 도중에 빨개지는 걸 막으면서,
 * 한 번 빨개진 칸은 고치는 즉시 풀리게 하는 방법이다.
 *
 * 이걸 상태로 들고 있지 않는 이유: 값과 오류를 각각 `useState`로 두면 두 칸이
 * 같은 이벤트에서 바뀔 때 나중 것이 앞 것을 덮어쓴다(약관 체크 2개).
 */
export function visibleErrors<K extends string>(
  all: FieldErrors<K>,
  revealed: readonly K[],
): FieldErrors<K> {
  const shown: FieldErrors<K> = {};
  for (const field of revealed) {
    const message = all[field];
    if (message !== undefined) shown[field] = message;
  }
  return shown;
}

/* ── 가입 심사 진행 ───────────────────────────────────────────────────── */

/**
 * 진행 표시 3단.
 *
 * 승인 대기와 거절이 **같은 컴포넌트를 쓰게** 하려고 단계 배열을 여기서 만든다.
 * 화면 두 곳이 각자 배열을 적으면 라벨이 갈리고, 나중에 단계가 늘 때(Q1 거래관계
 * 승인 층) 한쪽만 늘어난다.
 */
export function approvalSteps(status: AccountStatus): ApprovalStep[] {
  const applied: ApprovalStep = {
    label: APPROVAL_STEP_LABELS.applied,
    state: "done",
  };

  if (status === "REJECTED") {
    return [
      applied,
      { label: APPROVAL_STEP_LABELS.reviewing, state: "done" },
      /* 지나간 단계가 아니라 지금 멈춰 있는 자리다 */
      { label: APPROVAL_STEP_LABELS.rejected, state: "current" },
    ];
  }

  if (status === "APPROVED") {
    return [
      applied,
      { label: APPROVAL_STEP_LABELS.reviewing, state: "done" },
      { label: APPROVAL_STEP_LABELS.approved, state: "current" },
    ];
  }

  return [
    applied,
    { label: APPROVAL_STEP_LABELS.reviewing, state: "current" },
    { label: APPROVAL_STEP_LABELS.approved, state: "todo" },
  ];
}
