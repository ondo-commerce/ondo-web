import { describe, expect, it } from "vitest";
import { parseSessionBroadcast, shouldEndForOtherTab } from "./derive";

/** loop-08c 리뷰 R8 — 다른 탭의 세션 변경을 받은 탭이 자기 세션을 끝낼지 */
describe("shouldEndForOtherTab (R8)", () => {
  it.each<[string, string | null, string | null, boolean]>([
    ["A 탭, 다른 탭 로그아웃 → 끝냄", "a@ondo.test", null, true],
    ["A 탭, 다른 탭 B 로그인 → 끝냄", "a@ondo.test", "b@ondo.test", true],
    ["A 탭, 다른 탭 A 로그인 → 그대로", "a@ondo.test", "a@ondo.test", false],
    ["로그아웃 탭, 다른 탭 B 로그인 → 그대로", null, "b@ondo.test", false],
    ["로그아웃 탭, 다른 탭 로그아웃 → 그대로", null, null, false],
  ])("%s", (_, mine, theirs, expected) => {
    expect(shouldEndForOtherTab(mine, theirs)).toBe(expected);
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
