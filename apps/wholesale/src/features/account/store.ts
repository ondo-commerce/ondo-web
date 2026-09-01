"use client";

import { useSyncExternalStore } from "react";
import { SESSION_STORAGE_KEY } from "./constants";
import { findAccount } from "./derive";
import type { Account, BankAccount } from "./types";

/**
 * 로그인 세션 흉내. **서버도 쿠키도 없다** — API가 붙으면 이 파일만 갈아 끼운다.
 *
 * 소매(`apps/retail/src/features/account/store.ts`)는 모듈 최상위 변수만 쓴다.
 * 소매는 라우트 가드가 없어서 견뎠지만 **도매는 가드를 만든다.** 가드 + 모듈
 * 변수를 합치면 새로 고칠 때마다 로그아웃된다 — ERP는 표를 보다가 새로 고치는
 * 화면이라 그 조합은 앱을 못 쓰게 만든다. 그래서 `sessionStorage`다.
 *
 * `localStorage`가 아닌 이유는 `constants.ts`의 키 주석에 적어 뒀다(공용 단말).
 */

/**
 * 더미(`fixtures.ts`)와 달라진 계정 정보.
 *
 * 승인이 앱 밖에서 일어나므로 화면이 만들 수 있는 변화는 이 셋뿐이다 —
 * 가입 신청 · 서류 재제출 · 정산 계좌 등록. 원본 더미를 덮어쓰지 않고 옆에
 * 쌓는다: 더미는 읽기 전용 상수이고, 무엇이 이번 세션에 바뀐 것인지가 자료
 * 구조에 남아야 한다.
 */
export interface AccountOverride {
  storeName?: string;
  /** 가입 폼이 적은 값. 승인 대기 요약이 이걸 읽는다 */
  bizNo?: string;
  status?: Account["status"];
  /**
   * 신청 시각. **서버가 없어 브라우저가 찍는다.**
   *
   * 더미 상수로 두면 방금 신청한 사장이 남의 날짜를 본다. 클라이언트에서만
   * 만들어 세션에 넣으므로 서버 렌더와 어긋날 자리가 없다 — 서버는 세션 자체를
   * 못 읽고, 그 순간은 "판정 전"이다.
   */
  appliedAt?: string;
  bankAccount?: BankAccount | null;
  /**
   * 계좌 온보딩을 이미 한 번 지나갔나(등록했거나 건너뛰었거나).
   *
   * 로그아웃해도 지우지 않는다 — 같은 탭에서 다시 로그인했을 때 방금 거절한
   * 안내가 또 뜨면 그건 안내가 아니라 방해다.
   */
  bankPromptSeen?: boolean;
}

interface SessionState {
  /**
   * `sessionStorage`를 아직 안 읽었으면 `false`.
   *
   * "로그아웃"과 **구분되어야 한다.** 서버 렌더와 하이드레이션 첫 프레임에서는
   * 저장소를 볼 수 없는데, 그 순간을 로그아웃으로 읽으면 가드가 정상 세션을
   * `/login`으로 튕긴다.
   */
  loaded: boolean;
  /** 로그인한 계정의 이메일. `null`이면 로그아웃. **비밀번호는 담지 않는다** */
  email: string | null;
  /** 이메일별 덮어쓰기. 로그아웃해도 남는다 */
  overrides: Record<string, AccountOverride>;
}

/* 서버 스냅샷 = 판정 전. 객체를 새로 만들면 매 렌더마다 다른 참조가 되어
   useSyncExternalStore가 무한 루프로 본다 — 모듈 상수 하나를 돌려준다 */
const PENDING_STATE: SessionState = {
  loaded: false,
  email: null,
  overrides: {},
};

let state: SessionState = PENDING_STATE;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/* 객체를 새로 만들어 넣는다 — 같은 객체를 고치면 스냅샷이 안 바뀐 것으로 보여
   화면이 다시 그려지지 않는다 */
function commit(next: SessionState): void {
  state = next;
  notify();
}

