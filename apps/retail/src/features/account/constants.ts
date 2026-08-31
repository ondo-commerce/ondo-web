/** 계정 화면들이 서로를 가리키는 주소. 문자열을 화면마다 다시 적지 않는다 */
export const ACCOUNT_PATH = {
  login: "/login",
  signup: "/signup",
  approval: "/approval",
  rejected: "/approval/rejected",
  /** 승인이 끝난 사장이 도착하는 곳 = 마켓 홈 */
  market: "/",
} as const;

/**
 * 입력칸의 DOM id 접두어.
 *
 * 제출 후 **첫 오류 칸으로 포커스를 옮기려면** 칸을 id로 찾아야 한다. 폼마다
 * ref를 8개 들고 있는 것보다 규칙 하나가 낫다 — 칸이 늘어도 규칙은 그대로다.
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

/** 상호명을 실어 나르는 조회 문자열의 이름. 읽는 쪽과 쓰는 쪽이 같은 값을 본다 */
export const STORE_QUERY = "store";

/**
 * 상호명을 주소에 실어 나른다.
 *
 * 세션도 쿠키도 없어서(백엔드 없음) 로그인·가입 화면이 알아낸 상호명을 승인
 * 화면에 전달할 길이 주소밖에 없다. 상수를 화면에 박아 두면 방금 신청한
 * 사장이 남의 상호를 본다.
 */
export function withStoreName(path: string, storeName: string | null): string {
  return storeName
    ? `${path}?${STORE_QUERY}=${encodeURIComponent(storeName)}`
    : path;
}

/**
 * `FormField`의 라벨을 확정 와이어프레임 `.field > label`에 맞춘다.
 *
 * `packages/ui`가 `text-sm`(14px·400)으로 박아 둔 값을 호출부에서 덮는다 —
 * 원본은 13px(`--text-body`)·500이다. 직계 자식 라벨만 고른다: `[&_label]`로
 * 잡으면 첨부칸 점선 상자(`<label>`)까지 같이 바뀐다.
 */
export const FIELD_LABEL_CLASS =
  "[&>div>label]:text-body [&>div>label]:font-medium";

/**
 * 오류 난 칸의 테두리.
 *
 * `packages/ui` `Input`에는 `aria-invalid` 스타일이 없어서, 첨부칸만 빨개지고
 * 글자 칸은 정상 칸과 같은 회색으로 남는다. 한 폼 안에서 오류를 찾는 단서가
 * 갈리지 않게 호출부에서 건다. `aria-invalid="false"`도 붙는 자리라
 * 값까지 본다(`aria-invalid:`는 속성이 있기만 하면 걸린다).
 */
export const INVALID_INPUT_CLASS = "aria-[invalid=true]:border-destructive";

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

/**
 * 회원가입 오류를 훑는 순서 = 화면에 놓인 순서.
 *
 * 사업자등록번호가 첨부 앞에 오는 건 화면 순서 그대로다 — 이 칸만 필수가
 * 아니지만, 형식이 틀리면 여기서도 오류가 난다.
 */
export const SIGNUP_FIELD_ORDER = [
  "storeName",
  "ownerName",
  "email",
  "password",
  "passwordConfirm",
  "phone",
  "bizNo",
  "license",
  "agreeService",
  "agreePrivacy",
] as const;

/** 비밀번호 최소 길이. 문구와 검사가 같은 값을 보게 한다 */
export const PASSWORD_MIN_LENGTH = 8;

/** 첨부 허용 형식 안내. `accept` 속성과 화면 문구가 같은 곳에서 나온다 */
export const LICENSE_ACCEPT = ".jpg,.jpeg,.png,.pdf";
export const LICENSE_ACCEPT_LABEL = "JPG · PNG · PDF";

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
