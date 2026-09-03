/**
 * 가입 심사 상태 3값. 운영자가 사업자 등록증과 대표자 신분증을 대조해 정한다.
 *
 * 승인은 **앱 밖에서** 일어난다 — 어드민 화면이 도매·소매 어디에도 없다.
 * 그래서 이 값은 더미 계정에 미리 박혀 있고, 화면은 "지금 어느 단계인가"를
 * 말하는 데까지만 한다.
 */
export type AccountStatus = "APPROVED" | "PENDING" | "REJECTED";

/**
 * 정산 계좌 한 건. **소매가 읽는 모양과 필드 이름·개수를 맞춘다** —
 * `apps/retail/src/features/settlement/types.ts`의 `BankAccount`가 같은 3필드다.
 * 소매 `BankAccountRow`가 `${bankName} ${accountNo}` + `예금주 ${holder}`로 그린다.
 *
 * 앱끼리 직접 import가 금지라(`CLAUDE.md`) 타입을 여기 다시 적는다 — 상수를
 * feature마다 중복 정의하는 것과 같은 이유다.
 *
 * `memo`·`isPrimary`·`registeredAt`를 넣지 않는다. 그 셋의 쓸모는 계좌가
 * **여럿일 때 서로 구분하는 것**인데 지금은 도매처당 한 건이다. 다계좌 이슈가
 * 열릴 때 타입까지 같이 연다.
 */
export interface BankAccount {
  bankName: string;
  accountNo: string;
  /** 사업자 통장이면 상호명, 개인 통장이면 대표자 이름 */
  holder: string;
}

/**
 * 로그인 분기에 필요한 최소 정보.
 *
 * **비밀번호를 담지 않는다.** 확인할 서버가 없고, 더미라도 자격증명 형태를
 * 소스에 적어 두면 그대로 굳는다.
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
 * 칸 하나당 오류 문구 한 줄.
 *
 * 오류를 배열이 아니라 칸 이름으로 잡는 이유: 문구를 입력칸 아래에 붙이고
 * `aria-describedby`로 묶으려면 "어느 칸의 오류인가"가 자료 구조에 있어야 한다.
 */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** 로그인 폼의 칸 이름. 오류 표시·포커스 이동이 이 이름으로 칸을 찾는다 */
export type LoginField = "email" | "password";
