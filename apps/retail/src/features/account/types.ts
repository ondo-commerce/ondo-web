import type { RetailSchema } from "@ondo/api";

/**
 * 가입 심사 상태. 운영자 승인제(ST-303)의 3값이다.
 *
 * 거래관계(TradeRelation) 승인 층은 여기에 없다 — 도매처별 승인을 계정 화면에
 * 둘지 첫 주문 시점에 둘지가 아직 결정되지 않았다(`01-pm.md` Q1). 결정되면
 * 값이 아니라 단계가 늘어난다.
 */
export type AccountStatus = "APPROVED" | "PENDING" | "REJECTED";

/* ── wire (스냅샷 생성 타입 별칭 · ADR-0002) ───────────────────────────── */

/** `POST /auth/sign-up`의 `payload` 파트. 파일은 `bizLicense` 파트로 따로 간다 */
export type SignUpRequest = RetailSchema<"SignUpRequest">;
/** 가입 완료 응답. 세션이 없다 — 이 값으로는 아무 화면도 못 연다 */
export type SignUpResponse = RetailSchema<"SignUpResponse">;
/** `GET /auth/email-availability` 응답 */
export type EmailAvailabilityResponse =
  RetailSchema<"EmailAvailabilityResponse">;
/** `/me`의 거절 사유. REJECTED일 때만 실린다 */
export type Rejection = RetailSchema<"Rejection">;

/**
 * 서버가 `VALIDATION_FAILED`의 `errors[].field`에 적는 이름 = `SignUpRequest`의
 * 속성 이름. 폼 칸 이름(`SignupField`)과 다르다 — `shopName`↔`storeName`,
 * `mobile`↔`phone`, `bizRegNo`↔`bizNo`. 옮기는 표는 `constants.ts`에.
 */
export type SignUpRequestField = keyof SignUpRequest;

/**
 * 설정 화면이 읽는 계정의 뼈대. 로그인·승인 화면은 이제 `/me`(`RetailerResponse`)를
 * 직접 읽으므로 이 타입을 안 쓴다 — 설정만 남았다(설정 API는 스냅샷에 없다).
 *
 * 비밀번호를 담지 않는다. 더미라도 자격증명 형태를 소스에 적어 두면 그대로 굳는다.
 */
export interface Account {
  email: string;
  storeName: string;
  status: AccountStatus;
}

/**
 * 설정 화면이 읽는 확장 정보 — 대표자명·연락처가 더 붙는다.
 *
 * `Account`에 두 필드를 필수로 올리지 않은 이유: 로그인 분기(`ACCOUNTS`)의 심사
 * 중·거절 더미에는 대표자명도 연락처도 없다. 필수로 올리면 그 두 건에 **없는
 * 개인정보를 지어내야** 한다. 설정은 승인 완료 계정 한 건만 보므로 그 한 건만
 * 확장한다. 값은 자리표시자다(`010-0000-0000`) — 실제 형식의 번호를 소스에
 * 적지 않는다는 `fixtures.ts`의 기존 원칙 그대로다.
 */
export interface AccountProfile extends Account {
  ownerName: string;
  phone: string;
}

/** 설정 화면에서 **고칠 수 있는** 칸 이름. 잠긴 칸은 여기 없다 — 검증 대상이 아니다 */
export type SettingsField = "storeName" | "ownerName" | "phone";

/** 비밀번호 변경 다이얼로그의 칸 이름 */
export type PasswordField =
  "currentPassword" | "newPassword" | "newPasswordConfirm";

/** 로그인 폼의 칸 이름. 오류 표시·포커스 이동이 이 이름으로 칸을 찾는다 */
export type LoginField = "email" | "password";

/**
 * 칸 하나당 오류 문구 한 줄.
 *
 * 오류를 배열이 아니라 칸 이름으로 잡는 이유: 문구를 입력칸 아래에 붙이고
 * `aria-describedby`로 묶으려면 "어느 칸의 오류인가"가 자료 구조에 있어야 한다.
 */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/**
 * 첨부한 파일. 화면이 그리는 이름·용량에 더해 **보낼 `File` 자체**를 든다.
 *
 * 가입은 이 파일을 `bizLicense` 파트로 실어 보낸다. 이름·용량만 들고 있던
 * 시절(백엔드 없음)의 모양에 `file`만 얹었다 — 그리는 쪽은 그대로다.
 */
export interface AttachedFile {
  name: string;
  size: number;
  file: File;
}

/** 회원가입 폼의 칸 이름 */
export type SignupField =
  | "storeName"
  | "ownerName"
  | "email"
  | "password"
  | "passwordConfirm"
  | "phone"
  | "bizNo"
  | "license"
  | "agreeService"
  | "agreePrivacy";

/** 약관 2종의 이름. 가입 체크·전문 모달·설정 동의 내역이 같은 키를 쓴다 */
export type TermsKind = "service" | "privacy";

/** 약관 2종. 둘 다 필수라 선택 항목이 없다 */
export interface Terms {
  /** 체크박스에 붙는 이름 */
  label: string;
  /** 모달에 펼치는 전문 — 문단 배열 */
  body: string[];
}

/**
 * 진행 표시 한 칸의 상태.
 *
 * `current`를 `done`과 나누는 이유: 켜짐/꺼짐 두 값이면 "지금 어디인가"를
 * 화면이 말할 수 없다. 거절은 마지막 칸이 `current`다 — 지나간 단계가 아니라
 * **지금 멈춰 있는 자리**다.
 */
export type ApprovalStepState = "done" | "current" | "todo";

export interface ApprovalStep {
  label: string;
  state: ApprovalStepState;
}

/**
 * 설정 화면의 `사업자 정보` 패널이 읽는 신청 요약(더미). 승인 대기 화면은 이제
 * `ApplicationView`를 쓴다 — 설정 API가 스냅샷에 없어 이쪽만 남았다.
 */
export interface Application {
  storeName: string;
  /** 자리표시자만 쓴다. 실제 형식의 번호를 소스에 적지 않는다 */
  bizNo: string;
  appliedAt: string;
}

/**
 * 승인 대기 화면이 그리는 신청 요약. `/me`에서 `toApplicationView`로 만든다.
 *
 * 사업자등록번호가 없다 — `RetailerResponse`가 개인정보(대표자명·연락처·
 * 사업자번호)를 일부러 뺐다(스펙 설명). 화면도 그 줄을 그리지 않는다.
 */
export interface ApplicationView {
  shopName: string;
  /** `YYYY.MM.DD HH:mm`으로 다듬은 뒤의 값 */
  appliedAt: string;
}

/** 거절 화면이 그리는 사유. `/me`의 `rejection`에서 `toRejectionView`로 만든다 */
export interface RejectionView {
  reason: string;
  /** `YYYY.MM.DD HH:mm`으로 다듬은 뒤의 값 */
  rejectedAt: string;
  /** 서버가 늘 `운영자`로 고정해 내린다 */
  actor: string;
}
