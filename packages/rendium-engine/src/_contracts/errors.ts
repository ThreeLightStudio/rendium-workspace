/**
 * errors.ts — Rendium Engine Standard Error Contracts (Phase 1)
 *
 * 이 파일은 엔진 전체에서 사용되는 표준 에러 클래스를 정의합니다.
 * 모든 커스텀 에러는 `RendiumError`를 기반으로 계층화되어 있어
 * `instanceof RendiumError` 하나로 엔진 관련 에러를 포착할 수 있습니다.
 *
 * Error Hierarchy:
 *   RendiumError
 *   ├── IntentValidationError  — 잘못된 Intent 형식/값
 *   ├── TransactionError       — 트랜잭션 롤백 시 전파
 *   └── HardwareError          — GPU/Audio 리소스 획득 실패
 */

// =============================================================================
// Base Error
// =============================================================================

/**
 * 모든 Rendium 엔진 에러의 기반 클래스.
 * `code` 필드를 통해 기계가 읽을 수 있는 에러 식별자를 제공합니다.
 */
export class RendiumError extends Error {
  /** 기계가 읽을 수 있는 에러 식별자 (e.g. 'INTENT_VALIDATION', 'TRANSACTION'). */
  public readonly code: string;
  /** 에러 발생 Unix 타임스탬프(ms). */
  public readonly timestamp: number;

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RendiumError';
    this.code = code;
    this.timestamp = Date.now();

    // Maintain proper prototype chain for `instanceof` checks in transpiled ES5.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// =============================================================================
// Intent Validation Error
// =============================================================================

/**
 * Intent 데이터가 유효하지 않을 때 IntentRouter가 throw합니다.
 *
 * 발생 조건:
 *  - 알 수 없는 intent.type이 라우터에 도달했을 때
 *  - 필수 필드(layerId 등)가 누락되었을 때
 *  - 허용 범위를 벗어난 값(opacity > 1 등)이 감지되었을 때
 */
export class IntentValidationError extends RendiumError {
  /** 검증에 실패한 intent.type 문자열. */
  public readonly intentType: string;

  constructor(intentType: string, reason: string, options?: ErrorOptions) {
    super(`[IntentRouter] Invalid intent "${intentType}": ${reason}`, 'INTENT_VALIDATION', options);
    this.name = 'IntentValidationError';
    this.intentType = intentType;
  }
}

// =============================================================================
// Transaction Error
// =============================================================================

/**
 * 트랜잭션 롤백이 완료된 후 호출부(Macro)에 전파되는 에러.
 *
 * `EngineStore.rollbackTransaction(cause)` 내부에서 생성되며,
 * 원인 에러(cause)를 체이닝하여 스택 추적이 유지됩니다.
 *
 * 호출부 처리 패턴:
 * ```ts
 * try {
 *   store.startTransaction();
 *   store.dispatchIntent(...);
 *   store.commitTransaction();
 * } catch (e) {
 *   if (e instanceof TransactionError) {
 *     // 상태는 이미 롤백 완료 — 사용자에게 알림만 표시
 *   }
 * }
 * ```
 */
export class TransactionError extends RendiumError {
  constructor(reason: string, options?: ErrorOptions) {
    super(`[EngineStore] Transaction rolled back: ${reason}`, 'TRANSACTION', options);
    this.name = 'TransactionError';
  }
}

// =============================================================================
// Hardware Error
// =============================================================================

/**
 * GPU / Web Audio API 리소스 획득 또는 조작에 실패했을 때 throw합니다.
 *
 * 발생 조건:
 *  - `navigator.gpu.requestAdapter()` 실패
 *  - `GPUDevice.lost` 이벤트 수신
 *  - Web Audio `AudioContext` 생성 실패
 *
 * Phase 4(GPU 복구)에서 이 에러를 포착하여 재초기화를 시도합니다.
 */
export class HardwareError extends RendiumError {
  /** 실패한 하드웨어 리소스 종류. */
  public readonly resourceType: 'GPU' | 'AUDIO' | 'UNKNOWN';

  constructor(resourceType: 'GPU' | 'AUDIO' | 'UNKNOWN', reason: string, options?: ErrorOptions) {
    super(`[Hardware] ${resourceType} resource failure: ${reason}`, 'HARDWARE', options);
    this.name = 'HardwareError';
    this.resourceType = resourceType;
  }
}
