/** 계정 화면들이 서로를 가리키는 주소. 문자열을 화면마다 다시 적지 않는다 */
export const ACCOUNT_PATH = {
  login: "/login",
  signup: "/signup",
  approval: "/approval",
  rejected: "/approval/rejected",
  /** 최초 로그인 정산 계좌 온보딩 */
  bankOnboarding: "/onboarding/bank-account",
  /** 승인이 끝난 사장이 도착하는 곳. 대시보드는 아직 화면이 없다 */
  erpHome: "/products",
} as const;

/**
 * 세션을 담는 `sessionStorage` 키. **한 개뿐이다.**
 *
 * `localStorage`가 아닌 이유: 시장 사무실의 **공용 단말**을 가정한다. 탭을
 * 닫으면 풀리는 편이 맞다.
 *
 * 소매처럼 모듈 최상위 변수로 들면 **새로 고칠 때마다 로그아웃**된다. 소매는
 * 라우트 가드가 없어서 견뎠지만 도매는 가드를 만들고, ERP는 표를 보다가 새로
 * 고치는 화면이라 그 조합은 앱을 못 쓰게 만든다.
 */
export const SESSION_STORAGE_KEY = "ondo.wholesale.session";

/**
 * 입력칸의 DOM id 접두어.
 *
 * 제출 후 **첫 오류 칸으로 포커스를 옮기려면** 칸을 id로 찾아야 한다. 폼마다
 * ref를 열 몇 개 들고 있는 것보다 규칙 하나가 낫다 — 칸이 늘어도 규칙은 그대로다.
 */
export function fieldId(field: string): string {
  return `account-${field}`;
}

/** 오류 문구의 DOM id. 입력의 `aria-describedby`가 이것을 가리킨다 */
export function errorId(field: string): string {
  return `account-${field}-error`;
}

/**
 * 칸 이름표의 DOM id. 입력의 `aria-labelledby`가 이것을 가리킨다.
 *
 * 첨부칸처럼 **클릭 대상이 따로 있는 칸**에 쓴다 — 점선 상자가 이미
 * `<label for>`라서, 바깥 이름표까지 `<label for>`이면 두 글이 이어 붙어
 * 한 칸의 이름으로 읽힌다.
 */
export function labelId(field: string): string {
  return `account-${field}-label`;
}

/**
 * `FormField`의 라벨을 확정 와이어프레임 `.field > label`에 맞춘다.
 *
 * `packages/ui`가 `text-sm`(14px·400)으로 박아 둔 값을 호출부에서 덮는다 —
 * 원본은 13px(`--text-body`)·500이다. **직계 자식 라벨만** 고른다: `[&_label]`로
 * 잡으면 첨부칸 점선 상자(그 자체가 `<label>`이다)까지 같이 바뀐다.
 */
export const FIELD_LABEL_CLASS =
  "[&>div>label]:text-body [&>div>label]:font-medium";

/**
 * 오류 난 칸의 테두리.
 *
 * `packages/ui` `Input`에는 `aria-invalid` 스타일이 없어서, 첨부칸만 빨개지고
 * 글자 칸은 정상 칸과 같은 회색으로 남는다. 한 폼 안에서 오류를 찾는 단서가
 * 갈리지 않게 호출부에서 건다. **값까지 본다** — `aria-invalid="false"`도 붙는
 * 자리라 `aria-invalid:`(속성 유무)로 잡으면 정상 칸이 전부 빨개진다.
 */
export const INVALID_INPUT_CLASS = "aria-[invalid=true]:border-destructive";

/**
 * 눌리는 것에 붙이는 포커스 표시.
 *
 * `packages/ui`의 `Button`·`Input`은 포커스 링이 주석으로 꺼져 있고 그 파일은
 * 읽기 전용이다. 대신 **`outline-hidden`을 걸지 않고** 우리 링을 얹는다 —
 * 브라우저 기본 링을 지운 채 아무것도 안 그리는 것이 앞 회차 결함이었다.
 */
