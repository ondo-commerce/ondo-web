/** 계정 화면들이 서로를 가리키는 주소. 문자열을 화면마다 다시 적지 않는다 */
export const ACCOUNT_PATH = {
  login: "/login",
  signup: "/signup",
  approval: "/approval",
  rejected: "/approval/rejected",
  /** 정산 계좌를 실제로 등록·수정하는 곳(정산 탭). 옛 온보딩 주소도 여기로 보낸다 */
  settlements: "/settlements",
  /** 승인이 끝난 사장이 도착하는 곳. 확정을 기다리는 주문을 먼저 보게 한다 */
  erpHome: "/dashboard",
} as const;

/**
 * 세션을 담는 `sessionStorage` 키. `localStorage`가 아닌 이유: 시장 사무실의
 * **공용 단말**을 가정한다 — 탭을 닫으면 풀리는 편이 맞다. 모듈 변수를 쓰지 않는
 * 이유는 `store.ts` 머리말에 있다.
 */
export const SESSION_STORAGE_KEY = "ondo.wholesale.session";

/**
 * 입력칸의 DOM id 접두어. 제출 후 **첫 오류 칸으로 포커스를 옮기려면** 칸을 id로
 * 찾아야 하는데, 폼마다 ref를 열 몇 개 드는 것보다 규칙 하나가 낫다.
 */
export function fieldId(field: string): string {
  return `account-${field}`;
}

export function errorId(field: string): string {
  return `account-${field}-error`;
}

/**
 * 첨부칸처럼 **클릭 대상이 따로 있는 칸**의 이름표 id. 점선 상자가 이미
 * `<label for>`라서, 바깥 이름표까지 `<label for>`이면 두 글이 이어 붙어 한 칸의
 * 이름으로 읽힌다 — 그쪽은 `aria-labelledby`로 가리킨다.
 */
export function labelId(field: string): string {
  return `account-${field}-label`;
}

/**
 * `FormField` 라벨을 확정 와이어프레임 `.field > label`(13px·500)에 맞춘다 —
 * `packages/ui` 기본값은 `text-sm`·400이다. **직계 자식 라벨만** 고른다:
 * `[&_label]`로 잡으면 첨부칸 점선 상자(그 자체가 `<label>`이다)까지 바뀐다.
 */
export const FIELD_LABEL_CLASS =
  "[&>div>label]:text-body [&>div>label]:font-medium";

/**
 * 오류 난 칸의 테두리. `packages/ui`에 `aria-invalid` 스타일이 없어 호출부에서
 * 건다. **값까지 본다** — `aria-invalid="false"`도 붙는 자리라 속성 유무로 잡으면
 * 정상 칸이 전부 빨개진다.
 *
 * ⚠️ **폼 안의 모든 칸이 빠짐없이 이걸 쓴다**(`Input`·`Select`·`FileField`·
 *    `Checkbox`). 처음에는 체크 상자 2개만 빠져서, 12칸이 다 틀렸는데 10칸만
 *    빨개지고 회색으로 남은 두 칸이 통과한 칸으로 읽혔다(`wholesale-account` F4).
 */
export const INVALID_INPUT_CLASS = "aria-[invalid=true]:border-destructive";

/**
 * 눌리는 것에 붙이는 포커스 표시. `packages/ui`의 `Button`·`Input`은 포커스 링이
 * 꺼져 있고 그 파일은 읽기 전용이다. **`outline-hidden`을 걸지 않고** 얹는다 —
 * 기본 링을 지운 채 아무것도 안 그리는 것이 앞 회차 결함이었다.
 */
export const FOCUS_RING_CLASS =
  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";

/** 오류를 훑는 순서 = 화면에 놓인 순서. 이유는 `derive.firstInvalidField` */
export const LOGIN_FIELD_ORDER = ["email", "password"] as const;

