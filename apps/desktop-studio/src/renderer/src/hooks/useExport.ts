import { BACKGROUND_CONFIG, engineStore } from '@rendium/engine';
import { useCallback, useRef, useState } from 'react';
import { WebCodecsPipeline } from '../pipeline/WebCodecsPipeline';
import {
  DEFAULT_EXPORT_SETTINGS,
  type ExportSettings,
  resolveExportProfile,
} from '../utils/exportSettings';

type RgbaColor = [number, number, number, number];

export interface ExportState {
  isExporting: boolean;
  progress: number;
  error: string | null;
  status: string;
}

export function useExport() {
  const [state, setState] = useState<ExportState>({
    isExporting: false,
    progress: 0,
    error: null,
    status: 'idle',
  });

  const pipelineRef = useRef<WebCodecsPipeline | null>(null);

  const startExport = useCallback(async (settings: ExportSettings = DEFAULT_EXPORT_SETTINGS) => {
    const snapshot = engineStore.getSnapshot();
    const scene = engineStore._internalScene;
    const clearColor = (engineStore.getManifest().projectSettings.canvas.backgroundColor ??
      BACKGROUND_CONFIG.DEFAULT_COLOR) as RgbaColor;
    const exportProfile = resolveExportProfile(settings);

    setState({
      isExporting: true,
      progress: 0,
      error: null,
      status: 'Initializing...',
    });

    try {
      const pipeline = new WebCodecsPipeline();
      pipelineRef.current = pipeline;

      await pipeline.exportVideo(scene, {
        width: exportProfile.width,
        height: exportProfile.height,
        duration: snapshot.duration,
        fps: exportProfile.fps,
        bitrate: exportProfile.bitrate,
        clearColor,
        onProgress: (p) => {
          setState((prev) => ({
            ...prev,
            progress: p,
            status: `Rendering Frame... ${Math.round(p * 100)}%`,
          }));
        },
      });

      setState((prev) => ({
        ...prev,
        isExporting: false,
        progress: 1,
        status: 'Completed',
      }));
    } catch (err) {
      console.error('[useExport] Export failed:', err);
      const message = String(err);
      const wasCancelled = /User canceled|User cancelled|canceled|cancelled/i.test(message);
      setState((prev) => ({
        ...prev,
        isExporting: false,
        error: wasCancelled ? null : message,
        status: wasCancelled ? 'Cancelled' : 'Failed',
      }));
    } finally {
      pipelineRef.current = null;
    }
  }, []);

  const cancelExport = useCallback(async () => {
    if (pipelineRef.current) {
      await pipelineRef.current.abort();
      pipelineRef.current = null;
    }
    setState({
      isExporting: false,
      progress: 0,
      error: null,
      status: 'Cancelled',
    });
  }, []);

  const resetExportState = useCallback(() => {
    setState({
      isExporting: false,
      progress: 0,
      error: null,
      status: 'idle',
    });
  }, []);

  return {
    ...state,
    startExport,
    cancelExport,
    resetExportState,
  };
}
