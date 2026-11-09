import { beforeEach, describe, expect, it } from "vitest";
import { LOGIN_NOTICE_OTHER_TAB } from "./constants";
import { noteSessionEnd, takeLoginNotice } from "./loginNotice";

/**
 * #410 S1-1 — 일회성 보관. `store.endSession(reason)`은 첫 줄에서 `noteSessionEnd(reason, 지금 주소)`만
 * 부른다. `endSession`은 `sessionStorage`와 채널을 쥐고 있어 node에서 못 불러서 그 한 줄을 직접 부른다
 */
describe("takeLoginNotice (10:S1-1)", () => {
  beforeEach(() => {
    takeLoginNotice();
  });

  it("다른 탭 때문에 닫힌 뒤 첫 꺼내기는 문구, 두 번째는 null", () => {
    noteSessionEnd("otherTab", "/products/new");
    expect(takeLoginNotice()).toBe(LOGIN_NOTICE_OTHER_TAB);
    expect(takeLoginNotice()).toBeNull();
  });

  it("다른 탭 때문에 닫힌 뒤 이 탭 로그아웃이 오면 null", () => {
    noteSessionEnd("otherTab", "/products/new");
    noteSessionEnd("self", "/products/new");
    expect(takeLoginNotice()).toBeNull();
  });
});
