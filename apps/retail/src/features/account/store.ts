"use client";

import { useSyncExternalStore } from "react";
import {
  settingsValuesFrom,
  normalizeStoreName,
  type SettingsValues,
} from "./derive";
import { SETTINGS_ACCOUNT } from "./fixtures";
import type { AccountStatus, AttachedFile } from "./types";

/**
 * 설정 화면이 고친 것. **서버가 없어서 브라우저 세션이 들고 있다** —
 * API가 붙으면 이 파일만 갈아 끼운다. `features/cart/store.ts`와 같은 구조다.
 *
 * 화면 하나가 `useState`로 들고 있으면 안 되는 이유가 둘이다.
 * ① 상호명을 읽는 계정 칩은 설정 화면 **밖**(헤더)에 있다. 화면 안 상태로 두면
 *    저장한 순간 헤더는 옛 이름, 본문은 새 이름이 되어 같은 세션에서 두 이름이
 *    보인다(`retail-market` F5와 같은 결함).
 * ② 저장한 뒤 홈에 갔다 오면 고친 값이 통째로 버려진다.
 *
 * **새로 고치면 출발값으로 돌아간다.** 세션 보관이지 서버 저장이 아니고,
 * 그 경계는 화면이 글자로 말한다(저장 결과 줄·재업로드 안내).
 */
interface SettingsState {
  /** 저장된 값. 타이핑 중인 값이 아니다 — 그건 폼이 들고 있다 */
  profile: SettingsValues;
  /** 다시 올린 사업자등록증. 보낼 곳이 없어 이름·용량까지만 남는다 */
  license: AttachedFile | null;
  /** 지금 승인 상태. 등록증을 다시 올리면 `PENDING`으로 돌아간다(RT-68) */
  status: AccountStatus;
}

const INITIAL: SettingsState = {
  profile: settingsValuesFrom(SETTINGS_ACCOUNT),
  license: null,
  status: SETTINGS_ACCOUNT.status,
};

/* 모듈 값이라 서버에서도 한 벌 산다. 바꾸는 곳이 이벤트 핸들러뿐이라 서버 쪽
   값은 INITIAL에서 움직이지 않는다 — 요청끼리 섞이지 않는다 */
let state: SettingsState = INITIAL;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SettingsState {
  return state;
}

function getServerSnapshot(): SettingsState {
  return INITIAL;
}

/* 객체를 새로 만들어 넣는다 — 같은 객체를 고치면 스냅샷이 안 바뀐 것으로 보여
   화면이 다시 그려지지 않는다 */
function commit(next: SettingsState): void {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * 고친 값을 저장한다. 패널마다 자기 칸만 넘긴다 — `가게 정보`는 상호명 하나,
 * `계정`은 대표자명·연락처 둘이다.
 *
 * 상호명은 저장 시점에 한 번 다듬는다(`normalizeStoreName`). 앞뒤 공백만 친
 * 값이 헤더에 그대로 들어가면 계정 칩이 빈 칸이 된다 — 다듬어서 남는 게 없으면
 * **저장하지 않고** 옛 이름을 지킨다. 비었는지에 대한 판정과 문구는 호출부의
 * `validateSettings`가 이미 냈고, 여기는 마지막 방어선이다.
 */
export function saveProfile(patch: Partial<SettingsValues>): void {
  const merged = { ...state.profile, ...patch };
  const storeName = normalizeStoreName(merged.storeName);

  commit({
    ...state,
    profile: { ...merged, storeName: storeName ?? state.profile.storeName },
  });
}

/**
 * 다시 올린 등록증을 반영한다. **승인 상태가 `심사 중`으로 돌아간다**(RT-68).
 *
 * 파일을 고르는 것만으로는 여기 오지 않는다 — 되돌릴 수 없는 조작이라 확인
 * 다이얼로그를 거친 뒤에만 부른다(`01-pm.md` 가정 A5).
 */
export function applyLicenseReupload(file: AttachedFile): void {
  commit({ ...state, license: file, status: "PENDING" });
}

/** 헤더 계정 칩과 설정 본문이 **같이 읽는** 상호명 */
export function useStoreName(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).profile
    .storeName;
}

/** 저장된 값 한 벌. 설정 폼의 출발값이다 */
export function useSettingsProfile(): SettingsValues {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    .profile;
}

/** 다시 올린 등록증. `null`이면 아직 안 올렸다 */
export function useLicense(): AttachedFile | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    .license;
}

/** 지금 승인 상태. 재업로드 뒤에는 `PENDING`이 남는다 */
export function useAccountStatus(): AccountStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).status;
}
