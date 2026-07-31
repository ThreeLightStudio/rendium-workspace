# Comment Conventions

[English](../en/comments.md)

이 문서는 `rendium-workspace`의 코드와 문서에 적용되는 주석 및 follow-up 기록 기준을 정의한다.

주석은 부족한 이름과 구조를 보완하는 장식이 아니다. 주석은 코드나 문서 근처에 남아야 하는 의사결정, trade-off, 제약, 후속 논의를 기록하기 위한 수단이다.

## Why와 Trade-off

주석은 코드가 무엇을 하는지 반복하기보다, 왜 그렇게 했는지와 어떤 trade-off를 받아들였는지를 남긴다.

Good:

```ts
// Keep the outer anchor pair even when the sequence is empty.
// Downstream reconciliation treats these sentinels as stable timeline bounds.
return createSequenceWithAnchors(layers);
```

Good:

```ts
// Prefer a full manifest clone here. The migration path runs at load time,
// and preserving the caller input is more important than allocation cost.
return cloneManifest(input);
```

## Follow-up 이슈

주석에 남긴 trade-off가 추가 논의, 후속 작업, 설계 결정, 또는 owner 판단을 필요로 하면 owning context의 `_docs/issues`에 내부 이슈 문서를 만들고 주석에서 참조한다.

패키지 안에서 끝나는 이슈는 패키지 `_docs/issues`에 두고, workspace-wide 또는 cross-package 이슈만 루트 `_docs/issues`에 둔다.

Good:

```ts
// Preserve the legacy timing fallback until imported v1 projects are migrated.
// Follow-up: packages/rendium-engine/_docs/issues/2026-05-17-remove-legacy-timing-fallback.md
return normalizeLegacyTiming(layer);
```

자세한 내부 이슈 작성 규칙은 (해당하는 경우) `_docs/issues`의 컨벤션을 따른다.

## What 주석

코드가 무엇을 하는지 설명하는 What 주석은 가급적 작성하지 않는다. 함수명, 변수명, 타입, 작은 함수 분리로 의도를 드러내는 것을 우선한다.

Bad:

```ts
// Add one to the index.
const nextIndex = index + 1;
```

Good:

```ts
const nextLayerIndex = currentLayerIndex + 1;
```

What 주석은 복잡한 수식, 성능상 풀어쓴 알고리즘, 외부 포맷의 특수한 좌표계처럼 코드만으로 의도를 드러내기 어려운 경우에만 허용한다.

Allowed:

```ts
// Convert from normalized device coordinates to canvas pixels.
// x: [-1, 1] maps to [0, width], y: [1, -1] maps to [0, height].
const x = ((normalized.x + 1) / 2) * canvasWidth;
const y = ((1 - normalized.y) / 2) * canvasHeight;
```

What 주석이 필요한 함수는 복잡도와 회귀 위험이 높다는 신호다. 해당 함수에는 단위 테스트나 좁은 integration test를 함께 둔다.

## 주석 대신 구조

주석이 함수의 여러 단계를 설명하기 시작하면, 먼저 작은 함수로 나눌 수 있는지 검토한다.

Bad:

```ts
// First validate the layer, then normalize its timing,
// then insert it after the selected layer.
export function prepareLayer(input: unknown, selectedLayerId: LayerId): ILayerManifest {
  // ...
}
```

Good:

```ts
export function prepareLayer(input: unknown, selectedLayerId: LayerId): ILayerManifest {
  const layer = parseLayerInput(input);
  const normalizedLayer = normalizeLayerTiming(layer);

  return placeLayerAfter(normalizedLayer, selectedLayerId);
}
```

## 문서 주석과 노트

문서에서도 같은 기준을 적용한다.

- 결정 배경, 제약, trade-off는 남긴다.
- 이미 제목과 문장으로 설명되는 내용을 다시 반복하지 않는다.
- 추가 논의나 후속 작업은 내부 이슈로 연결한다.
- 임시 메모가 오래 남을 것 같으면 문서 본문이나 내부 이슈로 승격한다.
