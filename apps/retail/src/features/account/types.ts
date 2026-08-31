/**
 * 가입 심사 상태. 운영자 승인제(ST-303)의 3값이다.
 *
 * 거래관계(TradeRelation) 승인 층은 여기에 없다 — 도매처별 승인을 계정 화면에
 * 둘지 첫 주문 시점에 둘지가 아직 결정되지 않았다(`01-pm.md` Q1). 결정되면
 * 값이 아니라 단계가 늘어난다.
 */
export type AccountStatus = "APPROVED" | "PENDING" | "REJECTED";

/**
 * 로그인 분기에 필요한 최소 정보.
 *
 * 비밀번호를 담지 않는다. 확인할 서버가 없고, 더미라도 자격증명 형태를
 * 소스에 적어 두면 그대로 굳는다.
 */
export interface Account {
  email: string;
  storeName: string;
  status: AccountStatus;
}

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
 * 첨부한 파일. 이름과 용량만 든다.
 *
 * `File` 객체를 그대로 들고 다니지 않는 이유: 보낼 곳이 없다. 백엔드가 붙기
 * 전까지 첨부는 **화면에 이름을 남기는 데서 끝난다**(네트워크 요청 0회).
 */
export interface AttachedFile {
  name: string;
  size: number;
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

/** 약관 2종. 둘 다 필수라 선택 항목이 없다 */
export interface Terms {
  /** 체크박스에 붙는 이름 */
  label: string;
  /** 모달에 펼치는 전문 — 문단 배열 */
  body: string[];
}
