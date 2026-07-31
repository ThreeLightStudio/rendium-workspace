/**
 * useEngineErrorBridge.ts — Global Engine Error → Toast Bridge
 *
 * EngineStore의 onError Pub/Sub을 구독하여 엔진에서 발생하는 모든
 * RendiumError를 Toast 알림으로 변환합니다.
 *
 * 에러 타입별 매핑:
 *   IntentValidationError → toast.warning  (잘못된 조작 안내)
 *   TransactionError      → toast.error    (작업 취소 및 롤백 안내)
 *   HardwareError         → toast.error    (치명적 오류, 영구 표시)
 *   RendiumError (기타)   → toast.error    (일반 엔진 오류)
 *
 * 사용법:
 *   최상위 컴포넌트(App.tsx 또는 StudioEditor.tsx) 내부에서
 *   useEngineErrorBridge() 를 단 한 번 호출하면 앱 전체에 적용됩니다.
 *
 * 제약:
 *   - UI 컴포넌트에서 개별 try/catch 작성 금지.
 *   - 모든 에러는 EngineStore → 이 훅 → Toast로 단일 경로 처리.
 */

import {
  HardwareError,
  IntentValidationError,
  type RendiumError,
  TransactionError,
  engineStore,
} from '@rendium/engine';
import { useEffect } from 'react';
import { useToast } from '../components/ToastSystem';
import { translate } from '../i18n/locale';

export function useEngineErrorBridge(): void {
  const { add } = useToast();

  useEffect(() => {
    const unsub = engineStore.onError((err: RendiumError) => {
      if (err instanceof IntentValidationError) {
        // 잘못된 Intent 타입 — 개발 경고 수준
        add('warning', translate('ai.unsupportedAction'), {
          message: `${translate('ai.unsupportedAction')}: ${err.intentType}`,
          duration: 4500,
        });
        return;
      }

      if (err instanceof TransactionError) {
        // 작업이 롤백됨 — 사용자에게 취소 안내
        add('error', translate('ai.applyFailure'), {
          message: translate('ai.executionFailed'),
          duration: 6000,
        });
        return;
      }

      if (err instanceof HardwareError) {
        // GPU / 오디오 치명적 오류 — 영구 표시 + 새로고침 권장
        add('error', `${translate('editor.devIntentDispatch')}: ${err.resourceType}`, {
          message: translate('ai.connectionFailed'),
          duration: Number.POSITIVE_INFINITY,
        });
        return;
      }

      // 기타 RendiumError
      add('error', translate('ai.requestFailed'), {
        message: err.message,
        duration: 6000,
      });
    });

    // 언마운트 시 구독 취소 — 메모리 누수 방지
    return unsub;
  }, [add]);
}
