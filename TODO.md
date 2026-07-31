# Pre-Open-Source Cleanup TODO

> 공개(공개 직전) 시점까지 반드시 정리할 작업 목록. 항목은 작업이 끝나면 체크하고,
> 끝난 것은 커밋으로 이 폴더 밖으로 내보낸다. 결정이 필요한 항목은 마지막
> "Decisions" 섹션에 별도로 모았다.

목표는 **"기존 제품을 통째로 공개하되, 불필요한 UI/기능을 과감히 떼어낸다"**다.
아키텍처 재설계가 아니라 표면 정리(surface trimming)에 가깝다.

---

## 1. 죽은 참조 / 스캐폴드 잔재 (작음, 먼저)

외부 독자가 보면 당황하는 작은 잔재들. 런타임에 영향 없음.

- [x] `apps/desktop-studio/package.json`
  - `homepage: "https://electron-vite.org"` → 필드 삭제 (URL 미정)
  - `description: "An Electron application with React and TypeScript"` →
    `"Electron app shell showcasing @rendium/engine (declarative audio-reactive video graphics)."` 로 교체
- [x] `apps/desktop-studio/src/main/index.ts`
  - `ipcMain.on('ping', () => console.log('pong'))` 디버그 핸들러 + 위 주석 삭제
- [x] 루트 `package.json`
  - `dev:demo` / `build:demo` / `preview:demo` 스크립트 삭제
    (존재하지 않는 `demo-web` 패키지를 가리킴)
- [x] `_docs/portfolio/`
  - README 언급 없음 확인, 빈 폴더 통째 삭제 (남은 폴더: `architecture-decisions`, `conventions`)

## 2. `.gitignore` 보강 (1과 동시 진행)

- [x] `graphify-out/` 디렉토리 통째로 추가 — 사용자 처리 완료 (코멘트 `# graphify` 포함)
- [x] 확인: `.pnpm-wrapper`는 이미 ignore됨, `storybook-static/` ignore 확인 필요 (현 상태 유지)

## 3. 언커미티드 변경 정리 (결정 후 진행) — 사용자 별도 진행

- [x] `AGENTS.md`의 "Graphify" 섹션 (+12줄, 미커밋) — 사용자가 직접 결정/처리
  - **A. 유지**: `graphify update`를 `pnpm verify` 일부로 묶고,
    `graphify-out/`이 로컬 전용임을 §2에서 정리한 뒤 커밋
  - **B. 되돌리기**: `git restore AGENTS.md`. Graphify를 당장 안 쓸 거면 더 깔끔

## 4. `apps/desktop-studio` 표면 다듬기 (가장 큰 작업)

데스크톱 앱은 **엔진 시연 + WebCodecs 익스포트 파이프라인**만 남기고
피벗 이전의 제품 UI는 과감하게 뺀다. 후보들은 **서로 결합된 번들** 단위로 묶을
수 있어 한 번에 한 번들씩 PR로 빼는 게 안전하다.

### 번들 A: Style Blocks (좌측 사이드바) — ✅ 완료

가장 최근 추가된 표면 (`c62f1ac feat: add project duplication...` 커밋).
자체 캔버스 컴포넌트 스왑 컴포넌트로, "프리셋 갤러리" 성격. **100% 자기완결적**.

- [x] `components/StyleBlocksSidebar.tsx` 삭제 (497줄)
- [x] `components/StyleBlocksSidebar.verify.test.tsx` 삭제
- [x] `components/StudioEditor.tsx` — import 1줄, 마운트 1줄 제거
- [x] `stores/canvasStore.ts` **통째 삭제** (228줄) — `swapCanvasComponent` + 3개
  `*_PRESETS` + 3개 type이 모두 StyleBlocks 전용. 다른 사용처 없음 (검증됨)
- [x] `canvasStore` 참조하는 다른 story/test 점검 (없음)

**검증 결과** (2026-06-07):
- `pnpm exec biome check StudioEditor.tsx` — 통과
- `pnpm --filter desktop-studio typecheck` (node + web) — 통과
- `pnpm exec vitest run` — 199/203 통과. 4개 실패는 `HoverOverlay.test.tsx`의
  **사전 회귀** (clean main에서도 동일하게 실패, 본 번들과 무관)
