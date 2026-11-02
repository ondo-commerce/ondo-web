import { describe, expect, it } from "vitest";
import {
  otherTabActionOf,
  parseSessionBroadcast,
  type OtherTabAction,
} from "./derive";

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