interface StoredSession {
  email: string | null;
  overrides: Record<string, AccountOverride>;
}

/**
 * 저장소에서 한 번 읽는다.
 *
 * 남이 손댈 수 있는 문자열이라 모양을 믿지 않는다 — 파싱이 깨지거나 형태가
 * 다르면 **로그아웃 상태로 시작한다.** 여기서 예외를 던지면 앱 전체가 안 뜬다.
 */
function readStorage(): StoredSession {
  const empty: StoredSession = { email: null, overrides: {} };
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return empty;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return empty;

    const { email, overrides } = parsed as Partial<StoredSession>;
    return {
      email: typeof email === "string" ? email : null,
      overrides:
        typeof overrides === "object" && overrides !== null ? overrides : {},
    };
  } catch {
    /* 사파리 사생활 보호 모드처럼 저장소 자체가 막힌 경우도 여기로 온다.
       그때는 세션이 화면 수명만큼만 살고, 새로 고치면 로그인부터다 */
    return empty;
  }
}

function writeStorage(next: SessionState): void {
  try {
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ email: next.email, overrides: next.overrides }),
    );
  } catch {
    /* 저장이 막혀도 화면은 계속 돌아야 한다 — 이번 탭에서만 세션이 짧아진다 */
  }
}

/**
 * 첫 구독 시점(= 클라이언트에 처음 붙은 순간)에 저장소를 읽는다.
 *
 * 렌더 중에 읽지 않는 이유: 하이드레이션 렌더는 서버 스냅샷을 써야 하고, 거기서
 * 실제 값이 튀어나오면 서버 HTML과 어긋난다. 구독은 커밋 뒤(effect)에 일어나므로
 * 여기서 읽으면 **한 번 더 그리는 것**으로 끝난다.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (!state.loaded) {
    const stored = readStorage();
    state = { loaded: true, ...stored };
    notify();
  }

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SessionState {
  return state;
}

function getServerSnapshot(): SessionState {
  return PENDING_STATE;
}

/**
 * 지금 로그인한 계정. 화면이 보는 유일한 창구다.
 *
 * `state`(아직 판정 전 / 로그아웃 / 로그인)를 값으로 가른다 — 셋을 `null` 하나로
 * 뭉치면 가드가 "판정 전"을 "로그아웃"으로 읽고 정상 세션을 튕긴다.
 */
export type SessionView =
  | { state: "unknown" }
  | { state: "signedOut" }
  | {
      state: "signedIn";
      account: Account;
      bankPromptSeen: boolean;
      /** 이번 세션에 신청한 시각. 더미 계정으로 로그인만 했으면 `null`이다 */
      appliedAt: string | null;
    };

/** 더미 + 이번 세션의 덮어쓰기를 합친 계정 한 건 */
function resolve(snapshot: SessionState): SessionView {
  if (!snapshot.loaded) return { state: "unknown" };
  if (!snapshot.email) return { state: "signedOut" };

  const base = findAccount(snapshot.email);
  const override = snapshot.overrides[snapshot.email];

  /* 더미에 없는 이메일 = 이번 세션에 가입한 계정. 덮어쓰기가 곧 그 계정이다 */
  if (!base && !override) return { state: "signedOut" };

  const account: Account = {
    email: snapshot.email,
    storeName: override?.storeName ?? base?.storeName ?? "",
    bizNo: override?.bizNo ?? base?.bizNo ?? "000-00-00000",
    status: override?.status ?? base?.status ?? "PENDING",
    bankAccount:
      override?.bankAccount !== undefined
        ? override.bankAccount
        : (base?.bankAccount ?? null),
  };

  return {
    state: "signedIn",
    account,
    bankPromptSeen: override?.bankPromptSeen ?? account.bankAccount !== null,
    appliedAt: override?.appliedAt ?? null,
  };
}

