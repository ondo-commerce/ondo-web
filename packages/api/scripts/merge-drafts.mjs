// 초안 병합과 병합 뒤 검사. `sync-spec.mjs`가 부르고, `merge-drafts.test.mjs`가 같은 함수를 시험한다.
//
// 따로 뺀 이유: sync-spec 은 파일을 쓰고 codegen 까지 도는 스크립트라 테스트에서 부를 수 없다.
// "BE 스펙이 들어오면 초안이 어떻게 되는가"는 순수 계산이라 여기 두고 시험한다(loop-05b S7-1).

/**
 * 키를 재귀적으로 정렬한다.
 *
 * springdoc은 같은 코드에서도 출력 순서가 흔들린다. 정렬하지 않으면 스펙이 하나도
 * 안 바뀌어도 스냅샷 diff가 나고, 그 diff에 익숙해지면 진짜 변경을 놓친다.
 */
export function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

/**
 * 받은 스펙에 없는 초안 op와 그 스키마를 합친다. 받은 스펙은 손대지 않고 새 객체를 돌려준다.
 *
 * 합치는 단위는 **path × method**다. 받은 스펙에 같은 경로·메서드가 있으면 초안을 버린다 —
 * 경로만 같고 메서드가 다르면(예: BE가 GET만 먼저 구현) POST 초안은 살린다.
 * `x-ondo-draft`가 없는 op는 받지 않고 멈춘다 — 표시 없이 섞이면 스냅샷에서 BE 것과 구분이
 * 안 된다.
 *
 * 스키마는 살아남은 초안 op가 (중첩까지 따라가) 참조하는 것만, 받은 쪽에 같은 이름이 없을 때 넣는다. 같은 이름이
 * 있으면 받은 쪽이 이긴다 — BE가 이름을 선점한 것이고, 모양이 다르면 codegen 뒤 typecheck가 잡는다.
 * 단 받은 쪽이 이겨서 **초안이 더한 칸**(속성에 `x-ondo-draft: true`)이 사라지는 건 typecheck가 못 잡는다
 * (optional 칸이라 없어도 컴파일된다). 그건 {@link checkDraftSurvival}이 잡는다.
 */
export function mergeDrafts(received, drafts) {
  const merged = { ...received, paths: { ...received.paths } };
  const kept = [];
  const dropped = [];

  for (const [path, operations] of Object.entries(drafts.paths ?? {})) {
    for (const [method, operation] of Object.entries(operations)) {
      const label = `${method.toUpperCase()} ${path}`;
      if (operation["x-ondo-draft"] !== true) {
        throw new Error(
          `${label} 에 "x-ondo-draft": true 가 없다. drafts 의 op는 전부 초안 표시가 있어야 한다.`,
        );
      }
      if (received.paths?.[path]?.[method] !== undefined) {
        dropped.push(label);
        continue;
      }
      merged.paths[path] = { ...merged.paths[path], [method]: operation };
      kept.push({ label, operation });
    }
  }

  const receivedSchemas = received.components?.schemas ?? {};
  const draftSchemas = drafts.components?.schemas ?? {};
  const schemas = { ...receivedSchemas };
  // 참조를 **끝까지** 따라간다. op가 직접 부르는 스키마만 넣으면 그 안의 `$ref`
  // (예: ChatSendResult → ChatMessage)가 빠져 codegen이 깨진다(#263, 채팅 계약이 처음으로 중첩 스키마를 들였다)
  const pending = refsIn(kept.map((k) => k.operation));
  const seen = new Set();
  while (pending.length > 0) {
    const name = pending.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    if (name in receivedSchemas) continue;
    const schema = draftSchemas[name];
    if (schema === undefined) continue;
    schemas[name] = schema;
    pending.push(...refsIn(schema));
  }
  merged.components = { ...received.components, schemas };

  return { merged, kept: kept.map((k) => k.label), dropped };
}

