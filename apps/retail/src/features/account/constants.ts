import type {
  SignupField,
  SignUpRequest,
  SignUpRequestField,
  Terms,
  TermsKind,
} from "./types";

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

/**
 * 자격증명 문제가 **아닌** 실패. 서버가 안 떠 있거나, 닿았는데 500이 온 경우다.
 * 로그인 실패와 갈라 쓰는 이유: 비밀번호를 다시 치게 만들어도 해결되지 않는다.
 */
export const SERVER_UNREACHABLE_MESSAGE =
  "지금 서버에 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요.";

/**
 * BE가 dev·로컬 DB에 심어 둔 개발 계정(`V2__seed_dev.sql`). 비밀번호는 그 파일에.
 * 진짜 인증이라 비밀번호도 맞아야 한다.
 */
export const DEV_SEED_ACCOUNT =
  "bombom@ondo.test (승인 완료) · pending@ondo.test (심사 중)";

/**
 * 이메일이 이미 있을 때 칸 아래 붙는 말. blur 확인(`/email-availability`)과
 * 제출 409(`DUPLICATE_EMAIL`)가 **같은 문구**를 쓴다 — 같은 사실을 두 말로 하지 않는다.
 */
export const EMAIL_TAKEN_MESSAGE =
  "이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써 주세요.";

/**
 * 재신청(등록증 다시 올리기) 접수 API가 스냅샷에 없다. 파일까지 골라 눌렀는데
 * 아무 일도 없으면 안 되므로, 못 보내는 이유를 화면이 글자로 말한다.
 */
export const REAPPLY_UNAVAILABLE_MESSAGE =
  "재신청 접수는 아직 준비 중이에요. 고른 파일은 보내지지 않았어요 — 운영자에게 문의해 주세요.";

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

/**
 * 서버 `SignUpRequest`의 속성 이름 전부. `VALIDATION_FAILED`의 `errors[].field`가
 * 이 이름으로 오고, 여기 없는 이름은 폼 위 한 줄(`_form`)로 간다.
 */
export const SIGNUP_REQUEST_FIELDS = [
  "shopName",
  "ownerName",
  "email",
  "password",
  "mobile",
  "bizRegNo",
  "agreedTerms",
] as const satisfies readonly SignUpRequestField[];

/**
 * 서버 필드명 → 폼 칸 이름. 이름이 같은 칸(`email`·`password`·`ownerName`)도
 * 빠짐없이 적는다 — 표가 곧 "서버의 어느 칸이 화면의 어느 칸인가"의 원본이다.
 *
 * `agreedTerms`는 약관 둘을 한 배열로 받는 칸이라 체크 하나를 고를 수 없다.
 * 첫 체크(이용약관)에 붙인다 — 화면 순서상 먼저 눈에 띄는 자리다.
 */
export const SIGNUP_FIELD_OF_REQUEST: Record<SignUpRequestField, SignupField> =
  {
    shopName: "storeName",
    ownerName: "ownerName",
    email: "email",
    password: "password",
    mobile: "phone",
    bizRegNo: "bizNo",
    agreedTerms: "agreeService",
  };

/** 약관 체크 → 서버 enum. 둘 다 필수라 제출 시 체크된 것만 골라 보낸다 */
export const TERMS_CODE: Record<
  TermsKind,
  SignUpRequest["agreedTerms"][number]
> = { service: "SERVICE", privacy: "PRIVACY" };

/**
 * 약관 2종 전문. **서버 값이 아니다** — 스냅샷에 약관 API가 없고, 법무 검토를
 * 받은 문안도 아직 없다(실제 문안 미확인). 자리를 잡아 두는 상수라 `fixtures`가
 * 아니라 여기 산다. 이름은 가입 체크박스와 설정 동의 내역이 같이 읽는다.
 *
 * 별도 화면(`/terms`)을 파지 않고 모달로 띄운다 — 가입 도중에 주소가 바뀌면
 * 지금까지 채운 칸이 전부 날아간다(`01-pm.md` Q4).
 */
export const SIGNUP_TERMS: Record<TermsKind, Terms> = {
  service: {
    label: "이용약관 동의",
    body: [
      "제1조 (목적) 이 약관은 온도 마켓(이하 “서비스”)이 제공하는 도매·소매 직거래 중개 서비스의 이용 조건과 절차를 정합니다.",
      "제2조 (회원 자격) 서비스는 사업자 등록을 마친 소매 사업자에게만 제공됩니다. 운영자는 제출된 사업자등록증을 확인해 가입을 승인하거나 거절할 수 있습니다.",
      "제3조 (가격 정보) 도매 가격은 승인된 사업자 회원에게만 공개됩니다. 회원은 취득한 가격 정보를 일반 소비자에게 재배포할 수 없습니다.",
      "제4조 (주문과 결제) 서비스는 주문을 중개할 뿐 결제를 대행하지 않습니다. 대금은 현금 또는 계좌 이체로 도매처에 직접 지급합니다.",
      "제5조 (이용 제한) 허위 서류를 제출하거나 타인의 사업자 정보를 도용한 경우 승인은 취소되며 재가입이 제한될 수 있습니다.",
    ],
  },
  privacy: {
    label: "개인정보 수집·이용 동의",
    body: [
      "1. 수집 항목 — 상호명, 대표자명, 이메일, 연락처, 사업자등록번호, 사업자등록증 사본.",
      "2. 이용 목적 — 사업자 자격 확인(가입 심사), 주문·미송·정산 안내, 분쟁 발생 시 사실 확인.",
      "3. 보유 기간 — 회원 탈퇴 시까지. 다만 관계 법령이 정한 거래 기록은 그 기간 동안 보관합니다.",
      "4. 안전 조치 — 대표자명·연락처·사업자등록번호·등록증 사본은 암호화해 별도 보관하며, 심사 담당자 외에는 열람할 수 없습니다.",
      "5. 동의 거부 권리 — 동의를 거부할 수 있으나, 사업자 자격을 확인할 수 없어 가입이 제한됩니다.",
    ],
  },
};

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

