import { QueryClient } from "@tanstack/react-query";
import { ApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import { afterEach, describe, expect, it } from "vitest";
import {
  beginChatSignOut,
  ChatSessionLostError,
  ChatStaleResponseError,
  chatScreenEpoch,
  clearChatCache,
  endChatSignOut,
  isChatLeaving,
  leaveChatScreen,
  dropStaleSession,
  guardSession,
  isSessionLost,
  refreshChatSession,
  sendOutcomeOf,
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

describe("guardSession 화면 세대 기본값(loop-08d 메타 M1)", () => {
  it("screen을 안 넘겨도 부른 순간의 화면 세대를 잡는다 — 읽음, 보내기, polling의 늦은 401도 떠난 뒤면 안 잠근다", async () => {
    const qc = new QueryClient();
    await expect(
      guardSession(
        qc,
        lateRun(
          () => leaveChatScreen(qc),
          () => Promise.reject(unauthorized()),
        ),
      ),
    ).rejects.toBeInstanceOf(ChatSessionLostError);
    expect(isSessionLost(qc)).toBe(false);
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

/** 던진 것을 잡아 돌려준다 */
async function caught(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("던지지 않았다");
}

const serverError = (status: number, code: string) =>
  new ApiError({ status, code, message: "x" });

describe("S2-13 dropStaleSession 갈래(loop-08e Q6)", () => {
  it("계정 변경 → stale account(입구 무표시)", async () => {
    const qc = new QueryClient();
    const error = await caught(() =>
      dropStaleSession(
        lateRun(
          () => clearChatCache(qc),
          () => Promise.reject(unauthorized()),
        ),
      ),
    );
    expect(error).toBeInstanceOf(ChatStaleResponseError);
    expect((error as ChatStaleResponseError).reason).toBe("account");
  });

  it("같은 계정 갱신 뒤 401 → stale session(입구 문구, /login 아님)", async () => {
    const qc = new QueryClient();
    const error = await caught(() =>
      dropStaleSession(
        lateRun(
          () => refreshChatSession(qc),
          () => Promise.reject(unauthorized()),
        ),
      ),
    );
    expect(error).toBeInstanceOf(ChatStaleResponseError);
    expect((error as ChatStaleResponseError).reason).toBe("session");
  });

  it("같은 계정 갱신 뒤 201 → 결과 그대로(방으로 이동)", async () => {
    const qc = new QueryClient();
    await expect(
      dropStaleSession(
        lateRun(
          () => refreshChatSession(qc),
          async () => ({ roomId: 3 }),
        ),
      ),
    ).resolves.toEqual({ roomId: 3 });
  });

  it("같은 계정 갱신 뒤 401 아닌 실패 → 원래 오류(입구 실패 문구)", async () => {
    const qc = new QueryClient();
    const boom = serverError(500, "INTERNAL_ERROR");
    await expect(
      dropStaleSession(
        lateRun(
          () => refreshChatSession(qc),
          () => Promise.reject(boom),
        ),
      ),
    ).rejects.toBe(boom);
  });

  it("같은 세션 401 → 원래 ApiError(공용 처리가 /login)", async () => {
    const boom = unauthorized();
    await expect(dropStaleSession(() => Promise.reject(boom))).rejects.toBe(
      boom,
    );
  });
});

describe("S2-13 guardSession stale 갈래 이유", () => {
  it("계정 변경을 넘긴 성공과 실패 → account", async () => {
    const qc = new QueryClient();
    for (const outcome of [
      async () => "ok",
      () => Promise.reject(serverError(500, "INTERNAL_ERROR")),
    ]) {
      const error = await caught(() =>
        guardSession(
          qc,
          lateRun(() => clearChatCache(qc), outcome),
        ),
      );
      expect((error as ChatStaleResponseError).reason).toBe("account");
    }
  });

  it("같은 계정 갱신을 넘긴 401 → session", async () => {
    const qc = new QueryClient();
    const error = await caught(() =>
      guardSession(
        qc,
        lateRun(
          () => refreshChatSession(qc),
          () => Promise.reject(unauthorized()),
        ),
      ),
    );
    expect((error as ChatStaleResponseError).reason).toBe("session");
  });
});

describe("S2-13 보내기 결과 갈래 sendOutcomeOf", () => {
  const offline = new ApiError({
    status: 0,
    code: TRANSPORT_ERROR_CODE.NETWORK,
    message: "x",
  });

  it("계정 변경 stale(성공이든 실패든 부르는 쪽이 계정 세대로 알린다) → drop", () => {
    expect(sendOutcomeOf(new ChatStaleResponseError("account"), false)).toBe(
      "drop",
    );
    expect(sendOutcomeOf(serverError(500, "INTERNAL_ERROR"), true)).toBe(
      "drop",
    );
    expect(sendOutcomeOf(new ChatSessionLostError(), true)).toBe("drop");
    expect(sendOutcomeOf(new ChatStaleResponseError("session"), true)).toBe(
      "drop",
    );
  });

  it("같은 계정 갱신 stale 401 → server(R+D, 잠금 0)", () => {
    expect(sendOutcomeOf(new ChatStaleResponseError("session"), false)).toBe(
      "server",
    );
  });

  it("ChatSessionLostError → session", () => {
    expect(sendOutcomeOf(new ChatSessionLostError(), false)).toBe("session");
  });

  it("ApiError 500, 403, 404 → server", () => {
    expect(sendOutcomeOf(serverError(500, "INTERNAL_ERROR"), false)).toBe(
      "server",
    );
    expect(sendOutcomeOf(serverError(403, "FORBIDDEN"), false)).toBe("server");
    expect(sendOutcomeOf(serverError(404, "RESOURCE_NOT_FOUND"), false)).toBe(
      "server",
    );
  });

  it("네트워크 → offline", () => {
    expect(sendOutcomeOf(offline, false)).toBe("offline");
  });
});

describe("S2-15 로그아웃 응답 대기(나가는 중) — 새 요청 0", () => {
  afterEach(() => endChatSignOut());

  it("guardSession은 요청을 만들지 않고 stale account를 던진다", async () => {
    const qc = new QueryClient();
    beginChatSignOut();
    expect(isChatLeaving()).toBe(true);
    let called = 0;
    const error = await caught(() =>
      guardSession(qc, async () => {
        called += 1;
        return "ok";
      }),
    );
    expect(called).toBe(0);
    expect((error as ChatStaleResponseError).reason).toBe("account");
    expect(isSessionLost(qc)).toBe(false);
  });

  it("방 만들기도 요청 0", async () => {
    beginChatSignOut();
    let called = 0;
    await expect(
      dropStaleSession(async () => {
        called += 1;
        return { roomId: 1 };
      }),
    ).rejects.toBeInstanceOf(ChatStaleResponseError);
    expect(called).toBe(0);
  });

  it("로그인 성공 갈래(endChatSignOut) 뒤엔 다시 보낸다", async () => {
    beginChatSignOut();
    endChatSignOut();
    await expect(
      dropStaleSession(async () => ({ roomId: 1 })),
    ).resolves.toEqual({ roomId: 1 });
  });
});
