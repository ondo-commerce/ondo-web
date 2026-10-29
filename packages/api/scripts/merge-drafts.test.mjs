import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkDraftSurvival, mergeDrafts } from "./merge-drafts.mjs";

/**
 * S7-1 재병합 검사. BE 스펙이 들어와 `sync-spec`이 스냅샷을 덮을 때 초안이 약속한 칸과 op가
 * 남는지 본다. 가짜 "받은 스펙"을 만들어 실제 drafts 와 합친다 — 서버도 파일 쓰기도 없다.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path) => JSON.parse(readFileSync(resolve(HERE, path), "utf8"));

const DRAFTS = {
  retail: read("../openapi/drafts/retail.json"),
  wholesale: read("../openapi/drafts/wholesale.json"),
};
const SNAPSHOTS = {
  retail: read("../openapi/retail.json"),
  wholesale: read("../openapi/wholesale.json"),
};

const SETTINGS_PATH = "/api/wholesale/chat/auto-reply-settings";

/** 채팅이 하나도 없는 BE 스펙(지금 실제 상태) */
function emptyReceived() {
  return { openapi: "3.1.0", paths: {}, components: { schemas: {} } };
}

describe("S7-1 초안 병합 뒤 choices 와 설정 op", () => {
  it("drafts 양쪽에 ChatChoice, ChatAutoReply.choices(required 아님, null 허용)가 있다", () => {
    for (const app of ["retail", "wholesale"]) {
      const schemas = DRAFTS[app].components.schemas;
      expect(schemas.ChatChoice.required).toEqual([
        "label",
        "orderable",
        "variantId",
      ]);
      const choices = schemas.ChatAutoReply.properties.choices;
      expect(choices.type).toEqual(["array", "null"]);
      expect(choices["x-ondo-draft"]).toBe(true);
      expect(schemas.ChatAutoReply.required).not.toContain("choices");
    }
  });

  it("도매 drafts 에 설정 op 2개(GET, PUT), 둘 다 x-ondo-draft", () => {
    const ops = DRAFTS.wholesale.paths[SETTINGS_PATH];
    expect(ops.get.operationId).toBe("autoReplySettings");
    expect(ops.put.operationId).toBe("updateAutoReplySettings");
    expect(ops.get["x-ondo-draft"]).toBe(true);
    expect(ops.put["x-ondo-draft"]).toBe(true);
  });

  it("채팅 없는 BE 스펙과 합치면 choices, 설정 op, 설정 스키마가 다 들어오고 검사가 빈 배열이다", () => {
    for (const app of ["retail", "wholesale"]) {
      const { merged } = mergeDrafts(emptyReceived(), DRAFTS[app]);
      expect(
        merged.components.schemas.ChatAutoReply.properties.choices,
      ).toBeDefined();
      expect(merged.components.schemas.ChatChoice).toBeDefined();
      expect(checkDraftSurvival(merged, DRAFTS[app])).toEqual([]);
    }
    const { merged } = mergeDrafts(emptyReceived(), DRAFTS.wholesale);
    expect(merged.paths[SETTINGS_PATH].put).toBeDefined();
    expect(merged.components.schemas.AutoReplySettings).toBeDefined();
    expect(merged.components.schemas.AutoReplyIntentSettings).toBeDefined();
  });

  it("BE 가 choices 없는 ChatAutoReply 를 먼저 내면 검사가 `ChatAutoReply.choices` 사라짐으로 실패한다", () => {
    for (const app of ["retail", "wholesale"]) {
      // JSON 왕복 복사. scripts/ 의 eslint 전역에 structuredClone 이 없다
      const beAutoReply = JSON.parse(
        JSON.stringify(DRAFTS[app].components.schemas.ChatAutoReply),
      );
      delete beAutoReply.properties.choices;
      const received = emptyReceived();
      received.components.schemas.ChatAutoReply = beAutoReply;

      const { merged } = mergeDrafts(received, DRAFTS[app]);
      // 받은 쪽이 이겨서 병합 결과에는 choices 가 없다 — 이게 검사가 있는 이유다
      expect(
        merged.components.schemas.ChatAutoReply.properties.choices,
      ).toBeUndefined();
      expect(checkDraftSurvival(merged, DRAFTS[app])).toEqual([
        "`ChatAutoReply.choices` 사라짐",
      ]);
    }
  });

  it("BE 가 설정 op 를 구현해 내면 받은 쪽이 이기고 op 는 남는다(사라짐 아님)", () => {
    const received = emptyReceived();
    received.paths[SETTINGS_PATH] = {
      get: { responses: {} },
      put: { responses: {} },
    };
    const { merged, dropped } = mergeDrafts(received, DRAFTS.wholesale);
    expect(dropped).toEqual([`GET ${SETTINGS_PATH}`, `PUT ${SETTINGS_PATH}`]);
    expect(checkDraftSurvival(merged, DRAFTS.wholesale)).toEqual([]);
  });

  it("op 가 병합 결과에 없으면 사라짐으로 잡는다", () => {
    const { merged } = mergeDrafts(emptyReceived(), DRAFTS.wholesale);
    delete merged.paths[SETTINGS_PATH];
    expect(checkDraftSurvival(merged, DRAFTS.wholesale)).toEqual([
      `GET ${SETTINGS_PATH} 사라짐`,
      `PUT ${SETTINGS_PATH} 사라짐`,
    ]);
  });

  it("커밋된 스냅샷은 drafts 를 전부 담고 있다(손으로 넣다 빠뜨린 조각이 없다)", () => {
    for (const app of ["retail", "wholesale"]) {
      expect(checkDraftSurvival(SNAPSHOTS[app], DRAFTS[app])).toEqual([]);
    }
  });
});