/**
 * 로그인 실패 한 줄. 어느 칸이 틀렸는지 말하지 않는다 — "이 이메일은 없어요"는
 * 어떤 이메일이 가입돼 있는지 밖에서 확인시켜 준다(계정 존재 여부 누출).
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
 * 실행 뒤 **도착 화면이 낭독기에 말하는 한 줄**(`arrival.ts`). "무슨 일이 일어났고
 * 지금 어디인가"를 둘 다 말한다 — 실행 버튼이 라우트와 함께 사라지기 때문이다.
 */
export const ARRIVAL_MESSAGE = {
  signedIn: "로그인했어요.",
} as const;

/**
 * 세션이 없을 때 실행을 **막고 이유를 말하는** 화면의 문구.
 *
 * `sessionStorage`는 탭 단위라 안내 메일 링크를 새 탭에서 열면 그 탭은 로그아웃
 * 상태다. 예전에는 그 상태에서도 폼이 열려 칸을 다 채우고 버튼까지 눌렸는데
 * **아무것도 저장되지 않고** 다음 화면으로 넘어갔다 — 재신청은 심사 중 화면까지
 * 떠서 거짓 성공이었다(`wholesale-account` F2·F3).
 */
export const SESSION_REQUIRED_TITLE = "로그인이 필요해요";

/**
 * 판정 전·이동 중에 **낭독기에만** 남기는 말. 둘 다 곧 사라질 한 프레임이라
 * 글자는 그리지 않지만, 화면이 조용히 바뀌면 낭독기 사용자는 아무 일도 일어나지
 * 않은 것으로 듣는다.
 */
export const SESSION_CHECKING_MESSAGE = "로그인 상태를 확인하고 있어요";
export const SESSION_MOVING_MESSAGE = "지금 상태에 맞는 화면으로 옮기고 있어요";

export const SESSION_REQUIRED_LEAD = {
  approval:
    "심사 현황은 로그인한 계정의 신청서만 보여드려요. 로그인하면 방금 낸 신청서가 열려요.",
  rejected:
    "거절 사유는 로그인해야 열려요. 메일 링크를 새 탭에서 열면 로그인이 풀려 있어요.",
} as const;

/** 상태 한글 이름. 배지·안내 문구가 같은 말을 쓰게 한다 */
export const ACCOUNT_STATUS_LABEL = {
  APPROVED: "승인 완료",
  PENDING: "심사 중",
  REJECTED: "승인 거절",
} as const;

/** 비밀번호 최소 길이. 문구와 검사가 같은 값을 보게 한다 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * 검증 문구 한 벌. 화면마다 적으면 같은 규칙이 화면마다 다른 말로 나온다. 문구는
 * 전부 **요청형**이다 — 아직 하지 않은 일을 했다고 말하지 않는다
 * (`8자로 맞췄어요` ✕ / `8자 이상으로 입력해 주세요` ○).
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
 * BE가 **로컬 서버**에 심는 개발 계정(`LocalDevAccountSeeder`, `@Profile("local")`).
 * 이제 진짜 인증이라 비밀번호도 맞아야 한다.
 *
 * ⚠️ dev 서버(`api-dev.ddmondo.co.kr`)에는 이 계정이 없다 — 거기 쓸 계정은 BE에
 * 따로 받는다. 승인 대기·거절 계정은 시드에 없어서 그 화면들은 실서버로 확인할 수 없다.
 */
/* MUL-103 V901 시드(2026-09-07). 셋 다 APPROVED고 계정마다 상품·주문이 다르다.
   옛 dev@ondo.test(PENDING)는 더 안 쓴다 */
export const DEV_SEED_ACCOUNT =
  "moodon · raon · cottonclub@ondo.test / ondo1234!";

/* ── 회원가입 ─────────────────────────────────────────────────────────── */

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
 * 길이 상한. **입력 단계에서 `maxLength`로 막는다.** 저장할 때 조용히 자르면
 * 폼에는 친 글자가, 저장값과 계정 메뉴에는 잘린 글자가 남아 **같은 세션에 두 값이
 * 산다**(`retail-settings` F3). 상한에 닿으면 칸 아래에서 그 사실을 말한다.
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
 * 서류 2종의 이름(소매는 등록증 1종). 승인 대기 요약의 `제출 서류` 줄과 거절
 * 화면의 재첨부 칸이 같은 문자열을 본다 — 무엇을 냈는지와 무엇을 다시 내는지가
 * 갈리면 사장이 서류를 잘못 낸다.
 */