- `rg` 재스캔 — Style Blocks/canvasStore 잔여 reference 0건
- diff stat: -948 / +106 (TODO.md §4 재구성 포함), 코드 변경은 실질 -917

### 번들 B: Lobby + Workflow (가장 큰 rip-out)

Lobby는 `App.tsx`의 분기 한 쪽 전체(`activeProjectId === null`)이고,
Workflow는 Lobby에서 새 프로젝트를 시작할 때 쓰는 모달 시스템. **둘이 강하게 결합**.

제거 시 영향:
- [x] `components/Lobby*` (3파일: `.tsx`, `.test.tsx`, `.stories.tsx`)
- [x] `components/WorkflowLibraryModal*`, `components/WorkflowWizard*` (4파일)
- [x] `workflows/` 디렉토리 통째 (workflowCatalog, lobbyWorkflowApply,
      editorWorkflowApply, workflowPresetStorage, workflowDefinitions/,
      workflowPresets/ + tests)
- [x] `App.tsx` 대폭 단순화 — Lobby 라우트 제거, `activeProjectId` 직접 세팅하는
      미니멀 데모 피커(또는 fixed project)로 대체. `lobbyWorkflowSession` 상태 제거
- [x] `StudioEditor.tsx` — `openWorkflowOnMount`, `onBackToLobby` prop 제거
- [x] `services/StorageService.ts` (프로젝트 메타 로직이 lobby와 결합)
- [x] i18n 키 일괄 정리 (lobby/workflow 관련)
- [x] `useAiQuickPromptStore` (Lobby에서 시작)

### 번들 C: AI Assistant — 진입점 차단 (코드 보존)

**전략 변경**: D5 (수요 검증) 잣대에 따라 AI Assistant는 "통째 rip-out"이 아니라
**"코드 보존 + 진입점 차단"**으로 간다. AI 액션 파서 showcase (D4)는 보존하고,
BYOK 채팅/퀵프롬프트 표면은 사용자가 닿을 수 없게 만든다. 추후 사용자 피드백이
생기면 비교적 적은 비용으로 부활 가능.

**차단할 진입점 (4곳)**:
- [x] `components/RightPanel.tsx:196` — `<AiChatPanel>` 마운트 라인 + import 제거
- [x] `App.tsx` (또는 메인 메뉴) — AI 설정 진입 버튼/메뉴 제거 또는 disabled
- [x] `main/index.ts:7` — `registerAiChatBridge()` 호출 라인 + import 제거
- [x] `preload/index.ts:93` — `aiChat: { ... }` API surface 객체 통째 제거
      (또는 stub으로 교체, 타입은 `preload/index.d.ts`에서 제거)

**보존 (dead code, `@deprecated` JSDoc 박아두기 — "AI Assistant disabled in OSS build (Bundle C); see TODO.md")**:
- `components/AiChatPanel*`, `AiQuickPromptManagerModal*`, `AiActionPreview*`
- `ai/` 디렉토리 전부 (D4의 `aiActionParser`, `aiJsonEnvelope` showcase 가치 그대로)
- `main/aiChatBridge.ts`, `aiChatProviders.ts`, `aiChatSettings.ts`
- `shared/aiChat.ts` (타입은 `aiActionParser` showcase가 의존하므로 보존)
- `useAiChatStore`, `useAiQuickPromptStore`
- 모든 관련 테스트 / Storybook

**검증 시 주의**: dead code가 tree-shake 안 되면 번들 사이즈에 영향. Renderer는
진입점이 0이므로 실제 사용 경로에서 import가 사라져 tree-shake 가능. Main은
`registerAiChatBridge` 호출 제거로 IPC 핸들러가 등록 안 되어 dead code가 됨.

### 번들 D: Asset Management — 과한 표면 제거 + 최소 Source 레지스트리 보존

**전략 변경**: D5 (수요 검증) + 가치 #4 (프로젝트별 imported 미디어 메타데이터)에 따라
"통째 rip-out"이 아니라 "과한 표면 제거 + 최소 Source 레지스트리 보존"으로 간다.