export const FOCUS_RING_CLASS =
  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";

/** 제출할 때 오류를 훑는 순서 = 화면에 놓인 순서. 첫 오류 칸이 곧 맨 위 오류다 */
export const LOGIN_FIELD_ORDER = ["email", "password"] as const;

/**
 * 로그인 실패 한 줄.
 *
 * 어느 칸이 틀렸는지 말하지 않는다 — "이 이메일은 없어요"라고 하면 어떤 이메일이
 * 가입돼 있는지 밖에서 확인할 수 있다(계정 존재 여부 누출).
 */
export const LOGIN_FAILED_MESSAGE =
  "이메일 또는 비밀번호를 다시 확인해 주세요.";

/** 상태 한글 이름. 배지·안내 문구가 같은 말을 쓰게 한다 */
export const ACCOUNT_STATUS_LABEL = {
  APPROVED: "승인 완료",
  PENDING: "심사 중",
  REJECTED: "승인 거절",
} as const;

/** 비밀번호 최소 길이. 문구와 검사가 같은 값을 보게 한다 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * 검증 문구 한 벌. **여러 화면이 같은 문자열을 본다.**
 *
 * 화면마다 문구를 적으면 같은 규칙(8자 이상·확인 일치·연락처 형식)이 화면마다
 * 다른 말로 나온다. 문구는 전부 **요청형**이다 — 아직 하지 않은 일을 했다고
 * 말하지 않는다(`8자로 맞췄어요` ✕ / `8자 이상으로 입력해 주세요` ○).
 */
export const VALIDATION_MESSAGE = {
  email: "이메일을 입력해 주세요.",
  emailShape: "이메일 형식으로 입력해 주세요. 예: wholesale@example.com",
  password: "비밀번호를 입력해 주세요.",
  passwordShort: `비밀번호를 ${PASSWORD_MIN_LENGTH}자 이상으로 입력해 주세요.`,
  storeName: "상호명을 입력해 주세요.",
  ownerName: "대표자 이름을 입력해 주세요.",
  passwordConfirm: "비밀번호를 한 번 더 입력해 주세요.",
  passwordMismatch: "위에 입력한 비밀번호와 같게 입력해 주세요.",
  phone: "휴대전화번호를 입력해 주세요.",
  phoneShape: "휴대전화번호를 010-0000-0000 형식으로 입력해 주세요.",
  storePhoneShape: "매장 대표 전화번호를 02-000-0000 형식으로 입력해 주세요.",
  bizNo: "사업자 등록번호를 입력해 주세요.",
  bizNoShape:
    "사업자 등록번호를 000-00-00000 형식(숫자 10자리)으로 입력해 주세요.",
  address: "사업장 주소를 입력해 주세요.",
  license: "사업자 등록증 파일을 첨부해 주세요.",
  idCard: "대표자 신분증 파일을 첨부해 주세요.",
  agreeService: "이용약관을 확인하고 동의해 주세요.",
  agreePrivacy: "개인정보 수집·이용에 동의해 주세요.",
  reapply: "다시 올릴 서류를 한 가지 이상 첨부해 주세요.",
} as const;

/**
 * 흉내라는 사실을 감추지 않는 한 줄.
 *
 * 세션이 `sessionStorage`라 탭을 닫으면 풀린다. 계정 메뉴(로그아웃이 있는 자리)에
 * 둔다 — 사장이 "왜 로그아웃됐지"를 묻는 자리가 거기다.
 */
export const SESSION_DISCLAIMER = "서버가 없어요 — 탭을 닫으면 로그아웃돼요";

/* ── 회원가입 ─────────────────────────────────────────────────────────── */

/**
 * 제출할 때 오류를 훑는 순서 = **화면에 놓인 순서.**
 *
 * 첫 오류 칸이 곧 맨 위 오류다. 객체 키 순서로 고르면 오류가 생긴 순서를 따라가
 * 아래쪽 칸으로 먼저 튄다.
 */