/**
 * loop-05b2 S10-1. 알림 op 3개는 BE에 아직 없다. sync-spec 이 BE 스펙으로 스냅샷을 덮은 뒤에도
 * 이 셋과 스키마가 살아 있어야 종 화면(#295)이 컴파일된다.
 */
const NOTIFICATION_OPS = [
  ["/api/wholesale/notifications", "get", "notifications"],
  [
    "/api/wholesale/notifications/unread-count",
    "get",
    "notificationUnreadCount",
  ],
  ["/api/wholesale/notifications/read", "post", "markNotificationsRead"],
];
const NOTIFICATION_SCHEMAS = [
  "Notification",
  "NotificationType",
  "NotificationTarget",
  "NotificationUnreadCount",
  "MarkNotificationsReadRequest",
  "MarkNotificationsReadResult",
];

describe("S10-1 알림 초안 op 3개", () => {
  it("도매 drafts 에 op 3개, 전부 x-ondo-draft, 스키마 6개", () => {
    for (const [path, method, operationId] of NOTIFICATION_OPS) {
      const op = DRAFTS.wholesale.paths[path]?.[method];
      expect(op?.operationId).toBe(operationId);
      expect(op?.["x-ondo-draft"]).toBe(true);
    }
    for (const name of NOTIFICATION_SCHEMAS) {
      expect(DRAFTS.wholesale.components.schemas[name], name).toBeDefined();
    }
  });

  it("알림 없는 BE 스펙과 합치면 op 3개와 스키마 6개(중첩 참조 포함)가 들어오고 검사가 빈 배열이다", () => {
    const { merged, kept } = mergeDrafts(emptyReceived(), DRAFTS.wholesale);
    for (const [path, method] of NOTIFICATION_OPS) {
      expect(kept).toContain(`${method.toUpperCase()} ${path}`);
    }
    for (const name of NOTIFICATION_SCHEMAS) {
      expect(merged.components.schemas[name], name).toBeDefined();
    }
    // 목록 응답이 부르는 CursorPageMeta, 오류 본문의 FieldError 도 따라 들어온다
    expect(merged.components.schemas.CursorPageMeta).toBeDefined();
    expect(merged.components.schemas.FieldError).toBeDefined();
    expect(checkDraftSurvival(merged, DRAFTS.wholesale)).toEqual([]);
  });

  it("가짜 스펙: 병합 뒤 알림 op 3개가 빠지면 검사가 셋 다 사라짐으로 실패한다", () => {
    const { merged } = mergeDrafts(emptyReceived(), DRAFTS.wholesale);
    for (const [path] of NOTIFICATION_OPS) delete merged.paths[path];
    // 순서는 drafts 경로 순서라 정렬해서 비교한다
    expect(checkDraftSurvival(merged, DRAFTS.wholesale).sort()).toEqual(
      NOTIFICATION_OPS.map(
        ([path, method]) => `${method.toUpperCase()} ${path} 사라짐`,
      ).sort(),
    );
  });

  it("BE 가 목록 GET 만 먼저 내면 받은 쪽이 이기고 unread-count, read 초안은 살아남는다", () => {
    const received = emptyReceived();
    received.paths["/api/wholesale/notifications"] = {
      get: { responses: {} },
    };
    const { merged, kept, dropped } = mergeDrafts(received, DRAFTS.wholesale);
    expect(dropped).toContain("GET /api/wholesale/notifications");
    expect(kept).toContain("GET /api/wholesale/notifications/unread-count");
    expect(kept).toContain("POST /api/wholesale/notifications/read");
    expect(checkDraftSurvival(merged, DRAFTS.wholesale)).toEqual([]);
  });

  it("알림 op 는 기존 op 를 바꾸지 않는다: 스냅샷의 다른 경로에 notifications 가 섞이지 않는다", () => {
    const paths = Object.keys(SNAPSHOTS.wholesale.paths).filter((p) =>
      p.startsWith("/api/wholesale/notifications"),
    );
    expect(paths.sort()).toEqual(NOTIFICATION_OPS.map(([p]) => p).sort());
  });
});
