import type { RequestHandler } from "msw";
import spec from "../../../openapi/wholesale.json";
import { handlersFromSpec } from "../handlers";
import type { OpenApiDocument } from "../openapi";
import { productHandlers } from "./product";

/**
 * 도매 목 전체. **순서가 규칙이다** — 앞이 이긴다.
 *
 * 1. BE 스텁을 옮긴 feature별 example (`./product` …). 값이 의미 있는 것
 * 2. 스냅샷에서 자동 생성한 뼈대. 나머지 경로 전부, 타입은 맞고 값은 기본값
 *
 * 여기 없는 경로는 worker가 `bypass`로 실서버에 흘린다.
 */
export const wholesaleHandlers: RequestHandler[] = [
  ...productHandlers,
  ...handlersFromSpec(spec as unknown as OpenApiDocument),
];