/** 이메일 하나의 덮어쓰기를 합쳐 넣는다. 저장과 알림을 한 자리에서만 한다 */
function patchOverride(email: string, patch: AccountOverride): SessionState {
  const next: SessionState = {
    ...state,
    loaded: true,
    overrides: {
      ...state.overrides,
      [email]: { ...state.overrides[email], ...patch },
    },
  };
  writeStorage(next);
  commit(next);
  return next;
}

/**
 * 화면이 읽는 세션.
 *
 * `useMemo`로 감싸지 않는다 — `resolve`는 순수 함수이고 매 렌더에 도는 비용이
 * 객체 하나 만드는 것뿐이다. 대신 결과를 상태로 들지 않으므로 덮어쓰기가 바뀌면
 * 다음 렌더에 곧바로 따라온다.
 */
export function useSession(): SessionView {
  return resolve(
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
  );
}

/**
 * 로그인. 비밀번호는 받지도 담지도 않는다 — 대조할 서버가 없다.
 *
 * **로그인한 계정을 그대로 돌려준다.** 부르는 쪽(로그인 화면)이 도착지를
 * 정하려면 이번 세션의 덮어쓰기까지 합친 값이 필요한데, 그건 훅으로 읽으면
 * 다음 렌더에나 온다 — 그 사이에 이미 이동해야 한다.
 */
export function signIn(email: string): SessionView {
  const next: SessionState = { ...state, loaded: true, email };
  writeStorage(next);
  commit(next);
  return resolve(next);
}

/**
 * 로그아웃. **덮어쓰기는 지우지 않는다.**
 *
 * 같은 탭에서 다시 로그인했을 때 방금 등록한 계좌가 사라지거나 이미 건너뛴
 * 온보딩이 다시 뜨면, 사장은 자기가 한 일이 남지 않는 앱이라고 배운다.
 */
export function signOut(): void {
  const next: SessionState = { ...state, loaded: true, email: null };
  writeStorage(next);
  commit(next);
}

/**
 * 가입 신청을 접수하고 그 계정으로 로그인한다.
 *
 * 승인은 앱 밖에서 일어나므로 여기서 하는 일은 "심사 중 계정 하나가 생겼다"까지다.
 * 방금 적은 상호명·사업자 등록번호를 세션에 얹는 이유: 승인 대기 화면이 이 값을
 * 읽어야 **상수 하나가 늘 같은 이름을 말하는 일**이 없다(`retail-account` F1).
 *
 * 신청 시각을 여기서 찍는다 — 사장이 방금 누른 시각이 곧 신청 시각이고,
 * 이벤트 핸들러 안이라 서버 렌더와 어긋날 자리가 없다.
 */
export function applySignup(input: {
  email: string;
  storeName: string;
  bizNo: string;
}): void {
  const next = patchOverride(input.email, {
    storeName: input.storeName,
    bizNo: input.bizNo,
    status: "PENDING",
    appliedAt: formatAppliedAt(new Date()),
  });
  const signedIn: SessionState = { ...next, email: input.email };
  writeStorage(signedIn);
  commit(signedIn);
}

/**
 * 서류를 다시 내고 재심사를 신청한다. **상태가 `심사 중`으로 돌아간다.**
 *
 * 무엇을 다시 올렸는지는 담지 않는다 — 보낼 서버가 없어 파일은 화면에 이름을
 * 남기는 데서 끝나고, 그 이름은 거절 화면이 자기 상태로 들고 있다.
 */
export function applyReapply(email: string): void {
  patchOverride(email, {
    status: "PENDING",
    appliedAt: formatAppliedAt(new Date()),
  });
}

/**
 * 신청 일시 표기 `2026.07.17 10:20`. 확정 와이어프레임 형식 그대로다.
 *
 * `toLocaleString`을 쓰지 않는 이유: 브라우저 로케일에 따라 표기가 갈려서 같은
 * 화면이 단말마다 다른 모양의 날짜를 말한다.
 */
function formatAppliedAt(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${at.getFullYear()}.${pad(at.getMonth() + 1)}.${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}