/**
 * 병합 결과에 초안이 약속한 것이 남았는지 본다. 사라진 것을 사람이 읽는 문장 배열로 돌려준다(없으면 빈 배열).
 *
 * 보는 것 셋:
 *  1. drafts 의 op(path × method)가 병합 결과에 있다 — 받은 쪽이 이겼어도 op 자체는 있어야 한다
 *  2. drafts 스키마에서 `x-ondo-draft: true`가 붙은 **속성**이 병합 결과의 같은 스키마에 있다.
 *     예: BE가 `ChatAutoReply`를 먼저 내면 받은 쪽이 이겨 초안의 `choices`가 조용히 사라진다(Codex 7).
 *     그 칸은 required 가 아니라 codegen 뒤에도 컴파일이 통과한다 — 화면은 칩이 안 나오는 채로 배포된다.
 *
 *  3. drafts 스키마 자체에 `x-ondo-draft: true`가 붙고 `oneOf`가 있으면 병합 결과의 같은 스키마도 `oneOf`이고
 *     갈래 수가 같으며, 초안 갈래의 `$ref`가 전부 남아 있다. 예: BE가 `NotificationTarget`을 kind, orderId,
 *     wholesalerId 를 다 optional 로 단 평평한 객체로 내면 받은 쪽이 이긴다(loop-06b Codex 13). 칸이 다 있어서
 *     2번 검사도, typecheck 도 통과한다 — 그런데 "ORDER 인데 orderId 없음"을 타입이 더는 막지 않는다.
 *
 *  4. drafts op 의 파라미터 중 `x-ondo-draft: true`가 붙은 것이 병합 결과의 같은 op 에 (이름, in 이 같게) 있다.
 *     BE 가 같은 op 를 먼저 내면 받은 쪽이 이기므로, 초안이 기존 op 에 더한 쿼리는 이 검사만 지킨다.
 *
 * 속성 단위 표시와 스키마 단위 `oneOf`만 보는 이유: drafts 에는 `ErrorResponse`처럼 BE 것을 옮겨 둔 스키마도 있다.
 * 그 모양 차이까지 막으면 BE 스펙을 받을 때마다 거짓 경보가 난다.
 */
export function checkDraftSurvival(merged, drafts) {
  const problems = [];
  for (const [path, operations] of Object.entries(drafts.paths ?? {})) {
    for (const [method, operation] of Object.entries(operations)) {
      const label = `${method.toUpperCase()} ${path}`;
      const got = merged.paths?.[path]?.[method];
      if (got === undefined) {
        problems.push(`${label} 사라짐`);
        continue;
      }
      // 4. 초안 op 에 초안이 **더한 파라미터**(`x-ondo-draft: true`)가 받은 op 에도 있다(loop-08b S1-1).
      //    예: BE 가 `chatRooms`를 filter, q 없이 먼저 구현하면 받은 op 가 이겨 두 쿼리가 조용히 사라진다.
      //    optional 쿼리라 codegen 뒤에도 컴파일은 통과하고, 화면은 조건을 보내는데 서버는 무시한다
      for (const param of operation.parameters ?? []) {
        if (param?.["x-ondo-draft"] !== true) continue;
        const kept = (got.parameters ?? []).some(
          (p) => p?.name === param.name && p?.in === param.in,
        );
        if (!kept)
          problems.push(`${label} ${param.in} \`${param.name}\` 사라짐`);
      }
    }
  }
  const mergedSchemas = merged.components?.schemas ?? {};
  for (const [name, schema] of Object.entries(
    drafts.components?.schemas ?? {},
  )) {
    for (const [prop, def] of Object.entries(schema.properties ?? {})) {
      if (def?.["x-ondo-draft"] !== true) continue;
      if (mergedSchemas[name]?.properties?.[prop] === undefined)
        problems.push(`\`${name}.${prop}\` 사라짐`);
    }
    if (schema["x-ondo-draft"] === true && Array.isArray(schema.oneOf)) {
      const got = mergedSchemas[name]?.oneOf;
      const refs = (branches) =>
        branches.map((b) => b?.$ref).filter((r) => r !== undefined);
      if (
        !Array.isArray(got) ||
        got.length !== schema.oneOf.length ||
        refs(schema.oneOf).some((r) => !refs(got).includes(r))
      )
        problems.push(`\`${name}\` oneOf 갈래 사라짐`);
    }
  }
  return problems;
}

/** 값 안의 `#/components/schemas/<이름>` 참조를 전부 뽑는다 */
function refsIn(value) {
  const names = [];
  const pattern = /"#\/components\/schemas\/([^"]+)"/g;
  for (const match of JSON.stringify(value).matchAll(pattern)) {
    names.push(match[1]);
  }
  return names;
}