export const SIGNUP_FIELD_ORDER = [
  "storeName",
  "ownerName",
  "email",
  "password",
  "passwordConfirm",
  "phone",
  "storePhone",
  "bizNo",
  "address",
  "license",
  "idCard",
  "agreeService",
  "agreePrivacy",
] as const;

/**
 * 길이 상한. **입력 단계에서 `maxLength`로 막는다.**
 *
 * 저장할 때 조용히 자르면 폼에는 친 글자가, 저장값과 계정 메뉴에는 잘린 글자가
 * 남아 **같은 세션에 두 값이 산다**(`retail-settings` F3). 막는 자리를 하나로
 * 두고, 상한에 닿으면 칸 아래에서 그 사실을 말한다.
 */
export const MAX_LENGTH = {
  /** 신청 요약 한 줄이 카드 폭을 넘지 않는 길이 */
  storeName: 40,
  ownerName: 20,
  email: 100,
  /** `010-0000-0000` 13자 + 여유 */
  phone: 20,
  /** `000-00-00000` 12자 + 여유 */
  bizNo: 20,
  /** `청평화패션몰 2층 24호` 같은 한 줄 주소 */
  address: 100,
} as const;

/** 상한에 닿았을 때의 회색 한 줄. 오류가 아니라 사실 통지다 */
export function maxLengthNote(max: number): string {
  return `${max}자까지 넣을 수 있어요. 넘는 글자는 애초에 들어가지 않아요.`;
}

/** 첨부 허용 형식 안내. `accept` 속성과 화면 문구가 같은 곳에서 나온다 */
export const FILE_ACCEPT = ".jpg,.jpeg,.png,.pdf";
export const FILE_ACCEPT_LABEL = "JPG · PNG · PDF";

/**
 * 서류 2종의 이름. **도매만 2종이다**(소매는 등록증 1종).
 *
 * 승인 대기 요약의 `제출 서류` 줄과 거절 화면의 재첨부 칸 이름이 같은 문자열을
 * 본다 — 무엇을 냈는지와 무엇을 다시 내는지가 갈리면 사장이 서류를 잘못 낸다.
 */
export const DOCUMENT_LABEL = {
  license: "사업자 등록증",
  idCard: "대표자 신분증",
} as const;

/** 민감정보 마스킹 안내. 두 첨부칸이 같은 말을 쓴다 — 실제로 같은 거절 사유가 된다 */
export const MASKING_HELP =
  "주민등록번호 뒷자리 등 민감정보는 가려서 올려주세요 — 가리지 않으면 승인이 거절될 수 있어요.";

/**
 * 구분자를 손본 사실을 알리는 한 줄.
 *
 * "손봤고"인 이유: `010.1234.5678`처럼 바꾸기만 하는 경우와 `01012345678`처럼
 * 없던 하이픈을 넣는 경우가 둘 다 이 문구를 쓴다(`retail-settings` F4).
 * 어느 쪽이든 **지운 글자는 없다**는 것이 이 줄이 보장하는 내용이다.
 */
export function separatorNote(normalized: string): string {
  return `입력하신 값을 ${normalized} 로 맞췄어요. 구분자만 손봤고 지운 글자는 없어요.`;
}

/* ── 가입 심사 진행 ───────────────────────────────────────────────────── */

/**
 * 진행 표시 3단계의 이름.
 *
 * 마지막 칸만 결과에 따라 갈린다 — 심사 중이면 `승인 완료`(아직 안 온 단계),
 * 거절이면 `거절`(여기서 멈춘 자리). 앞 두 칸은 어느 쪽이든 같다.
 */
export const APPROVAL_STEP_LABELS = {
  applied: "신청 완료",
  reviewing: "심사 중",
  approved: "승인 완료",
  rejected: "거절",
} as const;

/** 진행 표시가 화면 낭독기에 읽히는 말. 색·굵기 말고 글자로도 상태가 전달돼야 한다 */
export const APPROVAL_STEP_STATE_LABEL = {
  done: "지난 단계",
  current: "지금 단계",
  todo: "다음 단계",
} as const;
