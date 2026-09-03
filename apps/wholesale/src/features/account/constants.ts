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
} as const;

/**
 * 흉내라는 사실을 감추지 않는 한 줄.
 *
 * 세션이 `sessionStorage`라 탭을 닫으면 풀린다. 계정 메뉴(로그아웃이 있는 자리)에
 * 둔다 — 사장이 "왜 로그아웃됐지"를 묻는 자리가 거기다.
 */
export const SESSION_DISCLAIMER = "서버가 없어요 — 탭을 닫으면 로그아웃돼요";
