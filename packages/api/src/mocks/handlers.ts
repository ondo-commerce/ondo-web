import { http, HttpResponse, type RequestHandler } from "msw";
import { exampleOf } from "./example";
import {
  HTTP_METHODS,
  type OpenApiDocument,
  type OperationObject,
  type SchemaObject,
} from "./openapi";

/**
 * 스냅샷의 모든 path × method를 MSW 핸들러로 만든다.
 *
 * 첫 2xx 응답의 스키마를 {@link exampleOf}로 채워 준다. 204나 본문 없는 응답은
 * 빈 응답이다. 경로의 `{id}`는 MSW 문법 `:id`로 바꾸고, 호스트는 `*`로 둔다 —
 * 브라우저의 상대경로(`/api/...`)와 서버의 절대경로(`https://.../api/...`)를
 * 같은 핸들러가 잡아야 해서다.
 *
 * 값이 중요한 응답은 이 배열 **앞에** 덮어쓰기 핸들러를 둔다. MSW는 먼저 맞는 것을 쓴다.
 */
export function handlersFromSpec(spec: OpenApiDocument): RequestHandler[] {
  const schemas = spec.components?.schemas ?? {};
  const handlers: RequestHandler[] = [];

  for (const [path, operations] of Object.entries(spec.paths)) {
    const pattern = "*" + path.replace(/\{(\w+)\}/g, ":$1");
    for (const method of HTTP_METHODS) {
      const operation = operations[method];
      if (operation === undefined) continue;
      const success = firstSuccess(operation);
      if (success === null) continue;

      const { status, schema } = success;
      const body = schema === undefined ? null : exampleOf(schema, schemas);
      handlers.push(
        http[method](pattern, () =>
          body === null
            ? new HttpResponse(null, { status })
            : HttpResponse.json(body, { status }),
        ),
      );
    }
  }
  return handlers;
}

function firstSuccess(
  operation: OperationObject,
): { status: number; schema: SchemaObject | undefined } | null {
  for (const [code, response] of Object.entries(operation.responses)) {
    if (!code.startsWith("2")) continue;
    const media = Object.values(response.content ?? {})[0];
    return { status: Number(code), schema: media?.schema };
  }
  return null;
}
