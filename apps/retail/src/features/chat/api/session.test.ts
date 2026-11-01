import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  ChatStaleResponseError,
  clearChatCache,
  dropStaleSession,
} from "./session";

/**
 * 세션 세대 검사(loop-08c S7, review-fix 2차). 요청 함수를 손으로 만든 promise로 바꿔 "응답 전에 세션이 바뀜"을
 * 만든다 — 화면, 목, 네트워크 없이 갈래 하나씩 가른다.
 */

const unauthorized = () =>
  new ApiError({ status: 401, code: "UNAUTHORIZED", message: "로그인 필요" });

/** 끝나기 전에 `between`을 부르는 요청 */
function lateRun<T>(between: () => void, outcome: () => Promise<T>) {
  return async () => {
    await Promise.resolve();
    between();
    return outcome();
  };
}

describe("dropStaleSession — 방 만들기(리뷰 R7)", () => {
  it("응답 전에 세션이 바뀌면 성공도 버린다(A 방으로 이동 0)", async () => {
    const qc = new QueryClient();
    await expect(
      dropStaleSession(
        lateRun(
          () => clearChatCache(qc),
          async () => ({ roomId: 1 }),
        ),
      ),
    ).rejects.toBeInstanceOf(ChatStaleResponseError);
  });

  it("응답 전에 세션이 바뀌면 401도 버린다(ApiError가 아니라 공용 /login 처리를 안 탄다)", async () => {
    const qc = new QueryClient();
    await expect(
      dropStaleSession(
        lateRun(
          () => clearChatCache(qc),
          () => Promise.reject(unauthorized()),
        ),
      ),
    ).rejects.toBeInstanceOf(ChatStaleResponseError);
  });

  it("같은 세대의 401은 그대로 던진다(공용 처리가 /login)", async () => {
    await expect(
      dropStaleSession(() => Promise.reject(unauthorized())),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("같은 세대의 성공은 그대로", async () => {
    await expect(
      dropStaleSession(async () => ({ roomId: 2 })),
    ).resolves.toEqual({ roomId: 2 });
  });
});
