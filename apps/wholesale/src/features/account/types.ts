/**
 * 가입 심사 상태 3값. 승인은 **앱 밖에서** 일어난다 — 어드민 화면이 어디에도
 * 없어서 이 값은 더미에 미리 박혀 있고, 화면은 "지금 어느 단계인가"까지만 한다.
 */
export type AccountStatus = "APPROVED" | "PENDING" | "REJECTED";

/**
 * 정산 계좌 한 건. **소매가 읽는 모양과 필드 이름·개수를 맞춘다** —
 * `apps/retail/src/features/settlement/types.ts`의 `BankAccount`가 같은 3필드다.
 * 앱끼리 직접 import가 금지라(`CLAUDE.md`) 타입을 여기 다시 적는다.
 *
 * `memo`·`isPrimary`·`registeredAt`는 계좌가 여럿일 때만 쓸모가 있어 넣지 않는다
 * (`store.saveBankAccount` 참고).
 */
export interface BankAccount {
  bankName: string;
  accountNo: string;
  /** 사업자 통장이면 상호명, 개인 통장이면 대표자 이름 */
  holder: string;
}

/**
 * 로그인 분기에 필요한 최소 정보. **비밀번호를 담지 않는다** — 확인할 서버가
 * 없고, 더미라도 자격증명 형태를 소스에 적어 두면 그대로 굳는다.
 */
export interface Account {
  email: string;
  storeName: string;
  /** 자리표시자만 쓴다. 실제 형식의 번호를 소스에 적지 않는다 */
  bizNo: string;
  status: AccountStatus;
  /** 아직 등록하지 않았으면 `null`. 최초 로그인 온보딩이 이 값을 채운다 */
  bankAccount: BankAccount | null;
}

/**
 * 칸 하나당 오류 문구 한 줄. 배열이 아니라 칸 이름으로 잡는 이유: 문구를 입력칸
 * 아래에 붙이고 `aria-describedby`로 묶으려면 "어느 칸의 오류인가"가 자료 구조에
 * 있어야 한다.
 */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type LoginField = "email" | "password";

/**
 * 첨부한 파일. **이름과 용량만** 든다 — `File`을 들고 있어도 보낼 곳이 없다.
 * 백엔드가 붙기 전까지 첨부는 화면에 이름을 남기는 데서 끝난다.
 */
export interface AttachedFile {
  name: string;
  size: number;
}

/**
 * 회원가입 폼의 칸 이름. 도매를 소매(등록증 1종)보다 한 겹 더 확인하기로 한 것이
 * 이 회차의 전제라 `storePhone`·`address`·`idCard`가 더 있다.
 */
export type SignupField =
  | "storeName"
  | "ownerName"
  | "email"
  | "password"
  | "passwordConfirm"
  | "phone"
  | "storePhone"
  | "bizNo"
  | "address"
  | "license"
  | "idCard"
  | "agreeService"
  | "agreePrivacy";

export type DocumentField = "license" | "idCard";

/** 약관 2종. 둘 다 필수라 선택 항목이 없다 */
export interface Terms {
  label: string;
  /** 다이얼로그에 펼치는 전문 — 문단 배열 */
  body: string[];
}

/**
 * 진행 표시 한 칸의 상태. `current`를 `done`과 나누는 이유: 켜짐/꺼짐 두 값이면
 * "지금 어디인가"를 말할 수 없다. 거절은 마지막 칸이 `current`다 — 지나간 단계가
 * 아니라 **지금 멈춰 있는 자리**다.
 */
export type ApprovalStepState = "done" | "current" | "todo";

export interface ApprovalStep {
  label: string;
  state: ApprovalStepState;
}

export interface Application {
  storeName: string;
  bizNo: string;
  appliedAt: string;
}

/** 거절 결과. 사유는 운영자가 쓴 자유 문장이라 코드가 만들지 않는다 */
export interface Rejection {
  reason: string;
  decidedAt: string;
  decidedBy: string;
}

export type BankField = "bankName" | "accountNo" | "holder";
