import { describe, expect, it } from "vitest";
import { LOGIN_NOTICE_OTHER_TAB } from "./constants";
import {
  loginNoticeFor,
  otherTabActionOf,
  parseSessionBroadcast,
  type OtherTabAction,
} from "./derive";
import type { SessionEndReason } from "./types";

/** #410 S1-1 — 세션이 닫힌 이유와 그 순간 주소로 로그인 화면 안내를 정한다(loop-10 기획 §4-2-1) */
describe("loginNoticeFor (10:S1-1)", () => {
  it.each<[string, SessionEndReason, string, string | null]>([
    [
      "다른 탭 때문에 상품 등록 화면에서 닫힘 → 안내",
      "otherTab",
      "/products/new",
      LOGIN_NOTICE_OTHER_TAB,
    ],
    ["이 탭 로그아웃 → 없음", "self", "/products/new", null],
    ["다른 탭 때문이지만 이미 /login → 없음", "otherTab", "/login", null],
  ])("%s", (_, reason, pathname, expected) => {
    expect(loginNoticeFor(reason, pathname)).toBe(expected);
  });
});

/** loop-08c 리뷰 R8, Codex 메타 M2 — 다른 탭의 세션 변경을 받은 탭이 할 일 */
describe("otherTabActionOf (R8, M2)", () => {
  it.each<[string, string | null, string | null, OtherTabAction]>([
    ["A 탭, 다른 탭 로그아웃 → 끝냄", "a@ondo.test", null, "end"],
    ["A 탭, 다른 탭 B 로그인 → 끝냄", "a@ondo.test", "b@ondo.test", "end"],
    [
      "A 탭, 다른 탭 A 재로그인 → 새 세션으로 이어 감",
      "a@ondo.test",
      "a@ondo.test",
      "refresh",
    ],
    ["로그아웃 탭, 다른 탭 B 로그인 → 할 일 없음", null, "b@ondo.test", "none"],
    ["로그아웃 탭, 다른 탭 로그아웃 → 할 일 없음", null, null, "none"],
  ])("%s", (_, mine, theirs, expected) => {
    expect(otherTabActionOf(mine, theirs)).toBe(expected);
  });
});

describe("parseSessionBroadcast (R8)", () => {
  it("이메일은 소문자로, 로그아웃은 null로 읽는다", () => {
    expect(parseSessionBroadcast({ email: " A@Ondo.test " })).toEqual({
      email: "a@ondo.test",
    });
    expect(parseSessionBroadcast({ email: null })).toEqual({ email: null });
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["문자열", "a@ondo.test"],
    ["email 없음", {}],
    ["email 숫자", { email: 1 }],
  ])("모양이 다르면(%s) 무시한다", (_, data) => {
    expect(parseSessionBroadcast(data)).toBeNull();
  });
});
