import { QueryClient } from "@tanstack/react-query";
import { ApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import { afterEach, describe, expect, it } from "vitest";
import { ENTRY_TEXT } from "../constants";
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
  staleEntryText,
  confirmRoom,
  isUnconfirmedRoom,
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
    /* 입구 문구까지 잇는다(리뷰 R11): 계정 변경 뒤 401은 무표시 */
    expect(staleEntryText(error as ChatStaleResponseError)).toBeNull();
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
    expect(staleEntryText(error as ChatStaleResponseError)).toBe(
      ENTRY_TEXT.relogin,
    );
  });

  it("R11 같은 계정 갱신 뒤에 다른 계정 로그인까지 겹친 401 → account(무표시). 세션 세대도 올랐지만 계정이 먼저다", async () => {
    const qc = new QueryClient();
    const error = await caught(() =>
      dropStaleSession(
        lateRun(
          () => {
            refreshChatSession(qc);
            clearChatCache(qc);
          },
          () => Promise.reject(unauthorized()),
        ),
      ),
    );
    expect((error as ChatStaleResponseError).reason).toBe("account");
    expect(staleEntryText(error as ChatStaleResponseError)).toBeNull();
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

describe("loop-08e R9 잠긴 채 떠난 방은 다시 열 때 확인한다", () => {
  const lost = (qc: QueryClient) =>
    qc.setQueryData<boolean>(["chat", "session"], true);

  it("잠긴 채 방 1을 떠남 → 잠금은 풀리고 방 1만 확인 대상. 읽기는 지우지 않고, 확인 성공이 지운다", () => {
    const qc = new QueryClient();
    lost(qc);
    leaveChatScreen(qc, 1);
    expect(isSessionLost(qc)).toBe(false);
    expect(isUnconfirmedRoom(33)).toBe(false);
    expect(isUnconfirmedRoom(1)).toBe(true);
    expect(isUnconfirmedRoom(1)).toBe(true);
    confirmRoom(1, chatScreenEpoch());
    expect(isUnconfirmedRoom(1)).toBe(false);
  });

  it("메타 M1 — 확인 중 잠겨 떠난 뒤 늦게 온 그 화면의 방 머리 200은 새로 적힌 표시를 못 지운다. 다음 화면의 확인만 지운다", () => {
    const qc = new QueryClient();
    lost(qc);
    leaveChatScreen(qc, 1);
    /* 다시 연 화면이 확인 요청(방 머리)을 띄운다 */
    const reentry = chatScreenEpoch();
    /* 같은 화면의 메시지 확인이 401 → 다시 잠김 → 떠남 */
    lost(qc);
    leaveChatScreen(qc, 1);
    /* 그 화면이 띄운 방 머리가 이제 200 */
    confirmRoom(1, reentry);
    expect(isUnconfirmedRoom(1)).toBe(true);
    /* 다음에 다시 연 화면의 확인 성공은 지운다 */
    leaveChatScreen(qc, 33);
    confirmRoom(1, chatScreenEpoch());
    expect(isUnconfirmedRoom(1)).toBe(false);
  });

  it("메타 M2 — 잠기지 않은 채 떠난 방의 요청이 늦게 401 → 그 방을 확인 대상으로 적는다. 지금 화면은 안 잠근다", async () => {
    const qc = new QueryClient();
    const screen = chatScreenEpoch();
    await expect(
      guardSession(
        qc,
        lateRun(
          () => leaveChatScreen(qc, 1),
          () => Promise.reject(unauthorized()),
        ),
        screen,
        1,
      ),
    ).rejects.toBeInstanceOf(ChatSessionLostError);
    expect(isSessionLost(qc)).toBe(false);
    expect(isUnconfirmedRoom(1)).toBe(true);
    expect(isUnconfirmedRoom(33)).toBe(false);
    /* 그 401보다 앞 화면이 띄운 성공은 못 지운다 */
    confirmRoom(1, screen);
    expect(isUnconfirmedRoom(1)).toBe(true);
    confirmRoom(1, chatScreenEpoch());
    expect(isUnconfirmedRoom(1)).toBe(false);
  });

  it("메타 M2 — 떠난 화면의 401 아닌 실패와 성공, 방 번호 없는 401은 적지 않는다", async () => {
    const qc = new QueryClient();
    for (const outcome of [
      () =>
        Promise.reject(new ApiError({ status: 500, code: "X", message: "x" })),
      () => Promise.resolve(1),
    ]) {
      const screen = chatScreenEpoch();
      await guardSession(
        qc,
        lateRun(() => leaveChatScreen(qc, 7), outcome),
        screen,
        7,
      ).catch(() => undefined);
      expect(isUnconfirmedRoom(7)).toBe(false);
    }
    const screen = chatScreenEpoch();
    await guardSession(
      qc,
      lateRun(
        () => leaveChatScreen(qc, 8),
        () => Promise.reject(unauthorized()),
      ),
      screen,
    ).catch(() => undefined);
    expect(isUnconfirmedRoom(8)).toBe(false);
  });

  it("메타 M2 — 같은 화면의 401은 잠그고 아직 적지 않는다(떠날 때 적힌다)", async () => {
    const qc = new QueryClient();
    await expect(
      guardSession(
        qc,
        () => Promise.reject(unauthorized()),
        chatScreenEpoch(),
        9,
      ),
    ).rejects.toBeInstanceOf(ChatSessionLostError);
    expect(isSessionLost(qc)).toBe(true);
    expect(isUnconfirmedRoom(9)).toBe(false);
    leaveChatScreen(qc, 9);
    expect(isUnconfirmedRoom(9)).toBe(true);
  });

  it("안 잠긴 채 떠나면 확인 대상 아님", () => {
    const qc = new QueryClient();
    leaveChatScreen(qc, 5);
    expect(isUnconfirmedRoom(5)).toBe(false);
  });

  it("세션이 바뀌면(로그아웃, 로그인, 같은 소매처 갱신) 확인 대상을 비운다", () => {
    const qc = new QueryClient();
    lost(qc);
    leaveChatScreen(qc, 1);
    clearChatCache(qc);
    expect(isUnconfirmedRoom(1)).toBe(false);
    lost(qc);
    leaveChatScreen(qc, 2);
    refreshChatSession(qc);
    expect(isUnconfirmedRoom(2)).toBe(false);
  });
});
