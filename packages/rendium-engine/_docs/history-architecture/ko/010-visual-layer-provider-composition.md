# 011. VisualLayer + DrawableProvider 합성 (Composition)

[English](../en/010-visual-layer-provider-composition.md)

상태: 승인 및 구현 완료 (Accepted and implemented)

## 맥락 (Context)

Minimal layer model의 목표는 엔진 레이어 정체성을 `visual`, `audio`, `control` 세 종류로 고정하는 것이다. 이전 runtime은 manifest에서는 `kind: 'visual'`을 사용하더라도 내부 구현에서 이미지, 비디오, 텍스트, 스펙트럼 도메인별 subclass를 계속 생성했다.

이 구조는 과도기 구현으로는 동작하지만, 장기적으로는 요소가 늘어날 때마다 다시 layer subclass가 늘어나는 압력을 만든다. 그러면 레이어 타입을 줄인 의사결정이 runtime에서 무력화되고, factory, tests, public export, developer mental model이 다시 도메인 중심으로 회귀한다.

## 결정 (Decision)

Visual runtime은 단일 `VisualLayer extends RenderableLayer`로 고정한다. 이미지, 비디오, 텍스트, 스펙트럼 같은 요소별 차이는 `DrawableProvider` 구현체로 주입한다.

```ts
class VisualLayer extends RenderableLayer {
  constructor(id: LayerId, provider: VisualDrawableProvider);
}

interface VisualDrawableProvider {
  readonly providerKind: string;
  setup(host: VisualLayer, device: GPUDevice, format: GPUTextureFormat): Promise<void>;
  update(
    host: VisualLayer,
    time: number,
    deltaTime: number,
    getAudioData?: (id: string) => Float32Array,
  ): void;
  draw(host: VisualLayer, context: RenderContext): void;
  updateConfig(host: VisualLayer, config: LayerConfig): void;
  getConfig?(host: VisualLayer): Partial<LayerConfig>;
  getIntrinsicSize?(host: VisualLayer): { width: number; height: number };
  getTransformDescriptor?(host: VisualLayer): BoxGeometryDescriptor;
  dispose(): void;
}
```

현재 프로바이더 매핑(provider mapping)은 다음과 같다.

| 소스 프로바이더 (source provider) | 비주얼 런타임 (visual runtime) |
| --- | --- |
| `raster`, `animated-raster`, `svg` | `VisualLayer + RasterDrawableProvider` |
| 비주얼 트랙이 있는 `video` | `VisualLayer + VideoDrawableProvider` |
| `text` | `VisualLayer + TextDrawableProvider` |
| `generated-visual` | `VisualLayer + SpectrumDrawableProvider` |

## 논거 (Rationale)

`VisualLayer`는 레이어 공통 책임을 가진다. 여기에는 id, timeline lifecycle, transform, appearance, setup state, local matrix, render ordering 참여가 포함된다.

`DrawableProvider`는 source/provider를 어떻게 해석하고 어떤 GPU resource와 draw command를 만들지 담당한다. texture upload, video frame copy, text rasterization, spectrum buffer update 같은 세부 전략은 provider 내부 구현이다.

따라서 새 visual 요소가 추가되어도 새 layer subclass를 만들지 않는다. 필요한 변경은 새 provider, provider factory branch, provider-level tests로 제한한다.

## 결과 (Consequences)

- Public engine API에서 도메인 visual layer class를 export하지 않는다.
- `RuntimeLayerFactory`는 모든 visual manifest에 대해 `VisualLayer`를 반환한다.
- `audio`와 `control`은 별도 runtime layer로 유지한다. 이들은 최소 layer model의 최상위 kind와 일치한다.
- Provider는 manifest kind, scope ownership, link policy, timeline ordering을 결정하지 않는다.
- Unsupported provider는 placeholder fallback 없이 fail-fast한다.

## 온보딩 규칙 (Onboarding Rule)

새 visual 요소를 추가할 때의 기본 질문은 “어떤 layer subclass가 필요한가?”가 아니라 “어떤 drawable representation/provider가 필요한가?”이다. 도메인 전용 visual layer class를 만들지 말고 drawable provider를 추가한다.
