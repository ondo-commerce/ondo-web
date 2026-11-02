import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  ChatSessionLostError,
  ChatStaleResponseError,
  chatScreenEpoch,
  clearChatCache,
  leaveChatScreen,
  dropStaleSession,
  guardSession,
  isSessionLost,
  refreshChatSession,
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

describe("같은 소매처 갱신(refreshChatSession)을 넘긴 요청(Codex 메타 M6)", () => {
  it("성공은 그대로 돌려준다 — 보내기가 실패 말풍선으로 안 보인다", async () => {
    const qc = new QueryClient();
    await expect(
      guardSession(
        qc,
        lateRun(
          () => refreshChatSession(qc),
          async () => "ok",
        ),
      ),
    ).resolves.toBe("ok");
  });

  it("401 아닌 실패는 그대로 던진다 — 실패 말풍선으로 끝난다", async () => {
    const qc = new QueryClient();
    const serverError = new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "x",
    });
    await expect(
      guardSession(
        qc,
        lateRun(
          () => refreshChatSession(qc),
          () => Promise.reject(serverError),
        ),
      ),
    ).rejects.toBe(serverError);
  });

  it("401은 버리고 끊김 칸을 안 켠다 — 새 세션을 잠그지 않는다", async () => {
    const qc = new QueryClient();
    await expect(
      guardSession(
        qc,
        lateRun(
          () => refreshChatSession(qc),
          () => Promise.reject(unauthorized()),
        ),
      ),
    ).rejects.toBeInstanceOf(ChatStaleResponseError);
    expect(isSessionLost(qc)).toBe(false);
  });

  it("방 만들기도 같은 소매처 갱신이면 버리지 않는다", async () => {
    const qc = new QueryClient();
    await expect(
      dropStaleSession(
        lateRun(
          () => refreshChatSession(qc),
          async () => ({ roomId: 1 }),
        ),
      ),
    ).resolves.toEqual({ roomId: 1 });
  });
});

describe("guardSession 세대 갈래(QA F1)", () => {
  it("성공 갈래: 응답 전에 세션이 바뀌면 성공 결과를 돌려주지 않는다 — queryFn이 이어서 다른 칸에 쓰지 못하게", async () => {
    const qc = new QueryClient();
    await expect(
      guardSession(
        qc,
        lateRun(
          () => clearChatCache(qc),
          async () => ({ counterpartLastReadSequence: 9 }),
        ),
      ),
    ).rejects.toBeInstanceOf(ChatStaleResponseError);
  });

  it("오류 갈래: 응답 전에 세션이 바뀐 401은 끊김 칸을 안 켠다(다음 계정 방이 안 잠긴다)", async () => {
    const qc = new QueryClient();
    await expect(
      guardSession(
        qc,
        lateRun(
          () => clearChatCache(qc),
          () => Promise.reject(unauthorized()),
        ),
      ),
    ).rejects.toBeInstanceOf(ChatStaleResponseError);
    expect(isSessionLost(qc)).toBe(false);
  });

  it("같은 세대의 401은 끊김으로 바꾸고 칸을 켠다", async () => {
    const qc = new QueryClient();
    await expect(
      guardSession(qc, () => Promise.reject(unauthorized())),
    ).rejects.toBeInstanceOf(ChatSessionLostError);
    expect(isSessionLost(qc)).toBe(true);
  });
});

describe("guardSession 방 화면 세대(loop-08d R1)", () => {
  it("띄운 방 화면을 떠난 뒤 온 401은 끊김 칸을 안 켠다 — 지금 보는 다른 방이 안 잠긴다", async () => {
    const qc = new QueryClient();
    const screen = chatScreenEpoch();
    await expect(
      guardSession(
        qc,
        lateRun(
          () => leaveChatScreen(qc),
          () => Promise.reject(unauthorized()),
        ),
        screen,
      ),
    ).rejects.toBeInstanceOf(ChatSessionLostError);
    expect(isSessionLost(qc)).toBe(false);
  });

  it("같은 방 화면의 401은 지금처럼 잠근다", async () => {
    const qc = new QueryClient();
    await expect(
      guardSession(qc, () => Promise.reject(unauthorized()), chatScreenEpoch()),
    ).rejects.toBeInstanceOf(ChatSessionLostError);
    expect(isSessionLost(qc)).toBe(true);
  });

  it("화면 세대를 넘긴 성공은 그대로 돌려준다 — 원래 방 캐시에 합친다", async () => {
    const qc = new QueryClient();
    const screen = chatScreenEpoch();
    await expect(
      guardSession(
        qc,
        lateRun(
          () => leaveChatScreen(qc),
          async () => "ok",
        ),
        screen,
      ),
    ).resolves.toBe("ok");
  });
});

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
