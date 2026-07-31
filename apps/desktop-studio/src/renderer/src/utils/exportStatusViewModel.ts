export type ExportStatusState = 'idle' | 'exporting' | 'completed' | 'failed' | 'cancelled';

export type ExportStatusTone = 'neutral' | 'success' | 'warning' | 'error';

export type ExportStatusTranslationKey =
  | 'export.userExportingTitle'
  | 'export.userExportingMessage'
  | 'export.userCompleteTitle'
  | 'export.userCompleteMessage'
  | 'export.userFailedTitle'
  | 'export.userFailedMessage'
  | 'export.userCancelledTitle'
  | 'export.userCancelledMessage'
  | 'export.userUnknownTitle'
  | 'export.userUnknownMessage'
  | 'export.progressLabel';

export interface ExportStatusViewModel {
  state: ExportStatusState;
  userMessage: string;
  assistiveMessage: string;
  technicalMessage?: string;
  tone: ExportStatusTone;
  canShowDetails: boolean;
  progressLabel: string;
}

interface BuildExportStatusViewModelParams {
  isExporting: boolean;
  progress: number;
  status: string;
  error: string | null;
  t: (key: ExportStatusTranslationKey, vars?: Record<string, string | number>) => string;
}

function resolveExportStatusState(isExporting: boolean, status: string): ExportStatusState {
  if (status === 'Completed') {
    return 'completed';
  }

  if (status === 'Failed') {
    return 'failed';
  }

  if (status === 'Cancelled') {
    return 'cancelled';
  }

  if (isExporting) {
    return 'exporting';
  }

  return status === 'idle' ? 'idle' : 'failed';
}

function resolveTone(state: ExportStatusState): ExportStatusTone {
  if (state === 'completed') {
    return 'success';
  }

  if (state === 'failed') {
    return 'error';
  }

  if (state === 'cancelled') {
    return 'warning';
  }

  return 'neutral';
}

function resolveUserMessageKey(state: ExportStatusState): ExportStatusTranslationKey {
  if (state === 'exporting') {
    return 'export.userExportingTitle';
  }

  if (state === 'completed') {
    return 'export.userCompleteTitle';
  }

  if (state === 'failed') {
    return 'export.userFailedTitle';
  }

  if (state === 'cancelled') {
    return 'export.userCancelledTitle';
  }

  return 'export.userUnknownTitle';
}

function resolveAssistiveMessageKey(state: ExportStatusState): ExportStatusTranslationKey {
  if (state === 'exporting') {
    return 'export.userExportingMessage';
  }

  if (state === 'completed') {
    return 'export.userCompleteMessage';
  }

  if (state === 'failed') {
    return 'export.userFailedMessage';
  }

  if (state === 'cancelled') {
    return 'export.userCancelledMessage';
  }

  return 'export.userUnknownMessage';
}

function buildTechnicalMessage(status: string, error: string | null): string | undefined {
  const lines = [
    status && status !== 'idle' ? `status: ${status}` : null,
    error ? `error: ${error}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join('\n') : undefined;
}

export function buildExportStatusViewModel({
  isExporting,
  progress,
  status,
  error,
  t,
}: BuildExportStatusViewModelParams): ExportStatusViewModel {
  const state = resolveExportStatusState(isExporting, status);
  const technicalMessage = buildTechnicalMessage(status, error);
  const percent = Math.round(progress * 100);

  return {
    state,
    userMessage: t(resolveUserMessageKey(state)),
    assistiveMessage: t(resolveAssistiveMessageKey(state)),
    technicalMessage,
    tone: resolveTone(state),
    canShowDetails: Boolean(technicalMessage),
    progressLabel: t('export.progressLabel', { percent }),
  };
}
