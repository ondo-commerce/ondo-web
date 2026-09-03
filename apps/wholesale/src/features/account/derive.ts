import {
  ACCOUNT_NO_MAX,
  ACCOUNT_NO_MIN,
  ACCOUNT_PATH,
  ACCOUNT_STATUS_LABEL,
  APPROVAL_STEP_LABELS,
  BANK_MESSAGE,
  MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  VALIDATION_MESSAGE,
} from "./constants";
import { ACCOUNTS, APPLICATION } from "./fixtures";
import type {
  Account,
  AccountStatus,
  BankAccount,
  BankField,
  Application,
  ApprovalStep,
  AttachedFile,
  DocumentField,
  FieldErrors,
  LoginField,
  SignupField,
} from "./types";

/**
 * 이메일 형식. 서버 검증을 흉내 내지 않는다 — `@`와 점 하나가 있는지만 본다.
 * 여기서 RFC를 따라가면 실제로 쓰는 주소를 틀렸다고 말하는 쪽이 더 흔해진다.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 이메일을 대조·저장에 쓰는 한 가지 모양으로 맞춘다. 로그인 대조와 세션 덮어쓰기의
 * **키**가 같은 값을 써야 한다 — 두 자리가 각자 다듬으면 `Kim@Ondo.test`로 신청한
 * 계정을 `kim@ondo.test`로 못 찾는다(`wholesale-account` F7).
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * **더미 계정에서만** 찾는다. 없으면 `null`.
 *
 * ⚠️ 이번 세션에 가입 신청한 계정은 여기 없다 — 그건 세션 덮어쓰기에 산다.
 *    로그인처럼 "이 이메일로 들어올 수 있나"를 묻는 자리는 `store.lookupAccount`를
 *    써야 한다. 이 함수만 보면 방금 신청을 마친 사장이 다시 로그인하지 못한다
 *    (`wholesale-account` F7).
 */
export function findAccount(email: string): Account | null {
  const normalized = normalizeEmail(email);
  return ACCOUNTS.find((a) => a.email === normalized) ?? null;
}

/** 입력칸과 저장이 같은 상한을 보도록 여기서 한 번만 내보낸다 */
export const STORE_NAME_MAX = MAX_LENGTH.storeName;

/** 남는 게 없으면 `null`이고, 그때는 부르는 쪽이 원래 값을 지킨다 */
export function normalizeStoreName(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed.slice(0, STORE_NAME_MAX) : null;
}

/**
 * 로그인 직후 도착할 화면. **상태별 목적지를 화면이 아니라 여기 한 곳에서 정한다.**
 * 계좌를 안 낸 사장은 온보딩을 **한 번만** 거친다 — 매 로그인마다 같은 화면이 뜨면
 * 사장은 내용을 안 읽고 닫는 법부터 배운다.
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
 * 계좌와 무관한 업무(주문 확인·재고 입고·출고)까지 멈춘다 — 온보딩은 로그인
 * 시점의 안내지 통행 조건이 아니다.
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

/**
 * 계정 화면(`승인 대기`·`승인 거절`·`계좌 온보딩`)에 **설 자격**을 본다.
 * `null`이면 통과, 아니면 이 계정이 서야 할 화면 주소다 — `erpRedirectFor`의
 * 계정 화면 짝이고, 사연은 `AccountGate`에 적어 뒀다(`wholesale-account` F11).
 *
 * 보낼 곳을 `homePathFor`에 맡긴다 — "이 계정이 있어야 할 화면"을 정하는 규칙이
 * 로그인 직후와 여기서 갈리면, 같은 계정이 들어온 경로에 따라 다른 화면에 선다.
 *
 * ⚠️ **되돌아오는 짝이 없어야 한다.** `homePathFor`가 돌려주는 세 주소는 각각
 *    자기 상태를 통과시키는 화면이라(`/approval`←PENDING · `/approval/rejected`
 *    ←REJECTED · 온보딩/`/products`←APPROVED) 여기서 보낸 화면이 다시 돌려보내는
 *    일은 없다. 화면을 늘릴 때 이 대응을 같이 확인한다.
 */
export function accountRedirectFor(
  account: Account,
  bankPromptSeen: boolean,
  allowed: AccountStatus,
): string | null {
  if (account.status === allowed) return null;
  return homePathFor(account, bankPromptSeen);
}

export interface LoginValues {
  email: string;
  password: string;
}

export const EMPTY_LOGIN: LoginValues = { email: "", password: "" };