엔진 측 `Layer.source = { sourceId, sourceUrl }` 모델은 layer manifest에 직접
들어가고, 데스크톱 측 `useProjectAssetsStore`(1322줄)는 그 위의 **추가 레이어**다.
이 추가 레이어의 무거운 부분(검색/미리보기/이름변경/메타데이터 수동 편집/AI 메타
추천/오디오 분석/썸네일)은 과함. 그러나 **파일 복사 + content hash + 영구 경로
매핑**이라는 **바닥**은 프로젝트 저장/재로드를 위해 필수다 (없으면 재시작 시
모든 파일 참조 깨짐 → D5 #2 "빠름" 위반).

**최소 Source 레지스트리가 책임질 것** (보존, ~100~300줄로 슬림화):
- 파일 import 시 `user-data/projects/<projectId>/media/`에 복사
- `sourceId → { persistedPath, contentHash, mimeType, size }` 매핑 (JSON 영구화)
- layer manifest의 `source.sourceUrl`은 영구 경로로 채워짐
- 재시작 시 content hash로 변경 감지 (있으면 그대로, 없으면 "missing" 마크)

**제거 (과한 표면, Bundle D의 원래 rip-out 대상 그대로)**:
- [x] `components/AssetsPanel*` (asset 라이브러리 패널)
- [x] `components/AssetUploadDropzone*` (대형 dropzone — 단순 + 버튼으로 대체)
- [x] `components/ImageControlPanel*`, `components/ImageLayerPickerModal*`
- [x] `components/ImageToolsPanel*`, `components/AudioSourceListView*`
- [x] `components/Inspector/*` 중 image-source picker 관련 모달
- [x] `services/StorageService.ts` (Lobby와 결합 — 번들 B와 동기화)
- [x] `useProjectAssetsStore.ts`의 search/CRUD/AI 통합 부분 (대부분 1322줄)
- [x] `main/projectAssetPaths.ts` + `main/index.ts`의 `project-assets:*` IPC 핸들러 3개
- [x] `RightPanel.tsx` — `AssetsPanel` 마운트 제거
- [x] `App.tsx` — `useProjectAssetsStore` 사용 제거

**최소 보존 (재설계/슬림화 대상)**:
- [x] `services/projectAssetFilesystem.ts` (51줄) — `storeProjectAssetFile`, `deleteProjectAssetFile` 만
- [x] `services/projectAssetsStorage.ts` (212줄) — `loadProjectAssets`, `saveProjectAssets` 만
- [x] `stores/useProjectAssetsStore.ts` → **재설계**: 검색/미리보기/CRUD/오디오 분석/AI 메타 추천
      전부 제거. `ingestFile(file): Promise<{ sourceId, persistedPath, contentHash, mimeType, size }>` +
      `markMissingByHash` 정도의 슬림 API로 교체 (목표 ≤ 200줄)
- [x] `main/projectAssetPaths.ts` (112줄) — `project-assets:resolve` 만 남김

**용어 (사용자 답변에 따라 검토)**: "Asset"이라는 UI/문서 용어가 외부 독자 입장에서
"재무 자산" 등으로 오해될 소지 있음. D5 가치 4번 "프로젝트별 imported 미디어"로
재정렬. UI 라벨 / 타입 이름 / 스토어 접두 / i18n 키 일괄 검토는 Bundle D PR에 포함.

**검증 시 주의**:
- 슬림화된 스토어가 `imageAssetCommands` 등에서 import되던 부분 정리 필요
- `addImageAssetToScene` 등 product command들이 새 API에 적응하는지 확인

### 번들 E: Guided Wizard (작음, 번들 B에 흡수)

- [x] `components/GuidedWizardModal*` — Lobby에서만 호출되므로 번들 B에 포함
- [x] 별도 PR 불필요

### 번들 F: Misc 모달 정리 (번들 A~D 진행 중 opportunistic)

- [x] `views/Modals/ExportProgress.stories.tsx`, `ExportSettings.stories.tsx` —
      점검 완료: 두 파일 모두 대상 컴포넌트(ExportModal, ExportSettingsModal) 살아있음 → 보존
- [x] `views/Modals/*` 일괄 sweep — 해당 디렉토리는 위 2파일만 존재, 죽은 참조 없음

### 4.7 Electron main — 트림 (번들 C·D와 동기화)

- [x] `main/aiChatBridge.ts` 등 AI 관련 → 번들 C
- [x] `main/appUpdateBridge.ts` + `electron-updater` 의존성 —
      삭제 완료. appUpdateBridge.ts / shared/appUpdates.ts / AppUpdateButton.tsx 삭제,
      preload API surface / i18n keys / package.json 의존성 전부 제거.
- [x] `main/projectAssetPaths.ts` + 관련 IPC → 번들 D

### 4.8 Storybook (번들별 opportunistic)

- [x] 결정: 공개 릴리스에 Storybook 포함 — **살림** (PoC 컴포넌트 카탈로그)
- [x] 각 번들 PR에서 해당 컴포넌트의 `.stories.tsx` 동시 삭제
      → MainEditor.stories.tsx에서 WorkflowLibraryModalOpen·WorkflowWizardOpen 제거
      → viewsStoryFixtures.ts에서 WORKFLOW_DRAFT_ASSETS 제거
- [x] 확인: `storybook-static/` 빌드 산출물 미커밋 여부 — apps/desktop-studio/.gitignore에 등록됨 ✅

### 4.9 문서 / 메타 (마지막)

- [x] `apps/desktop-studio/README.md`를 **D5 포지셔닝** (무료 / 완전 로컬 /
      로그인 없음 / 프로젝트별 imported 미디어 메타데이터) 프레이밍으로
      재작성 (현재 톤은 상용 제품에 가까움)
- [x] 브랜드명: `Rendium Studio` → **`Rendium Desktop Studio`**
      (이 OSS는 데스크톱 앱용이므로 데스크톱임을 이름에 명시)
- [x] `appUserModelId`: `com.rendium.studio` → **`com.rendium.desktop.studio`**
- [x] 권리자 표기: `Rendium Contributors` 유지
- [x] 코드/문서/i18n/번역된 xattr 명령어까지 일괄 적용

### 4.10 Timeline UX 폴리시 (v1 필수 — 옵션 A)

`PackedStrandScrubber` (1824줄) + `TimeRulerCanvas` (269줄)는 도메인 특화
구현이라 오픈소스 라이브러리 교체는 **공수가 낮지 않음** (xzdarcy/react-timeline-editor
등은 오디오 파형 / packed strand / domain-aware hit test를 제공 안 함).
D5 평가 기준에 따라 v1에서는 **교체하지 않고 UX 폴리시만** 진행하고, 진짜
pain point인지 사용자 피드백으로 검증한 뒤 v1.1+ 에서 교체 여부 결정.

- [x] drag affordance 시각화 (segment grab cursor + hover highlight 일관화)
- [x] 빈 상태 / 0-layer 상태 메시지 다듬기 (이미 `timeline.emptyProject` i18n 키 존재 — 시각적 강조 부족)
- [x] selected segment → inspector 단축키 (`Enter` 또는 `Space`) — modal 한 단계 건너뛰기
- [x] zoom 키보드 단축키 (`+` / `-` / `0`) 툴팁 추가
- [x] README "Known limitations" 섹션에 "Timeline UX is currently an active iteration area;
      see TODO.md §4.10" 한 줄 명시 (D5의 "수요 검증 후 결정" 정신과 정합)

### 번들 작업 순서 추천

1. **번들 A (Style Blocks)** — 자기완결, 1 PR. 패턴 검증용.
2. **번들 B (Lobby + Workflow)** — `App.tsx` 단순화, 가장 큰 rip-out.
3. **번들 C (AI Assistant 진입점 차단)** — 코드 보존, 진입점 4곳 차단. 공수 4~6시간.
4. **번들 D (Asset 과한 표면 제거 + 최소 Source 레지스트리 슬림화)** — UI/svc는 rip-out,
   `useProjectAssetsStore`는 슬림 API로 재설계.
5. **번들 E (Guided Wizard)** — B에 흡수.
6. **번들 F (Misc)** — opportunistic.
7. **§4.7 main 트림 잔여** — 별도 PR.
8. **§4.8~4.9 문서/메타** — 마지막.

각 PR 끝에 `pnpm check` (Biome) + `pnpm --filter desktop-studio typecheck` +
관련 테스트(`vitest`)를 돌려 회귀 없음을 확인.

## 5. CI / 커뮤니티 기본 (오픈소스 독자가 기대하는 것)

- [x] `.github/workflows/ci.yml` 추가 — `pnpm install && pnpm verify` (push/PR 트리거)
- [x] `CONTRIBUTING.md` 추가 — `pnpm verify` + `AGENTS.md` 패키지 경계 가이드 링크
- [x] (선택) `.github/ISSUE_TEMPLATE/bug.yml` + `feature_request.yml`

## 6. 라이선스 / 메타 스윕 (릴리스 태그 직전, 마지막)

- [x] 모든 패키지 `license: "MIT"` 일관성 확인, `Rendium Contributors` 표기 통일
- [x] 하드코딩된 API 키/토큰/텔레메트리 엔드포인트 재스캔 (현재 pass에서 없음,
      §4 트림 후 재확인)
- [x] 버전 결정: `0.1.0`

---

## 7. 깃허브 리포 자체 셋업 (§4.9 + §11.2 끝난 다음 진행)

공개 직전 외부 기여자/관찰자가 "이 리포 신뢰할 만한가?" 평가할 때 필요한
표준 메타. 한 PR로 묶어서 끝낼 수 있는 작은 작업 묶음. **순서: §4.9 브랜드
결정 + §11.2 "영상 메모장" UX 마무리 끝난 뒤 진행.**

- [ ] `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 표준
- [ ] `SECURITY.md` — 취약점 비공개 신고 채널 (security@ 또는 GH private disclosure)
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` — 변경 요약 / CI 체크 / 관련 이슈
- [ ] 깃허브 Issue 라벨 세트 등록 (`bug`, `enhancement`, `good first issue`,
      `help wanted`, `docs`, `question`, `duplicate`, `wontfix`)
- [ ] 깃허브 Discussions 활성화 (Q&A / Ideas / Show and tell)
- [ ] `main` 브랜치 protection: CI 통과 + 1 approve 필수
- [ ] `.github/dependabot.yml` — 의존성 자동 PR
- [ ] `.github/CODEOWNERS` — 패키지별 오너
      (`/packages/rendium-engine/`, `/packages/agent-tools/`,
      `/apps/desktop-studio/`, `/.github/`)

## 8. 바이너리 배포 — 자체 호스팅 사이트 (릴리스 산출물)

"사용자가 받아서 쓸 수 있는 상태"의 본체. **채널: 깃허브 Releases가 아닌
자체 호스팅 사이트** (사용자 결정, 2026-06-08).

- [ ] macOS DMG 빌드 검증 (`pnpm build:studio:mac`, 실기기에서 실행)
- [ ] Windows NSIS 빌드 검증 (`pnpm build:studio:win`)
- [ ] Linux 빌드 — AppImage / .deb / .rpm 중 타깃 결정
- [ ] **Apple Developer ID / 공증(notarization) 정책 결정** — 자체 사이트
      호스팅이므로 macOS Gatekeeper 경고 회피 필요성 검토 (아래 별도 결정)
- [ ] Windows 코드 사이닝 cert 정책 (SmartScreen 경고 회피)
- [ ] 자체 호스팅 사이트 인프라 결정 (정적 호스팅? CDN? 다운로드 매니페스트?)
- [ ] 다운로드 페이지 — 버전별 DMG / NSIS / AppImage / SHA256 해시 제공
- [ ] 업데이트 메커니즘 결정 (§4.7에서 electron-updater 제거됨) —
      자체 사이트에서 "최신 버전" 안내 vs GitHub Releases 보조 사용

### 8.1 Apple Developer ID / 공증 결정 (열린 결정)

자체 사이트에 DMG를 올리려면 macOS Gatekeeper를 통과해야 사용자 경험이 깨끗함.
선택지:

| 옵션 | 비용 | 사용자 경험 | 비고 |
|---|---|---|---|
| **A. Apple Developer Program 가입 + 공증** | $99/년 | DMG 더블클릭 → 바로 실행 | "확인되지 않은 개발자" 경고 없음 |
| B. 미서명 DMG + `xattr -cr` 안내 | $0 | 첫 실행 차단 → 우클릭 → 열기 | 이탈률 ↑, README/릴리스 노트에 정직하게 명시 필요 |
| C. Apple Developer ID 없이 ad-hoc 서명 | $0 | 동일하게 Gatekeeper 경고 | B와 사실상 동일 |

**D 권장안**: 첫 릴리스(v0.1.0)는 **B로 시작** (사이드 프로젝트 예산 고려),
릴리스 노트와 README에 우회 방법을 명시. 사용자 피드백 보고 1.0 시점에 A 재검토.

## 9. 발견성 — README 시각 자료 (YouTube 영상)

현재 README는 텍스트뿐. 발견성 = 첫 5초. **YouTube 영상 임베드** (사용자 결정, 2026-06-08).

- [ ] YouTube 영상 촬영 — 추천 구성 (각 30~60초):
  - (1) **앱 시연 영상**: 빈 프로젝트 → 미디어 import → 타임라인 → 오디오 리액티브
        효과 → MP4 익스포트 (메인 README + AGENTS.md 임베드)
  - (2) **아키텍처 한 컷**: 엔진 / 앱 셸 / 에셋 파일시스템 3계층을 30초로 설명
        (README §1 위)
  - (3) **"영상 메모장" UX 데모**: cold start → 마지막 프로젝트 자동 복원 → 편집 → 종료
        (D5 / §11 포지셔닝 보강)
- [ ] README.md / README.ko.md 상단에 영상 임베드 (썸네일 + 클릭)
- [ ] YouTube 영상 설명란에 깃허브 링크 + 설치 명령어
- [ ] 한국어/영어 자막 (또는 두 채널 운영)
- [ ] 깃허브 토픽: `video-editor`, `electron`, `webcodecs`, `webgl`,
      `audio-reactive`, `react`, `typescript`, `local-first`

## 10. 보안 / 법적 — 1회성 정직 점검 (릴리스 직전)

공개 전 1회만 돌리면 됨. §6 시크릿 스캔보다 **더 넓은 범위**.

- [ ] **하드코딩 시크릿 재스캔** — §6의 좁은 스캔을 Bundle C/D 이후
      `useProjectAssetsStore` 슬림화 변경분까지 포함해 재실행. 도구:
      `git log -p --all -S "sk-"`, `-- "AKIA"`, `-- "BEGIN PRIVATE KEY"`
- [ ] **서드파티 라이선스 감사** — `pnpm licenses list`로 MIT/Apache/BSD 외
      GPL/AGPL/SSPL/LGPL이 섞여있지 않은지. WebCodecs / mp4-muxer / Zustand /
      Immer / Panda CSS / Storybook / Biome / Electron / electron-builder / lucide-react
      전부 확인. 산출물: `THIRD_PARTY_NOTICES.md` 또는 `NOTICE` 파일 생성
- [ ] **수집/원격통신 여부** — telemetry, analytics, Sentry, auto-update
      엔드포인트, Google Analytics, Mixpanel 전부 off 확인
- [ ] **`.env`, 시크릿 파일 커밋 여부** —
      `git log --all --diff-filter=A -- '*.env' '*.pem' '*.key' '*.p12'`
- [ ] **소스 라이선스 헤더** (선택) — `// SPDX-License-Identifier: MIT` 같은
      헤더를 소스 상단에 박을지 결정
- [ ] **개인정보처리방침** — 수집 0이라면 README에 "no data collection" 1줄 명시

---

## Decisions log (open)

- **D1 — 공개 범위**: 풀 제품을 다듬어 공개 (피벗 전 분석의 ①번).
  데스크톱 앱은 유지하되 워크플로우/로비/AI 채팅 표면을 축소.
- **D2 — `graphify-out/`**: 전부 gitignore. Graphify AGENTS.md 추가는 §3에서 결정.
- **D3 — Storybook**: 살리는 쪽 추천. (커밋은 별도 결정)
- **D4 — AI 액션 파서**: `aiActionParser` / `aiJsonEnvelope`는 PoC showcase로
  가치가 큼. 데스크톱 채팅은 빼더라도 이 두 파일은 보존/추출.
- **D5 — 공개 포지셔닝 (Rendium Desktop Studio가 1차 공개 산물)**:
  `apps/desktop-studio`(Rendium Desktop Studio)가 1차 공개 산물. `@rendium/engine`은
  그 위에 실리는 부수적 공개 SDK. §4 평가 기준은 **유저 수요 검증** — 수요 검증
  안 된 기능은 기본적으로 제거. 핵심 가치 4가지:
  1. 완전 로컬 (서버 0원)
  2. 빠르고 가벼움 (열자마자 편집)
  3. 로그인 불필요 (강조)
  4. 가져온(imported) 미디어 파일의 로컬 영구화 및 자동 경로 매핑
  전략: 무료 + 오픈소스 먼저 공개, 수익화는 사용자 피드백 보고 결정.
  시장 수요 미미 + AI 시대 100일 투자분 회수 불가라는 사전 분석이 근거.

## 작업 순서 추천

1. §1, §2, §3 — 한 PR로 묶어서 "잔재/메타 정리" (저위험, 빠른 머지)
2. §4 — 별도 PR, 컴포넌트 단위로 쪼개서 (한 번에 다 빼면 diff가 너무 커짐)
3. §5 — 별도 PR, CI부터 (이후 §4 작업의 안전망)
4. §6 — 릴리스 직전, 최종 점검
5. §11.2 — "영상 메모장" UX 마무리 (cold start 측정 + "새 프로젝트" 버튼)
6. §7 — 깃허브 리포 셋업 (한 PR, 30분~1시간)
7. §10 — 보안/법적 1회성 정직 점검
8. §8 — 바이너리 빌드 + §8.1 Apple Developer ID / 공증 결정
9. §9 — YouTube 영상 촬영 + 임베드
10. v0.1.0 태그 + 자체 호스팅 사이트 다운로드 페이지 공개

---

## 11. "영상 메모장" 포지셔닝 — UX 전략 논의 (2026-06-07)

> 무료 오픈소스 툴로 공개. **"OS 기본 앱 메모장처럼 필수 기능만, 빠르게 켜고 저장"**
> 을 핵심 UX 원칙으로 삼는다.

### 11.1 포지셔닝 원칙

| 메모장 원칙 | 영상 편집 번역 | 현황 |
|---|---|---|
| 플러그인/확장 없음 | 에셋 라이브러리, 프리셋 없음 | ✅ 이미 제거됨 |
| 열자마자 편집 시작 | 로비/워크플로우 없음 | ✅ 이미 제거됨 |
| 파일 열기/새로 만들기만 | "프로젝트" 개념 단순화 | 🔲 미정 |
| Ctrl+S 저장 | Auto-save 또는 단순 저장 | 🔲 현황 파악 필요 |

### 11.2 스타트업 & 저장 UX

cold start 병목 순서 (Electron):

1. Main process 초기화 (IPC 핸들러 등록)
2. Renderer bundle 로딩
3. 마지막 프로젝트 복원 (assets 검증)

- [x] **실측**: cold start 시간 측정 (dev vs prod 빌드) — **완료 (2026-06-08)**
      - Prod (electron-vite preview 빌드): main-process-loaded → ready-to-show = **266ms**
      - Dev (electron-vite dev, Vite dev server): main-process-loaded → did-finish-load = **4,224ms**
      - 측정 방법: `main/index.ts`에 임시 `console.log('[cold-start] ...')` 3곳 삽입
        (main-process-loaded, ready-to-show, did-finish-load), `pnpm start` 실행 후
        Python wrapper로 spawn-to-event 시간 캡처, 측정 완료 후 instrumentation 원복
      - **결론**: prod 266ms는 매우 양호 (메모장급 기대치 충족). Dev는 16배 느리지만
        사용자 영향 없음. 추가 최적화 불필요.
- [x] **IPC 핸들러 점검**: 불필요하게 남은 핸들러 추가 제거 — **완료 (2026-06-08)**
      - `appUpdateBridge` / `electron-updater` / `AppUpdateButton`: ✓ §4.7에서 제거됨
      - `aiChatBridge.ts` (162줄, 4.4KB): **파일은 보존** (Bundle C — 코드 보존 정책)이나
        `registerAiChatBridge()`는 `main/index.ts`에서 **호출 안 됨** → 핸들러 미등록
        - 진입점 차단 확인: preload `api` 객체에 `aiChat` 키 없음, renderer는
          `window.api?.aiChat` (optional chaining)으로 graceful no-op
        - 트리쉐이크: main process에서 import만 있고 호출 없으므로 dead code
      - 활성 IPC 채널 인벤토리 (10개):
        - `file:read-array-buffer` (비디오 바이트 읽기)
        - `project-assets:store-file` / `project-assets:delete-file` (Bundle D 최소 슬림 API)
        - `video:start-export` / `video:send-frame` / `video:end-export`
        - `video:prepare-export` / `video:write-chunk` / `video:finalize-export` / `video:abort-export`
      - **결론**: 깔끔함. 추가 정리 불필요.
- [x] **Auto-save 현황 파악**: **이미 구현되어 있고 작동 중** (Bundle C 이전부터 있던 듯)
      - `StorageService.initAutoSave()` 가 `StudioEditor` 마운트 시 호출됨
        (line 72의 `useEffect` 안)
      - 트리거: `engineStore.subscribePatches()` (Immer patch 스트림, 모든 state 변경마다)
      - Debounce: `DEBOUNCE_MS = 1500` (1.5초)
      - 저장소: IndexedDB (`idbSet`)
      - Cmd+S 단축키: `useKeyboardShortcuts.ts:122`에서 `onSave?.()` 호출 → 즉시 저장
      - 상태바 표시: `saveStatus` (`'idle' | 'saving' | 'saved'`) + "저장 중" / "저장됨"
      - **결론**: §11.2 "Auto-save 현황 파악" 완전 충족. §11.1 표 4행 "Ctrl+S 저장"도 ✅.
        §11.2 마지막 항목 "Cmd+S + 상태바 '저장됨' 표시"는 **불필요** (이미 있음).

### 11.3 Asset 유지 vs 초기화 — 결정 필요

현재 구조: 파일 import 시 `user-data/projects/<projectId>/media/` 에 복사됨.

**선택지:**

| 옵션 | 동작 | 장 | 단 |
|---|---|---|---|
| **A. 프로젝트 단위 유지 (추천)** | 앱 시작 → 마지막 프로젝트 자동 복원, assets 영구 보존 | 사용자 신뢰, 재작업 없음 | 프로젝트 폴더 누적 |
| B. 세션 기반 초기화 | 앱 시작 → 항상 빈 타임라인, media/ 자동 삭제 | 항상 깨끗한 시작 | **영상 편집에 치명적** — 이탈 원인 |
| C. 하이브리드 | 복원 기본 + 새 프로젝트 시 삭제 여부 선택 | 유연성 | UI 복잡도 증가 |

**결론 (잠정)**: **A 채택**. "메모장처럼 가볍다"는 UI/UX의 가벼움이지,
데이터 휘발성이 아님. 현재 `projectId` 기반 구조가 이미 A를 지원함.

- [ ] **추후 추가 가능**: 오래된 프로젝트 폴더 정리 기능 (설정 → "미사용 프로젝트 삭제")

### 11.4 다음 세션 실행 항목

- [x] cold start 시간 실측 (prod 빌드 기준) — §11.2로 이전, 266ms 측정 완료
- [x] 헤더에 "새 프로젝트" 초기화 버튼 추가 (확인 모달 포함)
- [x] auto-save 현황 파악 및 필요시 Cmd+S UX 개선 — §11.2로 이전, 이미 구현됨 확인
- [x] `main/appUpdateBridge.ts` + `electron-updater` 제거 검토 (§4.7과 연계)
- [x] 앱 메뉴바 불필요 항목 sweep
- [x] 프로젝트 단위 유지(A안) 구현 현황 확인 및 보완
