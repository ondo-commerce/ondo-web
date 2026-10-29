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
      // choices 가 빠지면 ChatChoice 를 부르는 곳이 없어 병합에 안 들어온다 → loop-06 이 더한 보기 칸 둘도 같이 사라짐
      expect(checkDraftSurvival(merged, DRAFTS[app])).toEqual([
        "`ChatAutoReply.choices` 사라짐",
        "`ChatChoice.backorderId` 사라짐",
        "`ChatChoice.kind` 사라짐",
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

/**
 * loop-06 S1-1. 소매 헤더 배지 op 1개 + 기존 스키마에 더한 칸 3개(`ChatChoice.kind`, `ChatChoice.backorderId`,
 * `ChatInquiry.notListed`, 도매와 소매 양쪽). 칸은 required 가 아니라 BE 가 빼고 내도 typecheck 가 못 잡는다.
 */
const RETAIL_UNREAD = "/api/retail/notifications/unread-count";
const LOOP06_FIELDS = [
  ["ChatChoice", "kind"],
  ["ChatChoice", "backorderId"],
  ["ChatInquiry", "notListed"],
];

describe("S1-1 loop-06 초안: 소매 unread-count op, 보기 kind, backorderId, notListed", () => {
  it("drafts 와 스냅샷 양쪽에 칸 3개, 전부 x-ondo-draft, required 아님. kind enum 3개", () => {
    for (const app of ["retail", "wholesale"]) {
      for (const doc of [DRAFTS[app], SNAPSHOTS[app]]) {
        for (const [schema, prop] of LOOP06_FIELDS) {
          const s = doc.components.schemas[schema];
          expect(
            s.properties[prop]?.["x-ondo-draft"],
            `${app} ${schema}.${prop}`,
          ).toBe(true);
          expect(s.required).not.toContain(prop);
        }
        expect(doc.components.schemas.ChatChoice.properties.kind.enum).toEqual([
          "VARIANT",
          "BACKORDER",
          "NOT_LISTED",
        ]);
        expect(
          doc.components.schemas.ChatChoice.properties.backorderId.type,
        ).toEqual(["integer", "null"]);
      }
    }
  });

  it("소매 drafts 에 op 1개(notificationUnreadCount, x-ondo-draft, 401 403 500), RetailUnreadCount {notifications, chats} 필수", () => {
    const op = DRAFTS.retail.paths[RETAIL_UNREAD]?.get;
    expect(op?.operationId).toBe("notificationUnreadCount");
    expect(op?.["x-ondo-draft"]).toBe(true);
    expect(Object.keys(op?.responses ?? {}).sort()).toEqual([
      "200",
      "401",
      "403",
      "500",
    ]);
    expect(op.responses["401"].content["application/json"].example.code).toBe(
      "UNAUTHORIZED",
    );
    expect(op.responses["403"].content["application/json"].example.code).toBe(
      "ACCOUNT_NOT_APPROVED",
    );
    const schema = DRAFTS.retail.components.schemas.RetailUnreadCount;
    expect(schema.required).toEqual(["chats", "notifications"]);
    // 06b 새 알림 판단용(05b-2 QA F3). optional + 초안 표시라 BE 가 빼면 재병합 검사가 잡는다
    expect(schema.properties.latestNotificationId).toMatchObject({
      type: ["integer", "null"],
      format: "int64",
      "x-ondo-draft": true,
    });
    expect(schema.required).not.toContain("latestNotificationId");
    expect(SNAPSHOTS.retail.components.schemas.RetailUnreadCount).toEqual(
      schema,
    );
    const received = emptyReceived();
    received.paths[RETAIL_UNREAD] = { get: { responses: {} } };
    received.components.schemas.RetailUnreadCount = JSON.parse(
      JSON.stringify(schema),
    );
    delete received.components.schemas.RetailUnreadCount.properties
      .latestNotificationId;
    expect(
      checkDraftSurvival(
        mergeDrafts(received, DRAFTS.retail).merged,
        DRAFTS.retail,
      ),
    ).toEqual(["`RetailUnreadCount.latestNotificationId` 사라짐"]);
    expect(SNAPSHOTS.retail.paths[RETAIL_UNREAD]?.get).toEqual(op);
  });

  it("빈 BE 스펙과 합치면 op, RetailUnreadCount, ErrorResponse 참조까지 들어오고 검사가 빈 배열이다", () => {
    const { merged, kept } = mergeDrafts(emptyReceived(), DRAFTS.retail);
    expect(kept).toContain(`GET ${RETAIL_UNREAD}`);
    expect(merged.components.schemas.RetailUnreadCount).toBeDefined();
    expect(checkDraftSurvival(merged, DRAFTS.retail)).toEqual([]);
  });

  it("가짜 스펙: BE 가 kind, backorderId 없는 ChatChoice, notListed 없는 ChatInquiry 를 내면 칸 3개 사라짐으로 실패한다", () => {
    for (const app of ["retail", "wholesale"]) {
      const received = emptyReceived();
      for (const name of ["ChatChoice", "ChatInquiry", "ChatAutoReply"]) {
        received.components.schemas[name] = JSON.parse(
          JSON.stringify(DRAFTS[app].components.schemas[name]),
        );
      }
      delete received.components.schemas.ChatChoice.properties.kind;
      delete received.components.schemas.ChatChoice.properties.backorderId;
      delete received.components.schemas.ChatInquiry.properties.notListed;
      const { merged } = mergeDrafts(received, DRAFTS[app]);
      expect(checkDraftSurvival(merged, DRAFTS[app]).sort(), app).toEqual(
        [
          "`ChatChoice.backorderId` 사라짐",
          "`ChatChoice.kind` 사라짐",
          "`ChatInquiry.notListed` 사라짐",
        ].sort(),
      );
    }
  });

  it("가짜 스펙: 병합 뒤 unread-count op 가 빠지면 사라짐으로 실패한다", () => {
    const { merged } = mergeDrafts(emptyReceived(), DRAFTS.retail);
    delete merged.paths[RETAIL_UNREAD];
    expect(checkDraftSurvival(merged, DRAFTS.retail)).toEqual([
      `GET ${RETAIL_UNREAD} 사라짐`,
    ]);
  });

  it("기존 op 는 안 바뀐다: 소매 스냅샷의 알림 경로는 새 op 하나뿐, 도매 스냅샷에는 retail 경로 없음", () => {
    expect(
      Object.keys(SNAPSHOTS.retail.paths).filter((p) =>
        p.includes("/notifications"),
      ),
    ).toEqual([RETAIL_UNREAD]);
    expect(
      Object.keys(SNAPSHOTS.wholesale.paths).filter((p) =>
        p.startsWith("/api/retail/"),
      ),
    ).toEqual([]);
  });
});
