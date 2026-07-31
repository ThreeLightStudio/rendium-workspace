# Visual Layer Provider 온보딩

[English](../en/visual-layer-provider-onboarding.md)

- **상태**: Current Implementation Guide
- **대상**: visual runtime, drawable provider, WebGPU render path를 수정하는 AI / agent / engineer
- **관련 코드**: `src/layers/visual`

## 1. 런타임 형태 (Runtime Shape)

Visual runtime은 단일 concrete layer class로 고정한다.

```ts
class VisualLayer extends RenderableLayer {
  readonly visualProvider: VisualDrawableProvider;
}
```

`VisualLayer`가 소유하는 책임:

- `kind: 'visual'`
- 변형(transform) / 외관(appearance)
- setup state
- timeline lifecycle
- 로컬 행렬(local matrix) 위임
- `updateConfig()` / `getConfig()`의 공통 layer config 병합

`VisualDrawableProvider`가 소유하는 책임:

- 소스/프로바이더 전용 리소스 라이프사이클 (source/provider-specific resource lifecycle)
- GPU 파이프라인, 텍스처, 샘플러, 버퍼 준비 (GPU pipeline, texture, sampler, buffer)
- 고유 크기 (intrinsic size)
- 프로바이더 전용 변형 기술자(transform descriptor) 또는 로컬 행렬
- 프로바이더 전용 설정 필드
- 그리기 명령 기록 (draw command recording)

## 2. 현재 프로바이더 매핑 (Current Provider Mapping)

`RuntimeLayerFactory.create(manifest)`는 visual 매니페스트를 항상 `VisualLayer`로 만든다.

| 매니페스트 조건 | 프로바이더 |
| --- | --- |
| `source.provider: 'raster'` | `RasterDrawableProvider` |
| `source.provider: 'animated-raster'` | `RasterDrawableProvider` |
| `source.provider: 'svg'` | `RasterDrawableProvider` |
| `source.provider: 'video'`, `track: 'visual'` or omitted | `VideoDrawableProvider` |
| `source.provider: 'text'` | `TextDrawableProvider` |
| `source.provider: 'generated-visual'` | `SpectrumDrawableProvider` |

지원되지 않는 프로바이더는 플레이스홀더 폴백 없이 즉시 실패(fail-fast)한다.

## 3. Visual 기능 추가 (Adding A Visual Feature)

새 visual 요소를 추가할 때 순서:

1. 기존 `SourceProviderKind`로 표현 가능한지 확인한다.
2. 필요할 때만 새 프로바이더 리터럴을 추가한다.
3. `VisualDrawableProvider` 구현체를 `src/layers/visual/providers`에 추가한다.
4. `RuntimeLayerFactory`에 프로바이더 분기를 추가한다.
5. 프로바이더 수준의 유닛 테스트와 팩토리 검증 테스트를 추가한다.

금지 사항:

- 도메인 전용 visual layer class 재도입
- 프로바이더 내부에서 timeline order, link graph, scope ownership 판단
- 소스 URL을 레이어 식별자(identity)로 판단
- app/UI dependency 임포트(import)

## 4. 프로바이더 인터페이스 (Provider Interface)

```ts
interface VisualDrawableProvider {
  readonly providerKind: string;
  initialize?(host: VisualLayer): void;
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
  getLocalMatrix?(host: VisualLayer): Float32Array;
  dispose(): void;
}
```

`initialize()`는 기본 래스터 불투명도나 스케일과 같이 프로바이더 군에 속하는 기본 visual 상태에 대해서만 사용하십시오.

## 5. 테스트 요구사항 (Test Expectations)

프로바이더 변경 시 최소 테스트 항목:

- 프로바이더 설정 하이드레이션 및 직렬화
- 고유 크기(intrinsic size) 동작
- 커스텀 변형 기술자(transform descriptor) 또는 로컬 행렬 동작
- `RuntimeLayerFactory` 프로바이더 선택
- 지원되지 않는 프로바이더의 즉시 실패(fail-fast) 동작

관련된 현재 테스트 파일:

- `src/__tests__/rasterDrawableProvider.test.ts`
- `src/__tests__/rasterLayout.test.ts`
- `src/__tests__/textDrawableProvider.test.ts`
- `src/__tests__/verification.test.ts`