/**
 * 비밀번호는 **길이도 보지 않는다** — 대조할 서버가 없어 "맞는 비밀번호"라는 개념
 * 자체가 없다. 비어 있는지까지가 이 화면이 판정할 수 있는 전부다.
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
 * 제출 후 포커스를 옮길 칸 = 화면 순서상 첫 오류 칸. `Object.keys`로 고르지
 * 않는다 — 객체 키 순서는 오류가 **생긴** 순서지 화면에 **놓인** 순서가 아니라서,
 * 그러면 아래쪽 칸으로 먼저 튄다. 순서 배열은 `constants.ts`에 있다.
 */
export function firstInvalidField<K extends string>(
  errors: FieldErrors<K>,
  order: readonly K[],
): K | null {
  return order.find((field) => errors[field] !== undefined) ?? null;
}

/**
 * 한 번 오류가 났던 칸만 타이핑마다 다시 본다. 손대지 않은 칸까지 매 글자마다
 * 검사하면 이메일을 치는 중에 비밀번호 칸이 빨개지고, 반대로 이미 빨간 칸을 그냥
 * 두면 다 고쳐도 빨간 채로 남는다.
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
 * ⚠️ **그리는 자리는 개발 환경으로 감싼다**(`LoginView`) — 앞 회차
 *    `retail-account` F6이 정확히 이 목록을 프로덕션 빌드로 내보냈다.
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

/* ── 회원가입 ─────────────────────────────────────────────────────────── */

/** 연락처 형식. 국번은 2~3자리(02·031·010)까지 받는다 */
const PHONE_SHAPE = /^0\d{1,2}-\d{3,4}-\d{4}$/;
/** 사업자 등록번호 형식. 값이 아니라 **자리수**만 본다 — 실제 대조는 운영자가 한다 */
const BIZ_NO_SHAPE = /^\d{3}-\d{2}-\d{5}$/;

/**
 * 구분자만 하이픈으로 맞춘다. **글자를 지우지 않는다** — 숫자만 남기는 식으로
 * 정리하면 `45.5`가 `455`가 되고, 사용자가 친 값과 칸에 남은 값이 달라진 걸
 * 아무도 모른다. 자릿수가 넘치면 넘친 채로 남고 판정은 검증이 한다.
 */
export function normalizeSeparators(raw: string): string {
  return raw.trim().replace(/[.\s/]+/g, "-");
}

/**
 * 전화번호를 하이픈 형태로 맞춘다. **여기서도 글자를 지우지 않는다.**
 *
 * `normalizeSeparators`만으로는 **구분자가 아예 없는 가장 흔한 입력**
 * (`01012345678`)이 그대로 남아 형식 검사에서 떨어졌다 — 사장은 왜 자기 번호가
 * 거부되는지 모른 채 직접 하이픈을 넣어야 했다(`retail-settings` F4). 숫자만
 * 10~11자리일 때만 손대고 나머지는 **그대로 돌려준다** — 12자리를 억지로 끼워
 * 맞추면 친 글자가 사라진다.
 */
export function normalizePhone(raw: string): string {
  const separated = normalizeSeparators(raw);
  if (!/^\d{10,11}$/.test(separated)) return separated;

  if (separated.length === 11)
    return `${separated.slice(0, 3)}-${separated.slice(3, 7)}-${separated.slice(7)}`;
  if (separated.startsWith("02"))
    return `${separated.slice(0, 2)}-${separated.slice(2, 6)}-${separated.slice(6)}`;
  return `${separated.slice(0, 3)}-${separated.slice(3, 6)}-${separated.slice(6)}`;
}

/**
 * 사업자 등록번호를 `000-00-00000`(3-2-5)로 맞춘다.
 *
 * ⚠️ **`normalizePhone`을 태우면 안 된다.** 둘 다 숫자 10자리인데 자릿수 규칙이
 *    다르다 — 전화번호는 3-3-4라 `1234567890`이 `123-456-7890`이 되고, 그건
 *    **틀린 사업자 등록번호**다. 숫자 10자리라는 것만 같고 규칙이 다르므로
 *    함수를 나눈다. 계좌번호까지 셋을 하나로 합치지 않는 이유도 같다.
 */
export function normalizeBusinessNo(raw: string): string {
  const separated = normalizeSeparators(raw);
  if (!/^\d{10}$/.test(separated)) return separated;

  return `${separated.slice(0, 3)}-${separated.slice(3, 5)}-${separated.slice(5)}`;
}

export interface SignupValues {
  storeName: string;
  ownerName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phone: string;
  /** 선택. 휴대전화번호가 이미 필수라 연락 수단은 확보된다 — 시장 매장은 유선이 없는 곳이 있다 */
  storePhone: string;
  bizNo: string;
  address: string;
  license: AttachedFile | null;
  idCard: AttachedFile | null;
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
  storePhone: "",
  bizNo: "",
  address: "",
  license: null,
  idCard: null,
  agreeService: false,
  agreePrivacy: false,
};