export const DOCUMENT_LABEL = {
  license: "사업자 등록증",
  idCard: "대표자 신분증",
} as const;

/** 민감정보 마스킹 안내. 두 첨부칸이 같은 말을 쓴다 — 실제로 같은 거절 사유가 된다 */
export const MASKING_HELP =
  "주민등록번호 뒷자리 등 민감정보는 가려서 올려주세요 — 가리지 않으면 승인이 거절될 수 있어요.";

/**
 * 구분자를 손본 사실을 알리는 한 줄. 바꾸기만 하는 경우(`010.1234.5678`)와 없던
 * 하이픈을 넣는 경우(`01012345678`)가 둘 다 이 문구를 쓴다(`retail-settings` F4)
 * — 어느 쪽이든 **지운 글자는 없다**는 것이 이 줄의 보장이다.
 */
export function separatorNote(normalized: string): string {
  return `입력하신 값을 ${normalized} 로 맞췄어요. 구분자만 손봤고 지운 글자는 없어요.`;
}

/* ── 가입 심사 진행 ───────────────────────────────────────────────────── */

/**
 * 진행 표시 3단계의 이름. 마지막 칸만 결과에 따라 갈린다 — 심사 중이면
 * `승인 완료`(아직 안 온 단계), 거절이면 `거절`(여기서 멈춘 자리).
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

/* ── 정산 계좌 ────────────────────────────────────────────────────────── */

/**
 * 계정 메뉴의 계좌 항목. 계좌는 정산 탭의 「내 정산 계좌」(`/bank-accounts` 실서버)
 * 한 곳에서만 다룬다 — 예전 온보딩 화면은 브라우저 세션에만 적고 서버에는 아무것도
 * 보내지 않아서, 등록했다고 말한 계좌가 소매 화면에는 없었다(`side-02` N3).
 */
export const BANK_MENU_LABEL = "정산 계좌 관리";

/* ── 운영 문의 ────────────────────────────────────────────────────────── */

/**
 * "준비 중" 대신 서는 문의 한 줄. 비밀번호 찾기, 승인 대기·거절의 문의하기,
 * 가입 꼬리말이 **전부 이 상수 하나**를 본다 — 연락처가 바뀌면 여기만 고친다.
 * 막다른 안내("준비 중이에요")는 눌러 본 사람이 다음에 할 일을 주지 않는다.
 *
 * TODO(#276): 운영 문의 이메일을 받으면 이 값만 그 주소가 든 문장으로 바꾼다.
 */
export const CONTACT_LINE = "담당자에게 문의해 주세요";

/**
 * 가입·재신청 폼 위 안내. 제출 버튼을 잠그는 **이유**가 이 한 줄이다 — 잠긴 버튼은
 * 스스로 왜 못 누르는지 말하지 않는다. 서류를 올릴 도매 업로드 API가 없어 신청을
 * 서버에 보낼 길이 없고, 예전처럼 브라우저 세션에만 적고 "심사 중"을 띄우면 거짓
 * 성공이다(`side-02` N3, D32 Q1-A).
 */
export const SIGNUP_CLOSED_NOTICE =
  "지금은 온라인 가입을 받지 않아요. 체험은 안내받은 테스트 계정으로 해 주세요";

/**
 * 위 안내의 DOM id. 폼과 잠긴 제출 버튼이 `aria-describedby`로 이 줄을 가리킨다 —
 * 화면 낭독기로 버튼에 닿았을 때 "흐리게 표시됨"만 듣고 이유를 못 듣는 일을 막는다
 * (`03-review` F2). 가입과 재신청은 다른 화면이라 한 화면에 한 번만 선다.
 */
export const SIGNUP_CLOSED_NOTICE_ID = "account-signup-closed";
