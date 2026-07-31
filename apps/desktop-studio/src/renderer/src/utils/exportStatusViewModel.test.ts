import { describe, expect, it } from 'vitest';
import {
  type ExportStatusTranslationKey,
  buildExportStatusViewModel,
} from './exportStatusViewModel';

const t = (key: ExportStatusTranslationKey, vars?: Record<string, string | number>) => {
  if (key === 'export.progressLabel') {
    return `${vars?.percent ?? 0}%`;
  }

  return key;
};

describe('buildExportStatusViewModel', () => {
  it.each([
    {
      title: 'initializing export',
      isExporting: true,
      status: 'Initializing...',
      error: null,
      expectedState: 'exporting',
      expectedUserMessage: 'export.userExportingTitle',
      expectedTechnicalMessage: 'status: Initializing...',
    },
    {
      title: 'rendering frame progress',
      isExporting: true,
      status: 'Rendering Frame... 42%',
      error: null,
      expectedState: 'exporting',
      expectedUserMessage: 'export.userExportingTitle',
      expectedTechnicalMessage: 'status: Rendering Frame... 42%',
    },
    {
      title: 'completed export',
      isExporting: false,
      status: 'Completed',
      error: null,
      expectedState: 'completed',
      expectedUserMessage: 'export.userCompleteTitle',
      expectedTechnicalMessage: 'status: Completed',
    },
    {
      title: 'failed export',
      isExporting: false,
      status: 'Failed',
      error: 'WebGPU device not found',
      expectedState: 'failed',
      expectedUserMessage: 'export.userFailedTitle',
      expectedTechnicalMessage: 'status: Failed\nerror: WebGPU device not found',
    },
    {
      title: 'cancelled export',
      isExporting: false,
      status: 'Cancelled',
      error: null,
      expectedState: 'cancelled',
      expectedUserMessage: 'export.userCancelledTitle',
      expectedTechnicalMessage: 'status: Cancelled',
    },
    {
      title: 'unknown export state',
      isExporting: false,
      status: 'Paused by host',
      error: null,
      expectedState: 'failed',
      expectedUserMessage: 'export.userFailedTitle',
      expectedTechnicalMessage: 'status: Paused by host',
    },
  ])(
    'maps $title to user-facing and technical layers',
    ({
      isExporting,
      status,
      error,
      expectedState,
      expectedUserMessage,
      expectedTechnicalMessage,
    }) => {
      const viewModel = buildExportStatusViewModel({
        isExporting,
        progress: 0.42,
        status,
        error,
        t,
      });

      expect(viewModel.state).toBe(expectedState);
      expect(viewModel.userMessage).toBe(expectedUserMessage);
      expect(viewModel.progressLabel).toBe('42%');
      expect(viewModel.technicalMessage).toBe(expectedTechnicalMessage);
      expect(viewModel.canShowDetails).toBe(true);
    },
  );

  it('hides technical details for idle state', () => {
    const viewModel = buildExportStatusViewModel({
      isExporting: false,
      progress: 0,
      status: 'idle',
      error: null,
      t,
    });

    expect(viewModel.state).toBe('idle');
    expect(viewModel.canShowDetails).toBe(false);
    expect(viewModel.technicalMessage).toBeUndefined();
  });
});