/**
 * 약관 동의도 여기서 같이 본다 — 버튼을 잠그는 대신 누르면 이유를 말하기로 했으니
 * 동의 여부는 다른 칸과 똑같은 검증 대상이다.
 *
 * **사업자 등록번호가 필수인 것이 소매와 다른 규칙이다.** 도매는 서류 2종을 대조해
 * 승인하는 것이 전제라 대조할 번호가 없으면 심사 자체가 성립하지 않는다.
 */
export function validateSignup(values: SignupValues): FieldErrors<SignupField> {
  const errors: FieldErrors<SignupField> = {};

  if (!values.storeName.trim()) errors.storeName = VALIDATION_MESSAGE.storeName;
  if (!values.ownerName.trim()) errors.ownerName = VALIDATION_MESSAGE.ownerName;

  if (!values.email.trim()) errors.email = VALIDATION_MESSAGE.email;
  else if (!EMAIL_SHAPE.test(values.email.trim()))
    errors.email = VALIDATION_MESSAGE.emailShape;

  if (!values.password) errors.password = VALIDATION_MESSAGE.password;
  else if (values.password.length < PASSWORD_MIN_LENGTH)
    errors.password = VALIDATION_MESSAGE.passwordShort;

  if (!values.passwordConfirm)
    errors.passwordConfirm = VALIDATION_MESSAGE.passwordConfirm;
  else if (values.passwordConfirm !== values.password)
    errors.passwordConfirm = VALIDATION_MESSAGE.passwordMismatch;

  if (!values.phone.trim()) errors.phone = VALIDATION_MESSAGE.phone;
  else if (!PHONE_SHAPE.test(normalizePhone(values.phone)))
    errors.phone = VALIDATION_MESSAGE.phoneShape;

  /* 비워 두면 통과한다. 적었는데 형식이 안 맞으면 그때만 말한다 —
     넘친 글자를 몰래 잘라내지 않으므로 여기서 걸린다 */
  if (
    values.storePhone.trim() &&
    !PHONE_SHAPE.test(normalizePhone(values.storePhone))
  )
    errors.storePhone = VALIDATION_MESSAGE.storePhoneShape;

  if (!values.bizNo.trim()) errors.bizNo = VALIDATION_MESSAGE.bizNo;
  else if (!BIZ_NO_SHAPE.test(normalizeBusinessNo(values.bizNo)))
    errors.bizNo = VALIDATION_MESSAGE.bizNoShape;

  if (!values.address.trim()) errors.address = VALIDATION_MESSAGE.address;

  if (!values.license) errors.license = VALIDATION_MESSAGE.license;
  if (!values.idCard) errors.idCard = VALIDATION_MESSAGE.idCard;

  if (!values.agreeService)
    errors.agreeService = VALIDATION_MESSAGE.agreeService;
  if (!values.agreePrivacy)
    errors.agreePrivacy = VALIDATION_MESSAGE.agreePrivacy;

  return errors;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 화면에 실제로 띄울 오류만 남긴다. 전 칸 검증은 매 렌더 돌지만 **이미 한 번 걸린
 * 칸**의 것만 보여 준다 — 손도 안 댄 칸이 타이핑 중에 빨개지는 걸 막으면서 빨개진
 * 칸은 고치는 즉시 풀린다.
 *
 * 오류를 상태로 들지 않는 이유: 값과 오류를 각각 `useState`로 두면 두 칸이 같은
 * 이벤트에서 바뀔 때 나중 것이 앞 것을 덮어쓴다(약관 체크 2개).
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
 * 신청 요약이 보여 줄 한 건.
 *
 * 상호명·사업자 등록번호를 **세션이 들고 있는 계정**에서 갈아 끼운다. 여기서
 * 더미 상수를 읽으면 누가 로그인했든 늘 같은 상호를 말한다(`retail-account` F1).
 * 소매는 세션이 없어 `/approval?store=…`로 주소에 실어 날랐지만, 도매는
 * **주소를 고쳐 남의 상호명을 띄울 통로를 만들지 않는다.**
 *
 * ⚠️ 계정을 **받아야만** 부를 수 있다. 로그아웃 상태에 더미 신청서를 돌려주던
 *    폴백을 지웠다 — 주소만 알면 남의 상호명·사업자 등록번호가 그대로 보이는
 *    통로였다(`wholesale-account` F6). 세션이 없을 때 무엇을 그릴지는 화면이
 *    정한다(`SessionRequired`).
 *
 * 더미 상수는 **빈 줄을 막는 데까지만** 남는다 — 더미 계정으로 로그인만 한
 * 경우 신청 시각이 없고, 그 자리를 비워 두면 요약에 이름 없는 줄이 선다.
 */
export function applicationFor(
  account: Account,
  appliedAt: string | null,
): Application {
  const storeName = normalizeStoreName(account.storeName);
  return {
    storeName: storeName ?? APPLICATION.storeName,
    bizNo: account.bizNo,
    appliedAt: appliedAt ?? APPLICATION.appliedAt,
  };
}

/**
 * 진행 표시 3단. 승인 대기와 거절이 **같은 컴포넌트를 쓰게** 하려고 배열을 여기서
 * 만든다 — 화면 두 곳이 각자 적으면 단계가 늘 때 한쪽만 는다.
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

/**
 * 재신청 검증. **둘 중 하나만 다시 올려도 통과한다** — 거절 사유가 자유 문장이라
 * 어느 서류가 문제인지 코드가 알 수 없고, 두 칸을 다 요구하면 등록증 하나만 고치면
 * 되는 사장에게 신분증을 다시 찍게 만든다.
 *
 * 오류를 `license`에 다는 이유: 포커스가 갈 자리가 하나여야 하고 그게 첫 칸이다.
 */
export function validateReapply(
  documents: Record<DocumentField, AttachedFile | null>,
): FieldErrors<DocumentField> {
  return documents.license || documents.idCard
    ? {}
    : { license: VALIDATION_MESSAGE.reapply };
}

/* ── 정산 계좌 ────────────────────────────────────────────────────────── */

/**
 * 계좌번호에 들어갈 수 있는 글자. **숫자와 `-`뿐이다.**
 *
 * ⚠️ 칸을 `type="number"`로 두지 않는 이유가 여기 있다 — 브라우저가
 *    `45.5`·`-3`·`1e3`을 스스로 받아 주고, 값이 유효하지 않으면 `value`를
 *    **빈 문자열로 준다.** 친 글자가 말없이 사라진다. `type="text"` +
 *    `inputMode="numeric"`으로 받고 판정을 이 한 자리에서 한다.
 */
const ACCOUNT_NO_SHAPE = /^[\d-]+$/;

export interface BankAccountValues {
  bankName: string;
  accountNo: string;
  holder: string;
}

export const EMPTY_BANK_ACCOUNT: BankAccountValues = {
  bankName: "",
  accountNo: "",
  holder: "",
};

/**
 * 계좌 폼 검증. **계좌번호에 아무 보정도 하지 않는다** — Figma `2334:2721`의
 * 저장값이 `110-482-948102`로 구분자를 담고 있고, 반대로 은행마다 자릿수가 달라
 * 규칙 없이 끼워 넣으면 진짜 번호가 망가진다. `normalizePhone`·
 * `normalizeBusinessNo`를 태우지 않는 이유도 같다 — 그 둘은 국가 표준이 있어
 * 보정하지만 계좌번호에는 그런 표준이 없다.
 */
export function validateBankAccount(
  values: BankAccountValues,
): FieldErrors<BankField> {
  const errors: FieldErrors<BankField> = {};

  if (!values.bankName) errors.bankName = BANK_MESSAGE.bankName;

  const accountNo = values.accountNo.trim();
  if (!accountNo) errors.accountNo = BANK_MESSAGE.accountNo;
  else if (!ACCOUNT_NO_SHAPE.test(accountNo))
    errors.accountNo = BANK_MESSAGE.accountNoShape;
  else if (
    accountNo.length < ACCOUNT_NO_MIN ||
    accountNo.length > ACCOUNT_NO_MAX
  )
    errors.accountNo = BANK_MESSAGE.accountNoLength;

  /* 상호명으로 미리 채우지 않는다 — 개인 통장일 수 있고(Figma 더미도 `서울유통`과
     `김서울`이 섞여 있다), 틀린 예금주는 송금 반송으로 이어진다 */
  if (!values.holder.trim()) errors.holder = BANK_MESSAGE.holder;

  return errors;
}

/** 저장할 모양으로 다듬는다. 앞뒤 공백만 뗀다 — 가운데 글자는 손대지 않는다 */
export function toBankAccount(values: BankAccountValues): BankAccount {
  return {
    bankName: values.bankName,
    accountNo: values.accountNo.trim(),
    holder: values.holder.trim(),
  };
}

/**
 * 계정 메뉴가 읽는 한 줄. 소매 `BankAccountRow`와 같은 순서다 — 두 앱이 같은 값을
 * 같은 얼굴로 말해야 사장이 "내가 준 계좌가 이거 맞나"를 눈으로 대조할 수 있다.
 */
export function bankAccountSummary(account: BankAccount): string {
  return `${account.bankName} ${account.accountNo}`;
}