/**
 * 검증 문구 한 벌. 회원가입과 설정이 **같은 문자열**을 본다.
 *
 * 두 화면이 각자 문구를 적으면 같은 규칙(8자 이상·확인 일치·연락처 형식)이
 * 화면마다 다른 말로 나온다. 문구는 전부 **요청형**이다 — 아직 하지 않은 일을
 * 했다고 말하지 않는다(`8자로 맞췄어요` ✕ / `8자 이상으로 입력해 주세요` ○).
 */
export const VALIDATION_MESSAGE = {
  storeName: "상호명을 입력해 주세요.",
  ownerName: "대표자명을 입력해 주세요.",
  email: "이메일을 입력해 주세요.",
  emailShape: "이메일 형식으로 입력해 주세요. 예: store@example.com",
  password: "비밀번호를 입력해 주세요.",
  passwordShort: `비밀번호를 ${PASSWORD_MIN_LENGTH}자 이상으로 입력해 주세요.`,
  passwordConfirm: "비밀번호를 한 번 더 입력해 주세요.",
  passwordMismatch: "위에 입력한 비밀번호와 같게 입력해 주세요.",
  phone: "연락처를 입력해 주세요.",
  phoneShape: "연락처를 010-0000-0000 형식으로 입력해 주세요.",
  bizNoShape:
    "사업자등록번호를 000-00-00000 형식(숫자 10자리)으로 입력해 주세요.",
  license: "사업자등록증 파일을 첨부해 주세요.",
  agreeService: "이용약관을 확인하고 동의해 주세요.",
  agreePrivacy: "개인정보 수집·이용에 동의해 주세요.",
} as const;

/**
 * 구분자를 손본 사실을 알리는 한 줄. **회원가입과 설정이 같은 말을 쓴다.**
 *
 * "손봤고"인 이유: `010.1234.5678`처럼 바꾸기만 하는 경우와 `01012345678`처럼
 * 없던 하이픈을 넣는 경우가 둘 다 이 문구를 쓴다(retail-settings F4).
 * 어느 쪽이든 **지운 글자는 없다**는 것이 이 줄이 보장하는 내용이다.
 */
export function separatorNote(normalized: string): string {
  return `입력하신 값을 ${normalized} 로 맞췄어요. 구분자만 손봤고 지운 글자는 없어요.`;
}

/* ── 설정 ─────────────────────────────────────────────────────────────── */

/**
 * 설정은 패널마다 `저장`이 따로다 — 검증 대상도 그 패널의 칸뿐이다.
 *
 * 화면 전체를 한 번에 보면 `가게 정보`의 저장이 아직 손도 안 댄 계정 칸 때문에
 * 막히고, 포커스가 다른 패널로 튄다. 순서는 각 패널에 놓인 순서 그대로다.
 */
export const STORE_PANEL_FIELDS = ["storeName"] as const;
export const ACCOUNT_PANEL_FIELDS = ["ownerName", "phone"] as const;

/** 비밀번호 변경 다이얼로그에서 오류를 훑는 순서 = 칸이 놓인 순서 */
export const PASSWORD_FIELD_ORDER = [
  "currentPassword",
  "newPassword",
  "newPasswordConfirm",
] as const;

/**
 * 비밀번호 자리의 가림 문자. 확정 와이어프레임의 `••••••••` 그대로다.
 *
 * 실제 비밀번호 길이를 흉내 내지 않는다 — 계정 더미에 비밀번호가 없고(`types.ts`),
 * 길이를 보이면 그 자체가 정보다.
 */
export const PASSWORD_MASK = "••••••••";

/**
 * 잠긴 값 상자(`.f.lock`) — 회색 면 + **gray-600** 글자.
 *
 * `muted-foreground`(gray-500)를 쓰지 않는 이유: 회색 면(gray-100) 위에서
 * 4.39:1로 AA(4.5:1)에 못 미친다. 확정 와이어프레임 `_base.css` 468~471행이
 * "회색 면에 앉는 자리만 한 단계 내린다"로 이미 보정해 둔 조합이다.
 */
export const LOCKED_VALUE_CLASS =
  "bg-secondary text-secondary-foreground border-input flex h-9 items-center gap-2 rounded-control border px-3 text-sm";

/**
 * 눌리는 것에 붙이는 포커스 표시.
 *
 * `packages/ui`의 `Button`·`Input`은 포커스 링이 주석으로 꺼져 있고 그 파일은
 * 읽기 전용이다. 대신 **`outline-hidden`을 걸지 않고** 우리 링을 얹는다 —
 * 브라우저 기본 링을 지운 채 아무것도 안 그리는 것이 직전 회차 결함(F5·F7)이다.
 */
export const FOCUS_RING_CLASS =
  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";
